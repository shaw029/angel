import type { BrowsingSignal, EntryType } from '@shared/types'

let lastInteractionTime = Date.now()
let maxScrollDepth = 0

// ── Visible-time accounting ───────────────────────────────────────────────────
// timeOnPage counts only foreground seconds. The old since-load clock meant a
// pinned tab read as an hours-long "session" forever, saturating every
// duration-based threshold downstream.

let visibleAccumMs = 0
let visibleSince: number | null = document.hidden ? null : Date.now()

document.addEventListener('visibilitychange', () => {
  const now = Date.now()
  if (document.hidden) {
    if (visibleSince !== null) {
      visibleAccumMs += now - visibleSince
      visibleSince = null
    }
  } else if (visibleSince === null) {
    visibleSince = now
    // Returning to the tab is itself an interaction — don't carry idle time
    // accrued while the tab was in the background.
    lastInteractionTime = now
  }
})

function visibleSeconds(now: number): number {
  const live = visibleSince !== null ? now - visibleSince : 0
  return (visibleAccumMs + live) / 1000
}

// ── Entry provenance ──────────────────────────────────────────────────────────
// How the user arrived is the strongest cheap intent signal: typed/searched = pull,
// arrived from a feed = push. Classified once at load; hostnames are matched
// locally and discarded — only the category label leaves this module.

const SEARCH_HOSTS = /(?:^|\.)(?:google|bing|duckduckgo|kagi|ecosia|startpage|search\.brave|yandex|baidu)\./i
const SOCIAL_HOSTS = /(?:^|\.)(?:twitter|x\.com|reddit|facebook|instagram|tiktok|linkedin|youtube|news\.ycombinator|threads)\./i

function classifyEntry(): EntryType {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav?.type === 'reload' || nav?.type === 'back_forward') return 'reload'

    const ref = document.referrer
    if (!ref) return 'direct'

    const host = new URL(ref).hostname
    if (host === location.hostname)  return 'internal'
    if (SEARCH_HOSTS.test(host))     return 'search'
    if (SOCIAL_HOSTS.test(host))     return 'social'
    return 'external'
  } catch {
    return 'unknown'
  }
}

const entryType = classifyEntry()

// ── Media awareness ───────────────────────────────────────────────────────────
// Watching a video is engagement, not idleness. Without this, a lecture or a
// film reads as "extended idle" — the single biggest false-positive source.

function mediaPlaying(): boolean {
  for (const m of document.querySelectorAll<HTMLMediaElement>('video, audio')) {
    if (!m.paused && !m.ended && m.readyState >= 2) return true
  }
  return false
}

// ── Interaction listeners ─────────────────────────────────────────────────────

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
  const now   = Date.now()
  const media = mediaPlaying()
  return {
    url: location.href,
    domain: location.hostname,
    timestamp: now,
    timeOnPage: visibleSeconds(now),
    scrollDepth: maxScrollDepth,
    idleTime: media ? 0 : (now - lastInteractionTime) / 1000,
    switchCount,
    pageTitle: document.title.slice(0, 120),
    mediaPlaying: media,
    entry: entryType,
  }
}
