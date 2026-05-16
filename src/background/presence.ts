// ─── Presence profile ────────────────────────────────────────────────────────
// Derived from the user's presenceLevel slider (0–1).
// Used as a modulation layer on top of the existing adaptive systems.
// All factors are designed to be subtle — this biases, not overrides.

export type PresenceZone = 'quiet' | 'adaptive' | 'attentive'

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

export function derivePresence(level: number): PresenceProfile {
  const l = Math.max(0, Math.min(1, level))

  const zone: PresenceZone =
    l <= 0.33 ? 'quiet'
    : l <= 0.66 ? 'adaptive'
    : 'attentive'

  return {
    level,
    zone,
    cooldownScale:   1.5 - l,           // quiet 1.5 → adaptive 1.0 → attentive 0.5
    confidenceDelta: 0.08 - l * 0.16,   // quiet +0.08 → adaptive 0.0 → attentive −0.08
    entryDelayScale: 1.5 - l,           // same shape as cooldown for consistency
    sessionCapDelta: l <= 0.33 ? -1 : l >= 0.67 ? 1 : 0,
  }
}
