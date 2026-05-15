import type { BehavioralEvent } from '@shared/types'
import { MSG } from '@shared/constants'

// High-confidence detections get a shorter debounce so they reach the background
// quickly, but still batch with any other events that fire in the same window.
// Removing the old "flush immediately" path prevents a high-confidence countdown
// scan from bypassing batching and firing a message on every periodic tick.
const DEBOUNCE_URGENT_MS  =   600   // was: immediate flush for confidence >= 0.75
const DEBOUNCE_NORMAL_MS  = 3_000
const URGENT_CONFIDENCE   =  0.75
const MAX_QUEUE           =    40   // oldest events evicted when over limit

const queue: BehavioralEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

export function push(event: BehavioralEvent): void {
  // Evict oldest entry if queue is full
  if (queue.length >= MAX_QUEUE) queue.shift()
  queue.push(event)

  const isUrgent =
    event.kind === 'detection' && event.data.confidence >= URGENT_CONFIDENCE

  const delay = isUrgent ? DEBOUNCE_URGENT_MS : DEBOUNCE_NORMAL_MS

  // Only shorten an existing timer, never extend it
  if (flushTimer === null || isUrgent) {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, delay)
  }
}

function flush(): void {
  flushTimer = null
  if (queue.length === 0) return

  const batch = queue.splice(0)
  try {
    chrome.runtime.sendMessage({ type: MSG.BEHAVIORAL_EVENTS, payload: batch })
  } catch {
    // Extension reloaded while content script was alive — discard safely
  }
}
