import type { BehavioralEvent } from '@shared/types'

export const EVIDENCE_TTL_MS = 90_000

// Keep the newest state per detector/tracker, including clears. Old positives
// must never become current evidence simply because a page stopped changing.
export function freshEvents(events: BehavioralEvent[], now = Date.now()): BehavioralEvent[] {
  const latest = new Map<string, BehavioralEvent>()
  for (const event of events) {
    if (event.timestamp > now || now - event.timestamp > EVIDENCE_TTL_MS) continue
    const key = event.kind === 'detection'
      ? `d:${event.data.detector}` : `t:${event.data.tracker}:${event.data.unit}`
    if ((latest.get(key)?.timestamp ?? -1) <= event.timestamp) latest.set(key, event)
  }
  return [...latest.values()]
}
