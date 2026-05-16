import type { CognitiveState, InterventionStyle } from '@shared/types'
import { openMemoryDB, dbGet, dbPut, STORE } from './db'

// ─── Schema ───────────────────────────────────────────────────────────────────

const PROFILE_KEY = 'profile' as const

interface StyleStats {
  shown:    number
  accepted: number
}

interface CogStateStats {
  shown:    number
  accepted: number
}

export interface CognitiveProfile {
  id:           typeof PROFILE_KEY
  version:      1
  updatedAt:    number
  observations: number  // total meaningful update events, used for confidence gating

  // Hour-of-day vulnerability: EMA 0-1 per hour bucket [0..23].
  // High value at hour H means the user frequently enters compulsive/reactive
  // states at that hour. Only meaningful after MIN_FOR_VULNERABILITY events.
  vulnerabilityByHour: number[]

  // Which intervention tones actually work for this user.
  styleStats: Record<InterventionStyle, StyleStats>

  // Persistent intervention fatigue. 1.0 = fully tolerant.
  // Drops on quick-dismiss bursts, recovers gradually across sessions.
  // Unlike gate's suppressionMultiplier (session-scoped), this persists indefinitely.
  toleranceLevel: number

  // EMA of session_context.minutes_active when the user first enters compulsive_loop.
  // Low value → escalates quickly. null until MIN_FOR_ESCALATION observations.
  escalationDepthMinutes: number | null

  // EMA of minutes spent in compulsive_loop before transitioning to a healthier state.
  // null until MIN_FOR_RECOVERY observations.
  recoveryDurationMinutes: number | null

  // Per-state intervention outcome tracking — accumulates over sessions.
  // Optional: absent in pre-existing profiles, populated on first outcome write.
  stateStats?: Partial<Record<CognitiveState, CogStateStats>>
}

// ─── EMA parameters ───────────────────────────────────────────────────────────
// Smaller α = more inertia = slower to update. Chosen to match behavioral timescales:
// vulnerability: weeks-long pattern (very slow)
// escalation/recovery: session-level (medium)

const ALPHA_VULN       = 0.08
const ALPHA_ESCALATION = 0.20
const ALPHA_RECOVERY   = 0.20

const TOLERANCE_DROP     = 0.12   // per quick-dismiss event
const TOLERANCE_RECOVERY = 0.03   // per session end (natural recovery)

// Minimum observations before derived metrics are trusted
const MIN_FOR_STYLE         = 5
const MIN_FOR_VULNERABILITY = 15
const MIN_FOR_ESCALATION    = 8
const MIN_FOR_STATE_RATE    = 5   // min shows before per-state acceptance rate is returned

// ─── Defaults ─────────────────────────────────────────────────────────────────

function blank(): CognitiveProfile {
  return {
    id:           PROFILE_KEY,
    version:      1,
    updatedAt:    0,
    observations: 0,
    vulnerabilityByHour: new Array(24).fill(0) as number[],
    styleStats: {
      gentle:     { shown: 0, accepted: 0 },
      curious:    { shown: 0, accepted: 0 },
      reflective: { shown: 0, accepted: 0 },
    },
    toleranceLevel:          1.0,
    escalationDepthMinutes:  null,
    recoveryDurationMinutes: null,
  }
}

// ─── Public read ──────────────────────────────────────────────────────────────

export async function getCognitiveProfile(): Promise<CognitiveProfile> {
  try {
    const db     = await openMemoryDB()
    const stored = await dbGet<CognitiveProfile>(db, STORE.COGNITIVE_PROFILE, PROFILE_KEY)
    return stored ?? blank()
  } catch {
    return blank()
  }
}

// ─── Derived views (confidence-gated) ────────────────────────────────────────

/**
 * Returns the intervention style with the highest empirical acceptance rate,
 * or null if fewer than MIN_FOR_STYLE observations exist for any style.
 */
export function bestStyle(profile: CognitiveProfile): InterventionStyle | null {
  const candidates = (['gentle', 'curious', 'reflective'] as InterventionStyle[])
    .map(s  => ({ s, st: profile.styleStats[s] }))
    .filter(({ st }) => st.shown >= MIN_FOR_STYLE)

  if (candidates.length === 0) return null

  return candidates.reduce((best, cur) =>
    cur.st.accepted / cur.st.shown > best.st.accepted / best.st.shown ? cur : best
  ).s
}

/** True if the given hour-of-day is an established vulnerability window. */
export function isVulnerableNow(profile: CognitiveProfile, hour: number): boolean {
  if (profile.observations < MIN_FOR_VULNERABILITY) return false
  return (profile.vulnerabilityByHour[hour] ?? 0) > 0.35
}

