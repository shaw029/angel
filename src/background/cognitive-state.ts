import type {
  BrowsingSignal,
  CompressedContext,
  CognitiveState,
  CognitiveStateEstimate,
  CognitiveStateTransition,
} from '@shared/types'

// ─── Internal rolling context (stored per-tab in background) ─────────────────

export interface RollingCognitiveContext {
  state:     CognitiveState
  enteredAt: number
  history:   CognitiveStateTransition[]  // last 15, oldest first — sufficient for 1-hour drift window
}

// ─── Transition hysteresis ────────────────────────────────────────────────────
// New candidate must outscore the current state by this margin before we commit
// to a transition. Prevents flicker when two states score similarly.
const TRANSITION_MARGIN = 0.15

// ─── Main entry point ─────────────────────────────────────────────────────────

export function estimateCognitiveState(
  signal:  BrowsingSignal,
  ctx:     CompressedContext,
  rolling: RollingCognitiveContext | null,
  now:     number = Date.now(),
): { estimate: CognitiveStateEstimate; next: RollingCognitiveContext } {
  const scores = computeScores(signal, ctx)

  // Rank states by score
  let topState:    CognitiveState = 'intentional_browsing'
  let topScore     = -1
  let secondScore  = -1

  for (const [state, s] of Object.entries(scores) as [CognitiveState, number][]) {
    if (s > topScore)        { secondScore = topScore; topScore = s; topState = state }
    else if (s > secondScore) { secondScore = s }
  }

  // Resolve current state
  const current: RollingCognitiveContext = rolling ?? {
    state:     'intentional_browsing',
    enteredAt: now,
    history:   [],
  }

  // Decide whether to transition
  const currentScore = scores[current.state] ?? 0
  const shouldTransition =
    topState !== current.state &&
    topScore - currentScore >= TRANSITION_MARGIN

  const transition: CognitiveStateTransition | null = shouldTransition
    ? { from: current.state, to: topState, at: now }
    : null

  const nextState  = transition ? topState       : current.state
  const enteredAt  = transition ? now             : current.enteredAt
  const history    = transition
    ? [...current.history.slice(-14), transition]
    : current.history

  return {
    estimate: {
      state:      nextState,
      confidence: Math.min(topScore, 1.0),
      scores,
      transition,
      durationMs: now - enteredAt,
    },
    next: { state: nextState, enteredAt, history },
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Each state gets 0–1 from weighted boolean conditions.
// No floats in conditions — all thresholds are round numbers chosen to match
// the existing tracker/detector output ranges.

function computeScores(
  signal: BrowsingSignal,
  ctx:    CompressedContext,
): Partial<Record<CognitiveState, number>> {
  const s  = new Set(ctx.signals)
  const sc = ctx.session_context
  const et = ctx.event_type
  const pc = ctx.page_context

  const hasDoom     = s.has('doom_scrolling')
  const hasRapid    = s.has('rapid_interaction')
  const hasInfinite = s.has('infinite_feed')
  const hasUrgency  = s.has('urgency_language') || s.has('countdown_timer') || s.has('limited_stock')
  const hasSession  = s.has('session_long')
  const hasBilling  = s.has('recurring_billing') || s.has('trial_language')
  const isPurchase  = pc.category === 'ecommerce' || pc.category === 'finance'

  return {
    intentional_browsing: sum([
      [!hasDoom && !hasRapid,                          0.30],
      [signal.scrollDepth < 0.5 && !hasDoom,           0.20],
      [sc.tab_activity === 'focused',                  0.25],
      [signal.idleTime < 60 && signal.timeOnPage > 60, 0.15],
      [et === 'ambient',                               0.10],
      // Hard penalty: any compulsive signal present cuts score heavily
      [hasDoom || hasRapid || hasInfinite,            -0.40],
    ]),

    exploratory_browsing: sum([
      [sc.tab_activity === 'moderate',                 0.35],
      [signal.timeOnPage < 180,                        0.25],
      [!hasDoom && !hasRapid,                          0.20],
      [et === 'ambient' || et === 'attention_capture', 0.20],
    ]),

    passive_consumption: sum([
      [hasSession,                                     0.30],
      [signal.timeOnPage > 300,                        0.25],
      [signal.idleTime > 30,                           0.20],
      [!hasRapid,                                      0.15],
      [!hasUrgency,                                    0.10],
    ]),

    compulsive_loop: sum([
      [hasDoom,                                        0.35],
      [hasRapid && hasInfinite,                        0.25],
      [et === 'engagement_hook' && hasSession,         0.25],
      [et === 'distracted_browsing',                   0.15],
    ]),

    emotionally_reactive: sum([
      [et === 'checkout_pressure',                     0.35],
      [hasUrgency && hasRapid,                         0.30],
      [s.has('limited_stock') || s.has('social_proof_live'), 0.20],
      [hasUrgency && isPurchase,                       0.15],
    ]),

    fragmented_attention: sum([
      [sc.tab_activity === 'restless',                 0.40],
      [et === 'distracted_browsing',                   0.30],
      [hasRapid && signal.timeOnPage < 120,            0.20],
      [signal.switchCount >= 8,                        0.10],
    ]),

    decision_fatigue: sum([
      [(et === 'checkout_pressure' || et === 'subscription_funnel') && hasSession, 0.35],
      [isPurchase && signal.timeOnPage > 600,          0.30],
      [hasBilling && hasSession,                       0.20],
      [signal.idleTime > 60 && isPurchase,             0.15],
    ]),
  }
}

// Sums weighted boolean terms, clamped to [0, 1].
function sum(terms: [condition: boolean, weight: number][]): number {
  return Math.min(
    Math.max(
      terms.reduce((acc, [cond, w]) => acc + (cond ? w : 0), 0),
      0,
    ),
    1.0,
  )
}
