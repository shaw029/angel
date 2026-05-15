import type { DetectionResult, TrackingResult, SignalLabel } from '@shared/types'

// Maps urgency detector sub-pattern index → specific signal label.
// Indices 0-2, 5-6 = general urgency; 3 = limited stock; 4 = social proof.
const URGENCY_MAP: Readonly<Partial<Record<number, SignalLabel>>> = {
  3: 'limited_stock',
  4: 'social_proof_live',
}

// Maps billing detector sub-pattern index → specific signal label.
// Index 6 = trial language; 0-5 = general recurring billing.
const BILLING_MAP: Readonly<Partial<Record<number, SignalLabel>>> = {
  6: 'trial_language',
}

export function extractSignals(
  detections: DetectionResult[],
  tracking: TrackingResult[],
): SignalLabel[] {
  const labels = new Set<SignalLabel>()

  for (const d of detections) {
    if (!d.found || d.confidence < 0.45) continue

    switch (d.detector) {
      case 'countdown-timer':
        labels.add('countdown_timer')
        break

      case 'autoplay-video':
        labels.add('autoplay_media')
        break

      case 'infinite-scroll':
        labels.add('infinite_feed')
        break

      case 'recurring-billing': {
        labels.add('recurring_billing')
        // Lift specific sub-signals when sub-pattern data is available
        if (d.categories) {
          for (const idx of d.categories) {
            const specific = BILLING_MAP[idx]
            if (specific) labels.add(specific)
          }
        }
        break
      }

      case 'urgency-language': {
        let hasSpecific = false
        if (d.categories) {
          for (const idx of d.categories) {
            const specific = URGENCY_MAP[idx]
            if (specific) { labels.add(specific); hasSpecific = true }
          }
        }
        // Always include the general label unless only specific ones cover it
        if (!hasSpecific || d.count > Object.keys(URGENCY_MAP).length) {
          labels.add('urgency_language')
        }
        break
      }
    }
  }

  for (const t of tracking) {
    switch (t.tracker) {
      case 'session-duration':
        if (t.value >= 600) labels.add('session_long')  // 10+ minutes
        break
      case 'scroll-continuity':
        if (t.unit === 'px-per-second') labels.add('doom_scrolling')
        break
      case 'interaction-loop':
        labels.add('rapid_interaction')
        break
    }
  }

  return [...labels]
}
