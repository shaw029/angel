import type { StorageState, DismissalRecord, InterventionTier, EventType } from '@shared/types'
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

function cooldownScale(eventType: EventType | undefined): number {
  return (eventType ? EVENT_COOLDOWN_SCALE[eventType] : undefined) ?? 1.0
}

// ─── Tier computation ─────────────────────────────────────────────────────────

/**
 * Returns what tier of intervention (if any) is permitted right now.
 *
 * Decision logic:
 *  1. confidence < 0.5          → none (below minimum threshold)
 *  2. within subtle cooldown    → none (all tiers share this minimum gap)
 *  3. confidence ≥ 0.8 AND full cooldown elapsed → full
 *  4. otherwise                 → subtle
 *     (this covers: 0.5–0.8 range, OR high-confidence inside full cooldown window)
 *
 * High-confidence detections that arrive inside the full-card window are
 * downgraded to subtle rather than suppressed entirely. This preserves signal
 * without spamming the user.
 */
export function computeTier(
  confidence: number,
  state:      StorageState,
  now:        number = Date.now(),
  eventType?: EventType,
): InterventionTier {
  if (confidence < 0.5) return 'none'

  const multiplier     = (state.suppressionMultiplier ?? 1.0) * cooldownScale(eventType)
  const subtleCooldown = GATE.SUBTLE_COOLDOWN_MS * multiplier
  const fullCooldown   = GATE.FULL_COOLDOWN_MS   * multiplier

  // Most-recent intervention of any tier sets the minimum gap
  const lastAny = Math.max(
    state.lastFullIntervention   ?? 0,
    state.lastSubtleIntervention ?? 0,
  )
  if (now - lastAny < subtleCooldown) return 'none'

  if (confidence >= 0.8 && now - (state.lastFullIntervention ?? 0) >= fullCooldown) {
    return 'full'
  }

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
): boolean {
  const multiplier     = (state.suppressionMultiplier ?? 1.0) * cooldownScale(eventType)
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
