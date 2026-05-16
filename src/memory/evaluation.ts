import type { EvaluationMetrics, TrendDirection, WeeklyTrendSnapshot } from '@shared/types'
import { getCognitiveProfile } from './profile'
import { getPatterns, type PatternKey } from './index'
import { openMemoryDB, dbGetAll, STORE } from './db'

// ─── Thresholds ───────────────────────────────────────────────────────────────

// Min shows per state before per-state rate metrics are included
const MIN_COMPULSIVE_NUDGES = 5
const MIN_REFLECTIVE_SHOWS  = 5

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Derives all evaluation metrics from local IDB — no external calls, no raw events.
 *
 * Metrics measure the *quality* of behavioral change over time:
 * awareness, reflection depth, and recovery acceleration — not screen time.
 */
export async function getEvaluationMetrics(): Promise<EvaluationMetrics> {
  const [profile, patterns, db] = await Promise.all([
    getCognitiveProfile(),
    getPatterns(),
    openMemoryDB(),
  ])

  const rawSnapshots = await dbGetAll<{ week: string; snapshot: Partial<Record<PatternKey, number>> }>(
    db,
    STORE.WEEKLY_SUMMARIES,
  )
  const snapshots = rawSnapshots.sort((a, b) => a.week.localeCompare(b.week)).slice(-8)

  // ── Weekly trend deltas ───────────────────────────────────────────────────
  // Each snapshot stores *cumulative* counts. Delta = this week − previous week.
  const weeklyTrends: WeeklyTrendSnapshot[] = snapshots.map((snap, i) => {
    const prev = i > 0 ? snapshots[i - 1]!.snapshot : {}
    const delta = (key: PatternKey) => Math.max(0, (snap.snapshot[key] ?? 0) - (prev[key] ?? 0))
    return {
      week:                  snap.week,
      compulsiveEntries:     delta('compulsive_loop_entries'),
      reactiveEntries:       delta('reactive_entries'),
      recoveryTransitions:   delta('recovery_transitions'),
      postNudgeRecoveries:   delta('post_nudge_recoveries'),
      reflectiveEngagements: delta('reflective_engagements'),
      interventionsShown:    delta('interventions_shown'),
    }
  })

  // ── Base counts ───────────────────────────────────────────────────────────
  const shown    = patterns['interventions_shown']    ?? 0
  const accepted = patterns['interventions_accepted'] ?? 0
  const compulsiveNudges = profile.stateStats?.compulsive_loop?.shown ?? 0

  // ── Post-nudge recovery rate ──────────────────────────────────────────────
  // % of compulsive-state nudges followed by recovery within 15 min
  const totalPostNudge  = patterns['post_nudge_recoveries'] ?? 0
  const postNudgeRecoveryRate = compulsiveNudges >= MIN_COMPULSIVE_NUDGES
    ? Math.min(1, totalPostNudge / compulsiveNudges)
    : null

  // ── Reflective engagement rate ────────────────────────────────────────────
  // % of accepted interventions where dwell ≥ 8 s
  const totalReflective = patterns['reflective_engagements'] ?? 0
  const reflectiveEngagementRate = accepted >= MIN_REFLECTIVE_SHOWS
    ? Math.min(1, totalReflective / accepted)
    : null

  // ── Trend directions from weekly deltas ───────────────────────────────────
  const recoveryTrend   = computeTrendDirection(weeklyTrends, w => w.recoveryTransitions)
  const engagementTrend = computeTrendDirection(weeklyTrends, w => w.reflectiveEngagements)

  // ── Awareness-building proxy ──────────────────────────────────────────────
  // escalationDepthMinutes increasing = catching compulsive loops later in session
  // which means the user is sustaining intentional browsing longer before slipping.
  // We approximate the trend from the EMA value vs a reasonable baseline (10 min).
  const awarenessBuilding = (
    profile.escalationDepthMinutes !== null &&
    profile.escalationDepthMinutes > 10 &&
    weeklyTrends.length >= 2
  )

  const weeksActive = rawSnapshots.length

  return {
    weeksActive,
    totalInterventions:      shown,
    acceptanceRate:          shown > 0 ? accepted / shown : 0,
    reflectiveEngagementRate,
    postNudgeRecoveryRate,
    recoveryDurationMinutes: profile.recoveryDurationMinutes,
    escalationDepthMinutes:  profile.escalationDepthMinutes,
    toleranceLevel:          profile.toleranceLevel,
    recoveryTrend,
    engagementTrend,
    awarenessBuilding,
    weeklyTrends,
  }
}

// ─── Trend computation ────────────────────────────────────────────────────────

/**
 * Computes a qualitative trend direction by comparing last two weekly periods.
 * Uses a ≥20% change threshold to distinguish improving/declining from stable.
 */
function computeTrendDirection(
  weeks:     WeeklyTrendSnapshot[],
  getValue:  (w: WeeklyTrendSnapshot) => number,
): TrendDirection {
  if (weeks.length < 2) return 'insufficient_data'

  const recent = getValue(weeks[weeks.length - 1]!)
  const prior  = getValue(weeks[weeks.length - 2]!)

  // Avoid unstable ratios when baseline is near zero
  if (prior < 1 && recent < 1) return 'insufficient_data'
  if (prior === 0)              return recent > 0 ? 'improving' : 'insufficient_data'

  const change = (recent - prior) / prior
  if (change >= 0.20)  return 'improving'
  if (change <= -0.20) return 'needs_attention'
  return 'stable'
}
