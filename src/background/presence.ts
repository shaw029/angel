// ─── Presence profile ────────────────────────────────────────────────────────
// Derived from the user's presenceLevel slider (0–1).
// Used as a modulation layer on top of the existing adaptive systems.
// All factors are designed to be subtle — this biases, not overrides.

export type PresenceZone = 'quiet' | 'adaptive' | 'active'

export interface PresenceProfile {
  level:           number       // raw 0–1 user setting
  zone:            PresenceZone
  cooldownScale:   number       // multiplied into strategy.cooldownScale (>1 = longer gaps)
  confidenceDelta: number       // added to strategy.minConfidence (+ve = higher bar)
  entryDelayScale: number       // multiplied into stateEntryDelayMs (>1 = longer wait)
  sessionCapDelta: number       // integer delta on sessionDismissalCap
}

// Linear formulas centred at 0.5 so that the midpoint is always neutral (×1.0, ±0).
// Default 0.45 sits just left of centre — slightly conservative by design.
//
// Range is intentionally wide so that active (1.0) feels meaningfully different
// from adaptive — a user who maxes the slider should notice the difference.
//
//   quiet  (0.0): cooldown ×1.75, confidence +0.15, entry delay ×1.75, cap −1
//   adaptive (0.5): cooldown ×1.0,  confidence  0.0,  entry delay ×1.0,  cap  0
//   active (1.0): cooldown ×0.25, confidence −0.15, entry delay ×0.25, cap +2

export function derivePresence(level: number): PresenceProfile {
  const l = Math.max(0, Math.min(1, level))

  const zone: PresenceZone =
    l <= 0.33 ? 'quiet'
    : l <= 0.66 ? 'adaptive'
    : 'active'

  return {
    level,
    zone,
    cooldownScale:   1.0 + (0.5 - l) * 1.5,  // quiet 1.75 → adaptive 1.0 → active 0.25
    confidenceDelta: 0.15 - l * 0.30,          // quiet +0.15 → adaptive 0.0 → active −0.15
    entryDelayScale: 1.0 + (0.5 - l) * 1.5,  // same shape as cooldown
    sessionCapDelta: l <= 0.33 ? -1 : l >= 0.67 ? 2 : 0,
  }
}
