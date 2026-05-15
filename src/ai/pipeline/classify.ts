import type { EventType, SignalLabel } from '@shared/types'

export function classifyEventType(signals: SignalLabel[]): EventType {
  const s = new Set(signals)

  const hasPricePressure  = s.has('countdown_timer') || s.has('limited_stock') || s.has('social_proof_live')
  const hasBilling        = s.has('recurring_billing') || s.has('trial_language')
  const hasUrgency        = s.has('urgency_language') || hasPricePressure
  const hasEngagement     = s.has('autoplay_media') || s.has('infinite_feed')
  const hasSessionDepth   = s.has('session_long') || s.has('doom_scrolling')

  // Most specific classifications first
  if (hasBilling && hasPricePressure) return 'subscription_funnel'
  if (hasPricePressure || (hasUrgency && hasBilling)) return 'checkout_pressure'
  if (hasBilling) return 'subscription_funnel'
  if (hasEngagement && hasSessionDepth) return 'engagement_hook'
  if (hasEngagement) return 'engagement_hook'
  if (hasUrgency) return 'attention_capture'
  if (hasSessionDepth) return 'passive_consumption'
  if (s.has('rapid_interaction')) return 'distracted_browsing'

  return 'ambient'
}