/** True if this user typically escalates to compulsive states within 10 minutes. */
export function escalatesFast(profile: CognitiveProfile): boolean {
  if (profile.observations < MIN_FOR_ESCALATION) return false
  return profile.escalationDepthMinutes !== null && profile.escalationDepthMinutes < 10
}

// ─── Update functions ─────────────────────────────────────────────────────────

/**
 * Called when the user accepts or dismisses an intervention.
 * Records outcome against the tone that was shown.
 */
export async function recordInterventionOutcome(
  style:        InterventionStyle,
  accepted:     boolean,
  quickDismiss: boolean,
): Promise<void> {
  await mutate(p => {
    p.observations++
    p.styleStats[style].shown++
    if (accepted) p.styleStats[style].accepted++
    if (quickDismiss) {
      p.toleranceLevel = Math.max(0, p.toleranceLevel - TOLERANCE_DROP)
    }
  })
}

/**
 * Called when a tab closes or the user navigates away.
 * Allows tolerance to recover gradually across sessions.
 */
export async function recordSessionEnd(): Promise<void> {
  await mutate(p => {
    p.toleranceLevel = Math.min(1.0, p.toleranceLevel + TOLERANCE_RECOVERY)
  })
}

/**
 * Called on each detected cognitive state transition.
 *
 * minutesActive:  session_context.minutes_active at transition time
 * prevDurationMs: how long the user was in the previous (from) state
 * nowHour:        0-23 hour-of-day at transition time
 */
export async function recordStateTransition(
  from:           CognitiveState,
  to:             CognitiveState,
  minutesActive:  number,
  prevDurationMs: number,
  nowHour:        number,
): Promise<void> {
  await mutate(p => {
    p.observations++

    // Entering a vulnerable state: raise current hour, gently decay all others
    if (to === 'compulsive_loop' || to === 'emotionally_reactive') {
      for (let h = 0; h < 24; h++) {
        const isNow = h === nowHour
        p.vulnerabilityByHour[h] = ema(
          p.vulnerabilityByHour[h]!,
          isNow ? 1.0 : 0.0,
          isNow ? ALPHA_VULN : ALPHA_VULN * 0.15,  // slow global decay
        )
      }
    }

    // Record when in the session the user first enters compulsive_loop
    if (to === 'compulsive_loop') {
      p.escalationDepthMinutes = p.escalationDepthMinutes === null
        ? minutesActive
        : ema(p.escalationDepthMinutes, minutesActive, ALPHA_ESCALATION)
    }

    // Record how long the user stayed in compulsive_loop before recovering
    if (from === 'compulsive_loop') {
      const recovMin = prevDurationMs / 60_000
      p.recoveryDurationMinutes = p.recoveryDurationMinutes === null
        ? recovMin
        : ema(p.recoveryDurationMinutes, recovMin, ALPHA_RECOVERY)
    }
  })
}

/**
 * Records the outcome of an intervention shown while in a specific cognitive state.
 * Builds a per-state responsiveness model used by the gate to personalize timing.
 */
export async function recordStateInterventionOutcome(
  state:        CognitiveState,
  accepted:     boolean,
  _quickDismiss: boolean,
): Promise<void> {
  await mutate(p => {
    if (!p.stateStats) p.stateStats = {}
    const ss = p.stateStats[state] ?? { shown: 0, accepted: 0 }
    ss.shown++
    if (accepted) ss.accepted++
    p.stateStats[state] = ss
  })
}

/**
 * Returns the per-state acceptance rate for use in gate cooldown adjustment.
 * Returns null if fewer than minShown interventions have been shown in this state.
 */
export function getStateAcceptanceRate(
  profile:  CognitiveProfile,
  state:    CognitiveState,
  minShown: number = MIN_FOR_STATE_RATE,
): number | null {
  const ss = profile.stateStats?.[state]
  if (!ss || ss.shown < minShown) return null
  return ss.accepted / ss.shown
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function ema(prev: number, obs: number, alpha: number): number {
  return alpha * obs + (1 - alpha) * prev
}

async function mutate(fn: (p: CognitiveProfile) => void): Promise<void> {
  try {
    const db     = await openMemoryDB()
    const stored = await dbGet<CognitiveProfile>(db, STORE.COGNITIVE_PROFILE, PROFILE_KEY)
    const p: CognitiveProfile = stored
      ? {
          ...stored,
          styleStats: { ...stored.styleStats },
          stateStats: stored.stateStats ? { ...stored.stateStats } : undefined,
        }
      : blank()
    p.updatedAt = Date.now()
    fn(p)
    await dbPut(db, STORE.COGNITIVE_PROFILE, p)
  } catch {
    // Non-critical — profile degrades gracefully to defaults
  }
}
