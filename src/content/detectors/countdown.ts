import type { DetectionResult } from '@shared/types'
import { textWalker, isVisible } from './utils'

// H:MM or HH:MM or HH:MM:SS
const RE_COLON = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/
// "5 minutes", "2 hours", "30 seconds", etc.
const RE_DURATION = /\b\d+\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/i
// Expiry context near a timer — checked across the full body text
const RE_EXPIRY = /\b(?:offer|deal|sale|access|limited)\s+ends?\b|\bexpires?\s+(?:in|at|on|soon)\b/i

// Stores last extracted seconds per element to detect decreasing values.
// Only numbers are stored — no text content.
const lastSeconds = new WeakMap<Element, number>()
let confirmedDecreasing = false

export const id = 'countdown-timer' as const

export function scan(): DetectionResult {
  let colonCount = 0
  let durationCount = 0
  let hasExpiry = false

  const walker = textWalker()
  let node: Node | null

  while ((node = walker.nextNode())) {
    const text = (node as Text).nodeValue ?? ''
    if (text.length < 3) continue

    if (RE_EXPIRY.test(text)) hasExpiry = true

    const colonMatch = RE_COLON.exec(text)
    if (colonMatch) {
      const el = (node as Text).parentElement
      // Exclude <time> elements — those are semantic timestamps, not countdowns
      if (el && isVisible(el) && el.tagName !== 'TIME' && !el.closest('time')) {
        trackElement(el, colonMatch)
        colonCount++
      }
      continue
    }

    if (RE_DURATION.test(text)) {
      const el = (node as Text).parentElement
      if (el && isVisible(el)) durationCount++
    }
  }

  const count = colonCount + durationCount
  if (count === 0 && !hasExpiry) {
    return { detector: 'countdown-timer', found: false, confidence: 0, count: 0 }
  }

  return {
    detector: 'countdown-timer',
    found: true,
    confidence: confidence(colonCount > 0, hasExpiry, confirmedDecreasing),
    count: Math.max(count, 1),
  }
}

function trackElement(el: Element, match: RegExpExecArray): void {
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const s = match[3] ? parseInt(match[3], 10) : 0
  // Hours ≥ 12 with no seconds is more likely a clock than a countdown
  if (h >= 12 && !match[3]) return
  const total = h * 3600 + m * 60 + s
  const prev = lastSeconds.get(el)
  if (prev !== undefined && total < prev && total > 0) confirmedDecreasing = true
  lastSeconds.set(el, total)
}

function confidence(hasColon: boolean, hasExpiry: boolean, decreasing: boolean): number {
  if (decreasing) return 0.95
  if (hasExpiry && hasColon) return 0.85
  if (hasExpiry) return 0.70
  if (hasColon) return 0.55
  return 0.45
}
