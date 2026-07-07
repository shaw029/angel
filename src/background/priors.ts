import type { AlignmentPriorLabel, DomainCategory, IntentAlignment } from '@shared/types'

// ─── Alignment priors ─────────────────────────────────────────────────────────
// Longitudinal feedback loop: what has the Narrator concluded about this *kind*
// of context before, and did the user agree? Keyed by DomainCategory — never by
// domain or URL — so the stored memory keeps the "no URLs, no content" guarantee.
//
// Two writers:
//   - every judgment records its alignment verdict
//   - a 'rejected' nudge records a corrective 'aligned' (the model called it
//     captured; the user said otherwise — the strongest label we ever get)

const KEY = 'ca_alignment_priors'
const MIN_OBSERVATIONS = 5

type Tally  = { aligned: number; drifting: number; captured: number }
type Priors = Partial<Record<DomainCategory, Tally>>

export async function recordAlignment(
  category:  DomainCategory,
  alignment: IntentAlignment,
): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(KEY)
    const priors = (stored[KEY] as Priors | undefined) ?? {}
    const tally  = priors[category] ?? { aligned: 0, drifting: 0, captured: 0 }
    tally[alignment] += 1

    // Decay: halve counts when they grow large so the prior tracks recent
    // behavior instead of fossilizing early impressions.
    const total = tally.aligned + tally.drifting + tally.captured
    if (total > 60) {
      tally.aligned  = Math.round(tally.aligned  / 2)
      tally.drifting = Math.round(tally.drifting / 2)
      tally.captured = Math.round(tally.captured / 2)
    }

    priors[category] = tally
    await chrome.storage.local.set({ [KEY]: priors })
  } catch {
    // Priors are an enhancement, never a dependency
  }
}

export async function getAlignmentPrior(
  category: DomainCategory,
): Promise<AlignmentPriorLabel | undefined> {
  try {
    const stored = await chrome.storage.local.get(KEY)
    const tally  = ((stored[KEY] as Priors | undefined) ?? {})[category]
    if (!tally) return undefined

    const total = tally.aligned + tally.drifting + tally.captured
    if (total < MIN_OBSERVATIONS) return undefined

    if (tally.aligned / total >= 0.70)  return 'usually_aligned'
    if (tally.captured / total >= 0.50) return 'often_captured'
    return 'mixed'
  } catch {
    return undefined
  }
}
