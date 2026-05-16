import type { StorageState, DismissalRecord, InterventionTier, EventType, CognitiveState } from '@shared/types'
import type { InterventionStrategy } from './intervention-strategy'
import { GATE } from '@shared/constants'

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
// Strategy cooldowns (from intervention-strategy.ts) stack on top of these.

const COGNITIVE_COOLDOWN_SCALE: Partial<Record<CognitiveState, number>> = {
  compulsive_loop:      0.6,   // can't stop — intervene sooner
  emotionally_reactive: 0.7,   // purchase pressure window is short
  decision_fatigue:     0.8,   // a timely nudge is welcome
  intentional_browsing: 2.5,   // user is focused — leave them alone
  fragmented_attention: 1.5,   // already distracted, don't add more noise
}

function cooldownScale(eventType: EventType | undefined, cogState?: CognitiveState): number {
  const eventScale = (eventType ? EVENT_COOLDOWN_SCALE[eventType] : undefined) ?? 1.0
  const cogScale   = (cogState  ? COGNITIVE_COOLDOWN_SCALE[cogState] : undefined) ?? 1.0
  return eventScale * cogScale
}

// ─── Tier computation ─────────────────────────────────────────────────────────

/**
 * Returns what tier of intervention (if any) is permitted right now.
 *
 * Decision logic (evaluated in order):
 *  1. confidence < strategy.minConfidence     → none
 *  2. strategy.preferredTier === 'none'       → none (state-level suppression)
 *  3. within subtle cooldown                  → none
 *  4. strategy.preferredTier === 'subtle'     → subtle (caps full-card promotions)
 *  5. strategy prefers full OR confidence ≥ 0.8, and full cooldown elapsed → full
 *  6. otherwise                               → subtle
 *
 * The strategy cooldownScale stacks with event-type and cognitive-state scales.
 * High-confidence detections inside the full-card window are downgraded to
 * subtle rather than suppressed — preserves signal without spamming.
 */
export function computeTier(
  confidence:   number,
  state:        StorageState,
  now:          number = Date.now(),
  eventType?:   EventType,
  cogState?:    CognitiveState,
  strategy?:    InterventionStrategy,
): InterventionTier {
  const minConf = strategy?.minConfidence ?? 0.50
  if (confidence < minConf) return 'none'

  // State-level suppression (recovery, entry delay, session cap)
  if (strategy?.preferredTier === 'none') return 'none'

  const multiplier = (state.suppressionMultiplier ?? 1.0)
    * cooldownScale(eventType, cogState)
    * (strategy?.cooldownScale ?? 1.0)

  const subtleCooldown = GATE.SUBTLE_COOLDOWN_MS * multiplier
  const fullCooldown   = GATE.FULL_COOLDOWN_MS   * multiplier

  const lastAny = Math.max(
    state.lastFullIntervention   ?? 0,
    state.lastSubtleIntervention ?? 0,
  )
  if (now - lastAny < subtleCooldown) return 'none'

  // Strategy caps tier at subtle (low-footprint states: passive, compulsive, fragmented)
  if (strategy?.preferredTier === 'subtle') return 'subtle'

  // Full-tier attempt: strategy prefers full OR high-confidence default
  const wantsFull = strategy?.preferredTier === 'full' || confidence >= 0.8
  if (wantsFull && now - (state.lastFullIntervention ?? 0) >= fullCooldown) return 'full'

  return 'subtle'
}

/**
 * Fast pre-check: can any tier fire right now?
 * Used in background before running expensive inference.
 */
export function isAnyTierAllowed(
  state:      StorageState,
  now:        number = Date.now(),
  eventType?: EventType,
  cogState?:  CognitiveState,
  strategy?:  InterventionStrategy,
): boolean {
  // State-level suppression check — no need to compute cooldowns
  if (strategy?.preferredTier === 'none') return false

  const multiplier = (state.suppressionMultiplier ?? 1.0)
    * cooldownScale(eventType, cogState)
    * (strategy?.cooldownScale ?? 1.0)

  const subtleCooldown = GATE.SUBTLE_COOLDOWN_MS * multiplier
  const lastAny = Math.max(
    state.lastFullIntervention   ?? 0,
    state.lastSubtleIntervention ?? 0,
  )
  return now - lastAny >= subtleCooldown
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

/**
 * Derives the cooldown multiplier from recent dismissal patterns.
 *
 * If most recent dismissals were quick (< QUICK_DISMISS_MS), the user is
 * signalling that nudges are unwelcome right now. We scale cooldowns up
 * to back off gracefully rather than continuing to interrupt.
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

  const quickCount = recent.filter(d => d.dwellMs < GATE.QUICK_DISMISS_MS).length
  const ratio      = quickCount / recent.length

  for (const { quickRatio, multiplier } of GATE.MULTIPLIER_LEVELS) {
    if (ratio >= quickRatio) return multiplier
  }
  return 1.0
}
