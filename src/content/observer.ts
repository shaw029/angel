import type { BrowsingSignal } from '@shared/types'

const startTime = Date.now()
let lastInteractionTime = Date.now()
let maxScrollDepth = 0

function scrollDepth(): number {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight
  return scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0
}

document.addEventListener('scroll', () => {
  lastInteractionTime = Date.now()
  maxScrollDepth = Math.max(maxScrollDepth, scrollDepth())
}, { passive: true })

document.addEventListener('click', (e) => {
  // Ignore clicks on the nudge host — dismissing a nudge is not a page interaction
  // and should not reset idle time, which would suppress the next heuristic signal.
  if ((e.target as Element)?.closest?.('#ca-nudge-host') === null) {
    lastInteractionTime = Date.now()
  }
})
document.addEventListener('keydown', () => { lastInteractionTime = Date.now() })

export function snapshot(switchCount: number): BrowsingSignal {
  const now = Date.now()
  return {
    url: location.href,
    domain: location.hostname,
    timestamp: now,
    timeOnPage: (now - startTime) / 1000,
    scrollDepth: maxScrollDepth,
    idleTime: (now - lastInteractionTime) / 1000,
    switchCount,
  }
}
