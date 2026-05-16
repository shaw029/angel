import type { CognitiveState, InterventionTier, DriftEstimate } from '@shared/types'
import type { PresenceProfile } from './presence'

// ─── Strategy interface ───────────────────────────────────────────────────────

export interface InterventionStrategy {
  // Minimum confidence to fire — overrides the 0.5 baseline in gate
  minConfidence: number

  // Preferred intervention tier for this state.
  // 'none'   → suppress entirely (primary suppressor — checked before cooldowns)
  // 'subtle' → cap any full-card promotions (low-footprint states)
  // 'full'   → allow full card even below the 0.8 global confidence threshold
  preferredTier: InterventionTier

  // Additional cooldown scaling factor — stacks with event + cognitive + drift scales.
  // < 1.0 = shorter cooldowns (intervene sooner); > 1.0 = longer (back off)
  cooldownScale: number

  // Minimum milliseconds the user must be in this state before the first nudge.
  // Prevents firing immediately on state entry before it has stabilized.
  stateEntryDelayMs: number

  // Suppress for the rest of the session after this many quick-dismissals in this state.
  // Respects strong "I know what I'm doing" signals without permanently penalizing.
  sessionDismissalCap: number
}

// ─── Per-state base strategies ────────────────────────────────────────────────
// These represent the default behavioral contract per cognitive state.
// resolveStrategy() applies dynamic adjustments on top.

const STATE_STRATEGY: Record<CognitiveState, InterventionStrategy> = {

  // User is purposefully engaged — any nudge is friction. Suppress unless
  // extraordinarily confident, and only as subtle.
  intentional_browsing: {
    minConfidence:       0.90,
    preferredTier:       'none',
    cooldownScale:       3.0,
    stateEntryDelayMs:   0,
    sessionDismissalCap: 1,
  },

  // Exploratory state is healthy — let it run. Subtle only, long warmup.
  exploratory_browsing: {
    minConfidence:       0.78,
    preferredTier:       'subtle',
    cooldownScale:       2.0,
    stateEntryDelayMs:   5 * 60_000,
    sessionDismissalCap: 2,
  },

  // The primary intervention window. Subtle tier preserves flow.
  // Standard cooldown — not urgent, but worth a gentle check-in.
  passive_consumption: {
    minConfidence:       0.55,
    preferredTier:       'subtle',
    cooldownScale:       1.5,
    stateEntryDelayMs:   3 * 60_000,
    sessionDismissalCap: 3,
  },

  // Loop state: shorter cooldown (state persists), but subtle only.
  // A full card adds friction when the user literally can't stop scrolling —
  // it interrupts the UI without creating enough pause to be useful.
  compulsive_loop: {
    minConfidence:       0.60,
    preferredTier:       'subtle',
    cooldownScale:       0.70,
    stateEntryDelayMs:   2 * 60_000,
    sessionDismissalCap: 3,
  },

  // Purchase pressure: decision window is short, stakes are real.
  // Full card is appropriate here — the reflective pause has clear value.
  // Respond quickly (short delay, aggressive cooldown).
  emotionally_reactive: {
    minConfidence:       0.58,
    preferredTier:       'full',
    cooldownScale:       0.65,
    stateEntryDelayMs:   30_000,
    sessionDismissalCap: 2,
  },

  // Already overwhelmed — needs strong signal before firing, and minimal footprint.
  // Long entry delay + long cooldown: don't add to the fragmentation.
  fragmented_attention: {
    minConfidence:       0.72,
    preferredTier:       'subtle',
    cooldownScale:       1.80,
    stateEntryDelayMs:   4 * 60_000,
    sessionDismissalCap: 2,
  },

  // Extended purchase/research context: calm full card is genuinely welcome.
  decision_fatigue: {
    minConfidence:       0.58,
    preferredTier:       'full',
    cooldownScale:       0.85,
    stateEntryDelayMs:   3 * 60_000,
    sessionDismissalCap: 3,
  },
}

// ─── Dynamic resolver ─────────────────────────────────────────────────────────

/**
 * Returns the intervention strategy for the current cognitive state,
 * adjusted for trajectory, state persistence, and session dismissal history.
 *
 * Priority order (first matching condition overrides):
 *  1. Recovery in progress     → always suppress (protect natural recovery)
 *  2. State entry delay active → suppress (let new state stabilize)
 *  3. Session dismissal cap hit → suppress (user has opted out for this state)
 *  4. Long-term stable bad state → soften (user has settled, reduce pressure)
 *  5. Rapid escalation          → shorten cooldown (bring intervention forward)
 *  6. Base strategy             → unchanged
 */
export function resolveStrategy(
  cogState:          CognitiveState,
  drift:             DriftEstimate | undefined,
  persistenceMs:     number,
  sessionDismissals: number,
  presence?:         PresenceProfile,
): InterventionStrategy {
  const base = STATE_STRATEGY[cogState]

  // Apply presence modulation to entry delay and session cap thresholds.
  // These are checked before returning, so presence biases the gate conditions.
  const effectiveEntryDelay = presence
    ? base.stateEntryDelayMs * presence.entryDelayScale
    : base.stateEntryDelayMs
  const effectiveSessionCap = presence
    ? Math.max(1, base.sessionDismissalCap + presence.sessionCapDelta)
    : base.sessionDismissalCap

  // 1. Recovery: the user is naturally improving — never interrupt that
  if (drift?.trajectory === 'recovery_in_progress') {
    return { ...base, preferredTier: 'none', cooldownScale: base.cooldownScale * 2.0 }
  }

  // 2. Entry delay: state too recent, let it stabilize first
  if (persistenceMs < effectiveEntryDelay) {
    return { ...base, preferredTier: 'none' }
  }

  // 3. Session dismissal cap: user has clearly opted out for now
  if (sessionDismissals >= effectiveSessionCap) {
    return { ...base, preferredTier: 'none' }
  }

  // 4. Long-term stable compulsive/reactive (>30 min): user has settled in.
  //    Continuing to nudge adds pressure without adding value — back off.
  if (
    (cogState === 'compulsive_loop' || cogState === 'emotionally_reactive') &&
    persistenceMs > 30 * 60_000 &&
    (drift?.direction === 'stable' || drift?.direction === 'fluctuating')
  ) {
    return { ...base, cooldownScale: base.cooldownScale * 2.0, preferredTier: 'subtle' }
  }

  // 5. Rapid escalation: bring the intervention forward before it deepens
  if (drift?.trajectory === 'rapid_escalation' && (drift.confidence ?? 0) >= 0.60) {
    return { ...base, cooldownScale: base.cooldownScale * 0.60 }
  }

  // Apply presence to the returned strategy — cooldown scaling and confidence
  // threshold are modulated here so gate.ts needs no changes.
  if (presence) {
    return {
      ...base,
      cooldownScale:  base.cooldownScale  * presence.cooldownScale,
      minConfidence:  Math.max(0.10, Math.min(0.99, base.minConfidence + presence.confidenceDelta)),
    }
  }

  return base
}
