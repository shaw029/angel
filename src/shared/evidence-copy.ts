import type { SignalLabel } from './types'

const OBSERVATIONS: Partial<Record<SignalLabel, string>> = {
  countdown_timer: 'Timer or expiry language was detected on this page.',
  limited_stock: 'Limited-stock language was detected on this page.',
  social_proof_live: 'The page displays a count of other viewers or shoppers.',
  trial_language: 'Trial language was detected on this page.',
  recurring_billing: 'Subscription or recurring-billing language was detected.',
  urgency_language: 'Limited-time or urgency language was detected.',
  autoplay_media: 'A playing video has autoplay enabled. This does not establish how it started.',
  infinite_feed: 'The page showed signs of loading more content as you scroll.',
  doom_scrolling: 'A recent fast-scroll event was observed.',
  rapid_interaction: 'A recent burst of interactions was observed.',
  gamification: 'A reward or gamification element was detected.',
}

export function explainEvidence(signals: SignalLabel[]): string {
  const observations = signals.map(s => OBSERVATIONS[s]).filter(Boolean).slice(0, 3)
  return observations.length
    ? `${observations.join(' ')} These observations do not tell me what you intended or how you feel.`
    : 'I noticed a change in browsing activity. That alone does not tell me your intent.'
}

// Model judgment still decides whether to speak. Wording uses only witnessed
// mechanics, avoiding unsupported stories about motives, autoplay, or prices.
export function groundedMessage(signals: SignalLabel[]): string | null {
  if (signals.includes('countdown_timer')) return 'There’s timer or expiry language here. Want to leave this page for later?'
  if (signals.includes('limited_stock')) return 'This page mentions limited stock. You can choose your own pace.'
  if (signals.includes('recurring_billing')) return 'This page mentions subscription billing. Want a moment to look over the terms?'
  if (signals.includes('urgency_language')) return 'There’s limited-time language here. You can choose your own pace.'
  if (signals.includes('infinite_feed')) return 'This page keeps adding content. Still how you want to spend this moment?'
  if (signals.includes('autoplay_media')) return 'This video has autoplay enabled. Still what you want to watch?'
  if (signals.includes('doom_scrolling') || signals.includes('rapid_interaction')) return 'Still doing what you want to do here?'
  return null
}
