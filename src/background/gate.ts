import type { StorageState, DismissalRecord, InterventionTier, EventType, CognitiveState } from '@shared/types'
import type { InterventionStrategy } from './intervention-strategy'
import { GATE } from '@shared/constants'

// ─── The Guardian ─────────────────────────────────────────────────────────────
// The Narrator (AI) decides WHETHER and at what tier to nudge. The Guardian
// only enforces ceilings — it can say "not yet" or "smaller", never "yes":
//
//   1. Hard floor: never two nudges within MIN_GAP_MS, no multiplier can breach it
//   2. Hourly budget: at most HOURLY_BUDGET nudges in any rolling hour
//   3. Bounded adaptive cooldown: the event/state/strategy/suppression scales
//      still personalize spacing, but their product is clamped to
//      [MULTIPLIER_MIN, MULTIPLIER_MAX] — the old unbounded six-factor stack
//      could collapse cooldowns to ~30 s
//   4. Tier ceiling: a proposed full card is downgraded to subtle inside the
//      full-card cooldown or below the full-tier confidence bar

// ─── Event-type cooldown scaling ──────────────────────────────────────────────

// Time-sensitive events (purchase pressure) get shorter cooldowns so the signal
// isn't missed. Passive events get longer cooldowns to avoid interrupting flow.
const EVENT_COOLDOWN_SCALE: Partial<Record<EventType, number>> = {
  checkout_pressure:   0.5,   // buying window is short — respond sooner
  subscription_funnel: 0.6,   // commitment decision deserves a prompt nudge
  passive_consumption: 2.0,   // don't interrupt low-engagement sessions often
  ambient:             3.0,   // almost no intervention needed
}

// ─── Cognitive-state cooldown scaling ─────────────────────────────────────────
// Applied on top of event-type scaling. Compulsive/reactive states warrant
// faster response; intentional/fragmented states warrant backing off.

const COGNITIVE_COOLDOWN_SCALE: Partial<Record<CognitiveState, number>> = {
  compulsive_loop:      0.6,   // can't stop — intervene sooner
  emotionally_reactive: 0.7,   // purchase pressure window is short
  decision_fatigue:     0.8,   // a timely nudge is welcome
  intentional_browsing: 2.5,   // user is focused — leave them alone
  fragmented_attention: 1.5,   // already distracted, don't add more noise
}

const FULL_TIER_MIN_CONFIDENCE = 0.70

function cooldownScale(eventType: EventType | undefined, cogState?: CognitiveState): number {
  const eventScale = (eventType ? EVENT_COOLDOWN_SCALE[eventType] : undefined) ?? 1.0
  const cogScale   = (cogState  ? COGNITIVE_COOLDOWN_SCALE[cogState] : undefined) ?? 1.0
  return eventScale * cogScale
}

/** Combined adaptive multiplier, clamped so stacking can never run away. */
function boundedMultiplier(
  state:      StorageState,
  eventType?: EventType,
  cogState?:  CognitiveState,
  strategy?:  InterventionStrategy,
): number {
  const raw = (state.suppressionMultiplier ?? 1.0)
    * cooldownScale(eventType, cogState)
    * (strategy?.cooldownScale ?? 1.0)
  return Math.min(Math.max(raw, GATE.MULTIPLIER_MIN), GATE.MULTIPLIER_MAX)
}

function lastAnyNudge(state: StorageState): number {
  return Math.max(
    state.lastFullIntervention   ?? 0,
    state.lastSubtleIntervention ?? 0,
  )
}

