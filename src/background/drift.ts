import type {
  CognitiveState,
  CognitiveStateTransition,
  DriftDirection,
  DriftEstimate,
  DriftTrajectory,
} from '@shared/types'

// ─── State health scores ──────────────────────────────────────────────────────
// 0.0 = most intentional/healthy, 1.0 = most reactive/escalated.
// Defines the "direction" axis for drift calculation.

export const HEALTH_SCORE: Record<CognitiveState, number> = {
  intentional_browsing:  0.00,
  exploratory_browsing:  0.20,
  passive_consumption:   0.40,
  fragmented_attention:  0.50,
  decision_fatigue:      0.60,
  compulsive_loop:       0.85,
  emotionally_reactive:  0.95,
}

// ─── Parameters ───────────────────────────────────────────────────────────────

// Transitions older than this contribute negligibly to the slope.
const ANALYSIS_WINDOW_MS = 60 * 60 * 1000   // 1 hour

// Age half-life for exponential weighting — recent transitions dominate.
const DECAY_HALF_LIFE_MS = 20 * 60 * 1000   // 20 minutes

// Below this slope magnitude we consider the trajectory "stable".
const STABLE_THRESHOLD = 0.05

// A transition with |delta| < this is treated as neutral (not counted).
const DELTA_THRESHOLD = 0.05

// Minimum transitions for non-trivial confidence.
const MIN_TRANSITIONS = 2

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyzes the transition history to detect behavioral drift.
 *
 * Uses exponentially-weighted slope over the analysis window:
 *   - Recent transitions carry full weight
 *   - Transitions older than DECAY_HALF_LIFE lose half their weight
 *   - Transitions outside ANALYSIS_WINDOW are ignored entirely
 *
 * Returns a DriftEstimate suitable for gate scaling and prompt enrichment.
 */
export function analyzeDrift(
  currentState: CognitiveState,
  history:      CognitiveStateTransition[],
  now:          number = Date.now(),
): DriftEstimate {
  const recent = history.filter(t => now - t.at <= ANALYSIS_WINDOW_MS)
  const depth  = HEALTH_SCORE[currentState]

  if (recent.length < MIN_TRANSITIONS) {
    return stable(depth)
  }

  // ── Weighted slope ──────────────────────────────────────────────────────────
  let weightedDelta    = 0
  let totalWeight      = 0
  let escalatingCount  = 0
  let recoveringCount  = 0

  for (const t of recent) {
    const age    = now - t.at
    const weight = Math.exp((-age * Math.LN2) / DECAY_HALF_LIFE_MS)
    const delta  = HEALTH_SCORE[t.to] - HEALTH_SCORE[t.from]

    weightedDelta += delta * weight
    totalWeight   += weight

    if (delta >  DELTA_THRESHOLD) escalatingCount++
    if (delta < -DELTA_THRESHOLD) recoveringCount++
  }

  const slope = totalWeight > 0 ? weightedDelta / totalWeight : 0

  // ── Velocity: health-score change per minute over the analysis window ───────
  const windowMs      = now - recent[0]!.at
  const windowMinutes = windowMs / 60_000
  const startHealth   = HEALTH_SCORE[recent[0]!.from]
  const velocity      = windowMinutes > 0.5 ? (depth - startHealth) / windowMinutes : 0

  // ── Direction ───────────────────────────────────────────────────────────────
  const isFluctuating = escalatingCount >= 2 && recoveringCount >= 2 && Math.abs(slope) < STABLE_THRESHOLD * 3
  let direction: DriftDirection
  if (isFluctuating) {
    direction = 'fluctuating'
  } else if (slope >  STABLE_THRESHOLD) {
    direction = 'escalating'
  } else if (slope < -STABLE_THRESHOLD) {
    direction = 'recovering'
  } else {
    direction = 'stable'
  }

  // ── Confidence ──────────────────────────────────────────────────────────────
  // Composed of: how many transitions (data quantity) + how strong the slope is (signal quality)
  const transitionFactor = Math.min(recent.length / 6, 1.0)
  const slopeFactor      = Math.min(Math.abs(slope) / 0.5, 1.0)
  const confidence       = Math.min(transitionFactor * 0.4 + slopeFactor * 0.6, 1.0)

  // ── Trajectory ──────────────────────────────────────────────────────────────
  const trajectory = detectTrajectory(
    recent, currentState, direction, velocity, escalatingCount, recoveringCount,
  )

  return {
    direction,
    confidence,
    depth,
    velocity:              round4(velocity),
    windowMs,
    trajectory,
    escalatingTransitions: escalatingCount,
    recoveringTransitions: recoveringCount,
  }
}

