import type { BehavioralEvent, DetectionResult } from '@shared/types'
import { scan as scanCountdown } from './countdown'
import { scan as scanAutoplay } from './autoplay'
import { scan as scanInfiniteScroll, onScroll as infiniteScrollOnScroll } from './infinite-scroll'
import { scan as scanBilling } from './billing'
import { scan as scanUrgency } from './urgency'

const SCANNERS = [scanCountdown, scanAutoplay, scanInfiniteScroll, scanBilling, scanUrgency]
const MUTATION_DEBOUNCE_MS = 1_500   // was 500 — fewer scan batches per structural change
const PERIODIC_INTERVAL_MS = 20_000  // was 12000 — countdown-only; fits within 30s signal window

// Track last emitted fingerprint per detector to avoid duplicate events
const lastFingerprint = new Map<string, string>()

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => { fn(); t = null }, ms)
  }
}

function fingerprint(r: DetectionResult): string {
  return `${r.found ? 1 : 0}:${r.confidence.toFixed(2)}:${r.count}`
}

export function setup(emit: (e: BehavioralEvent) => void): () => void {
  const domain = location.hostname

  function runScan(scanners = SCANNERS): void {
    const now = Date.now()
    for (const scanFn of scanners) {
      const result = scanFn()
      if (!result.found) continue

      const fp = fingerprint(result)
      if (lastFingerprint.get(result.detector) === fp) continue
      lastFingerprint.set(result.detector, fp)

      emit({ id: crypto.randomUUID(), timestamp: now, domain, kind: 'detection', data: result })
    }
  }

  // Initial scan on load
  if (document.readyState === 'complete') {
    runScan()
  } else {
    window.addEventListener('load', () => runScan(), { once: true })
  }

  const debouncedScan = debounce(() => runScan(), MUTATION_DEBOUNCE_MS)

  // Structural DOM mutations only — no characterData.
  // Countdown ticks (characterData changes) are caught by the periodic timer instead,
  // avoiding a debounced full scan on every timer tick (up to 1/sec).
  const observer = new MutationObserver(debouncedScan)
  observer.observe(document.body, {
    subtree:         true,
    childList:       true,
    attributeFilter: ['autoplay', 'src', 'aria-busy', 'data-next-page', 'data-infinite'],
  })

  // Scroll: feed the infinite-scroll detector + re-scan when near bottom
  function handleScroll(): void {
    infiniteScrollOnScroll()
    const pos = window.scrollY + window.innerHeight
    const h = document.body.scrollHeight
    if (h > 0 && pos / h > 0.78) debouncedScan()
  }
  window.addEventListener('scroll', handleScroll, { passive: true })

  // Periodic: countdown-only scan — cheaper than a full 5-detector text walk.
  // Runs every 20s to confirm a decreasing value before the 30s BROWSING_SIGNAL fires.
  const periodicTimer = setInterval(() => {
    if (document.hidden) return
    runScan([scanCountdown])
  }, PERIODIC_INTERVAL_MS)

  return () => {
    observer.disconnect()
    clearInterval(periodicTimer)
    window.removeEventListener('scroll', handleScroll)
  }
}