function hourlyBudgetExhausted(state: StorageState, now: number): boolean {
  const recent = (state.recentNudges ?? []).filter(t => now - t < 60 * 60 * 1000)
  return recent.length >= GATE.HOURLY_BUDGET
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

/**
 * Clamps the Narrator's proposed nudge against the Guardian's ceilings.
 * Returns the tier that may actually be delivered right now.
 */
export function guardianVerdict(
  proposedTier: 'subtle' | 'full',
  confidence:   number,
  state:        StorageState,
  now:          number = Date.now(),
  eventType?:   EventType,
  cogState?:    CognitiveState,
  strategy?:    InterventionStrategy,
): InterventionTier {
  // Strategy-level suppression (recovery in progress, entry delay, session cap)
  if (strategy?.preferredTier === 'none') return 'none'

  if (confidence < (strategy?.minConfidence ?? 0.50)) return 'none'

  // Hard floor and hourly budget — absolute, unscaled
  const last = lastAnyNudge(state)
  if (now - last < GATE.MIN_GAP_MS) return 'none'
  if (hourlyBudgetExhausted(state, now)) return 'none'

  // Bounded adaptive spacing
  const multiplier = boundedMultiplier(state, eventType, cogState, strategy)
  if (now - last < GATE.SUBTLE_COOLDOWN_MS * multiplier) return 'none'

  // Tier ceiling: strategy may cap at subtle (low-footprint states); a full
  // card additionally needs confidence and its own longer cooldown
  const fullAllowed =
    proposedTier === 'full' &&
    strategy?.preferredTier !== 'subtle' &&
    confidence >= FULL_TIER_MIN_CONFIDENCE &&
    now - (state.lastFullIntervention ?? 0) >= GATE.FULL_COOLDOWN_MS * multiplier

  return fullAllowed ? 'full' : 'subtle'
}

/**
 * Fast pre-check: could any tier fire right now?
 * Used in background before running expensive inference. Note the Narrator may
 * still be consulted for aligned/observe judgments — this only pre-empts the
 * cases where even a positive judgment could not be delivered.
 */
export function isAnyTierAllowed(
  state:      StorageState,
  now:        number = Date.now(),
  eventType?: EventType,
  cogState?:  CognitiveState,
  strategy?:  InterventionStrategy,
): boolean {
  if (strategy?.preferredTier === 'none') return false

  const last = lastAnyNudge(state)
  if (now - last < GATE.MIN_GAP_MS) return false
  if (hourlyBudgetExhausted(state, now)) return false

  const multiplier = boundedMultiplier(state, eventType, cogState, strategy)
  return now - last >= GATE.SUBTLE_COOLDOWN_MS * multiplier
}

// ─── State mutations ──────────────────────────────────────────────────────────

/** Returns the storage patch to apply after an intervention is shown. */
export function afterIntervention(
  tier:  Exclude<InterventionTier, 'none'>,
  state: StorageState,
  now:   number = Date.now(),
): Partial<StorageState> {
  return {
    lastIntervention:  now,
    interventionCount: (state.interventionCount ?? 0) + 1,
    recentNudges:      [...(state.recentNudges ?? []), now].slice(-12),
    ...(tier === 'full'
      ? { lastFullIntervention:   now }
      : { lastSubtleIntervention: now }
    ),
  }
}

/** Returns the storage patch to apply after the user dismisses a nudge. */
export function afterDismissal(
  record: DismissalRecord,
  state:  StorageState,
): Partial<StorageState> {
  const existing        = state.recentDismissals ?? []
  const recentDismissals = [...existing, record].slice(-20)  // ring buffer, last 20
  return {
    recentDismissals,
    suppressionMultiplier: computeSuppressionMultiplier(recentDismissals),
  }
}

// ─── Adaptive suppression ─────────────────────────────────────────────────────

// Outcome weights for the negativity ratio. The old computation counted only
// dwell time, so an auto-dismissed (ignored) nudge looked like an engaged one
// and the system concluded its nudges were welcome.
function baseWeight(d: DismissalRecord): number {
  switch (d.outcome) {
    case 'accepted': return 0
    case 'rejected': return 1.5  // explicit "wrong call" — strongest signal
    case 'ignored':  return 0.5  // shown, never touched — mild negative
    // Deferral is deliberate engagement that confirms the read and declines only
    // the timing. Weighting it negative would ramp cooldowns on a user who is
    // actively saying "yes, but later" — the opposite of what they asked for.
    case 'snoozed':  return 0
    case 'dismissed':
    default:
      return d.dwellMs < GATE.QUICK_DISMISS_MS ? 1 : 0
  }
}

function negativeWeight(d: DismissalRecord): number {
  const base = baseWeight(d)

  // Closing the deferral loop. A snooze on its own is free (weight 0), which is
  // right when the user genuinely meant "later" — but it also makes "remind me
  // later" the lowest-friction way to make a nudge go away, and a user who takes
  // that exit every time would otherwise teach the gate nothing. So the deferral
  // is judged by what happened when the nudge came back: asked for again and then
  // walked away from is a stronger refusal than a first-time ignore. Accepting
  // after a deferral stays weight 0 — that is the timing feedback working.
  return d.deferred && base > 0 ? Math.min(base * 2, 1.5) : base
}

/**
 * Derives the cooldown multiplier from recent dismissal outcomes.
 *
 * If the recent record skews negative (quick dismissals, ignores, rejections),
 * the user is signalling that nudges are unwelcome right now — scale cooldowns
 * up to back off gracefully rather than continuing to interrupt.
 *
 * Requires at least 3 data points before adapting, so fresh installs
 * start with baseline behavior.
 */
export function computeSuppressionMultiplier(
  dismissals: DismissalRecord[],
  now:        number = Date.now(),
): number {
  const recent = dismissals.filter(
    d => now - d.timestamp < GATE.DISMISSAL_WINDOW_MS,
  )
  if (recent.length < 3) return 1.0  // not enough signal yet

  const weighted = recent.reduce((acc, d) => acc + negativeWeight(d), 0)
  const ratio    = Math.min(weighted / recent.length, 1)

  for (const { quickRatio, multiplier } of GATE.MULTIPLIER_LEVELS) {
    if (ratio >= quickRatio) return multiplier
  }
  return 1.0
}