/**
 * Returns a cooldown multiplier based on the drift estimate.
 * Applied in background to suppressionMultiplier — does NOT modify gate.ts.
 *
 * < 1.0 = shorter cooldown (intervene sooner)
 * > 1.0 = longer cooldown  (back off)
 * = 1.0 = no change
 */
export function driftCooldownScale(drift: DriftEstimate): number {
  if (drift.confidence < 0.5) return 1.0

  if (drift.trajectory) {
    const scale = TRAJECTORY_SCALE[drift.trajectory]
    if (scale !== undefined) return scale
  }

  // Direction-based fallback when trajectory not named
  if (drift.direction === 'escalating' && drift.depth > 0.6) return 0.80
  if (drift.direction === 'recovering')                       return 1.60
  return 1.0
}

// ─── Trajectory detection ─────────────────────────────────────────────────────
// Checked in priority order — first match wins.

function detectTrajectory(
  history:     CognitiveStateTransition[],
  current:     CognitiveState,
  direction:   DriftDirection,
  velocity:    number,
  escalating:  number,
  recovering:  number,
): DriftTrajectory | null {
  // Recovery takes priority — don't interrupt it
  if (
    direction === 'recovering' &&
    recovering >= 2 &&
    HEALTH_SCORE[current] <= 0.4
  ) return 'recovery_in_progress'

  // Urgency spiral: emotionally_reactive appears in trajectory while escalating
  const hasEmotional = history.some(t => t.to === 'emotionally_reactive')
  if (hasEmotional && direction === 'escalating') return 'urgency_spiral'

  // Attention fragmentation: fragmented_attention dominates recent transitions
  const fragCount = history.filter(t => t.to === 'fragmented_attention').length
  if (fragCount >= 2 || (current === 'fragmented_attention' && escalating >= 2)) {
    return 'attention_fragmentation'
  }

  // Decision overload: decision_fatigue repeats
  const fatigueCount = history.filter(t => t.to === 'decision_fatigue').length
  if (
    fatigueCount >= 2 ||
    (current === 'decision_fatigue' && escalating >= 2)
  ) return 'decision_overload'

  // Rapid escalation: already deep and moving fast
  if (direction === 'escalating' && HEALTH_SCORE[current] >= 0.8 && velocity >= 0.03) {
    return 'rapid_escalation'
  }

  // Gradual escalation: slow multi-step drift
  if (direction === 'escalating' && escalating >= 3 && velocity < 0.03) {
    return 'gradual_escalation'
  }

  return null
}

// ─── Cooldown scale table ─────────────────────────────────────────────────────

const TRAJECTORY_SCALE: Record<DriftTrajectory, number> = {
  gradual_escalation:      0.70,  // intervene before it deepens
  rapid_escalation:        0.50,  // urgent — act now
  recovery_in_progress:    2.00,  // do not interrupt
  urgency_spiral:          0.55,  // purchase window is time-sensitive
  attention_fragmentation: 1.40,  // already distracted — back off
  decision_overload:       0.80,  // timely nudge is useful here
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stable(depth: number): DriftEstimate {
  return {
    direction:             'stable',
    confidence:            0.2,
    depth,
    velocity:              0,
    windowMs:              0,
    trajectory:            null,
    escalatingTransitions: 0,
    recoveringTransitions: 0,
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
