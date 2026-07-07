import { NARRATOR } from '@shared/constants'
import type {
  AlignmentJudgment,
  BrowsingSignal,
  EntryType,
  EventType,
  PageSemantics,
} from '@shared/types'

// ─── Narrator session log ─────────────────────────────────────────────────────
// Per-tab memory of the session *story*: how the tab was entered, where the
// titles have drifted, what the model last concluded. Everything here is
// in-memory only — it resets with the service worker and is never persisted.
//
// This module also owns the Narrator's cadence: inference is expensive and a
// confident 'aligned' verdict buys a long quiet period, so the model is asked
// only when its answer could plausibly have changed.

interface TabStory {
  entry:         EntryType
  currentTitle:  string
  titleTrail:    string[]                 // previous titles, oldest first, ≤ TITLE_TRAIL
  narrative:     string | null            // last narrative text from the model
  lastJudgment:  { alignment: AlignmentJudgment['alignment']; confidence: number; at: number; eventType: EventType } | null
  inFlight:      boolean                  // an inference request for this tab is pending
  lastRequestAt: number
}

const stories = new Map<number, TabStory>()

function story(tabId: number): TabStory {
  let s = stories.get(tabId)
  if (!s) {
    s = {
      entry:         'unknown',
      currentTitle:  '',
      titleTrail:    [],
      narrative:     null,
      lastJudgment:  null,
      inFlight:      false,
      lastRequestAt: 0,
    }
    stories.set(tabId, s)
  }
  return s
}

/** Folds each browsing signal into the tab's story (title drift, entry type). */
export function noteSignal(tabId: number, signal: BrowsingSignal): void {
  const s = story(tabId)
  s.entry = signal.entry

  if (signal.pageTitle && signal.pageTitle !== s.currentTitle) {
    if (s.currentTitle) {
      s.titleTrail = [...s.titleTrail, s.currentTitle].slice(-NARRATOR.TITLE_TRAIL)
    }
    s.currentTitle = signal.pageTitle
  }
}

/** Semantic page context for the inference prompt — in-memory only. */
export function getPageSemantics(tabId: number, signal: BrowsingSignal): PageSemantics {
  const s = story(tabId)
  return {
    title:        s.currentTitle || signal.pageTitle,
    titleTrail:   s.titleTrail,
    entry:        s.entry,
    mediaPlaying: signal.mediaPlaying,
  }
}

export function previousNarrative(tabId: number): string | undefined {
  return stories.get(tabId)?.narrative ?? undefined
}

/**
 * Should the Narrator be consulted for this tab right now?
 *
 *  - never while a request is already in flight (fixes the overwrite race)
 *  - never more than once per MIN_INTERVAL_MS
 *  - a confident 'aligned' verdict suppresses re-judging for ALIGNED_BACKOFF_MS,
 *    unless the witness testimony has materially changed (different event type)
 */
export function shouldConsult(tabId: number, eventType: EventType, now: number = Date.now()): boolean {
  const s = stories.get(tabId)
  if (!s) return true
  // In-flight lock auto-expires after 3 min so a lost offscreen response can't
  // silence a tab until the next service-worker restart.
  if (s.inFlight && now - s.lastRequestAt < 3 * 60_000) return false
  if (now - s.lastRequestAt < NARRATOR.MIN_INTERVAL_MS) return false

  const j = s.lastJudgment
  if (
    j &&
    j.alignment === 'aligned' &&
    j.confidence >= NARRATOR.ALIGNED_CONFIDENCE &&
    now - j.at < NARRATOR.ALIGNED_BACKOFF_MS &&
    j.eventType === eventType
  ) {
    return false
  }

  return true
}

export function markRequested(tabId: number, now: number = Date.now()): void {
  const s = story(tabId)
  s.inFlight = true
  s.lastRequestAt = now
}

/** Records the model's judgment (or clears the in-flight lock on failure). */
export function recordJudgment(
  tabId: number,
  judgment: AlignmentJudgment | null,
  eventType: EventType,
): void {
  const s = story(tabId)
  s.inFlight = false
  if (!judgment) return

  s.narrative = judgment.narrative || s.narrative
  s.lastJudgment = {
    alignment:  judgment.alignment,
    confidence: judgment.confidence,
    at:         judgment.at,
    eventType,
  }
}

export function clearTab(tabId: number): void {
  stories.delete(tabId)
}
