import { snapshot, contextKey } from './observer'
import { MSG, SIGNAL_INTERVAL_MS, SWITCH_WINDOW_MS } from '@shared/constants'
import type { Message } from '@shared/messages'
import type { Intervention, NudgeOutcome } from '@shared/types'
import { setup as setupDetectors } from './detectors/index'
import { setup as setupTrackers } from './trackers/index'
import { push } from './events/bus'
import { mountNudge } from './ui'

// Rolling window of tab-focus timestamps. The old monotonic counter meant any
// long-lived tab crossed the "restless" threshold after its 8th refocus — ever —
// and stayed mislabelled for the rest of its life.
let focusEvents: number[] = []

function switchCount(): number {
  const cutoff = Date.now() - SWITCH_WINDOW_MS
  focusEvents = focusEvents.filter(t => t >= cutoff)
  return focusEvents.length
}

let hostEl: HTMLElement | null = null
let unmountNudge: (() => void) | null = null
let observedContext = contextKey()
let shownAt:  number | null = null  // wall-clock ms when current nudge appeared

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) focusEvents.push(Date.now())
})

function safeSend(message: Message): void {
  try {
    void chrome.runtime.sendMessage(message).catch(() => undefined)
  } catch {
    // Extension was reloaded while this content script was still alive — ignore.
  }
}

// Periodic browsing signal (basic metrics)
setInterval(() => {
  checkNavigation()
  if (document.hidden) return
  safeSend({ type: MSG.BROWSING_SIGNAL, payload: snapshot(switchCount()) })
}, SIGNAL_INTERVAL_MS)

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === MSG.GET_PAGE_SNAPSHOT) {
    checkNavigation()
    sendResponse(document.hidden ? null : snapshot(switchCount()))
    return false
  }
  if (message.type === MSG.CLEAR_NUDGE) {
    clearNudge()
    sendResponse(true)
    return false
  }
  if (message.type === MSG.INTERVENTION) {
    void chrome.storage.local.get('state').then(({ state }) => {
      checkNavigation()
      const nudge = message.payload
      const valid = state?.enabled !== false && !document.hidden &&
        nudge.contextKey === contextKey() &&
        nudge.contextTitle === document.title.slice(0, 120) &&
        (nudge.expiresAt ?? 0) > Date.now()
      sendResponse(valid && showNudge(nudge))
    }).catch(() => sendResponse(false))
    return true
  }
  return false
})

// Behavioral detection + tracking — events flow through the bus to background
let teardownDetectors = setupDetectors(push)
let teardownTrackers  = setupTrackers(push)

// Demo trigger: dispatched by demo HTML pages via document.dispatchEvent(new CustomEvent('ca:demo-trigger')).
// Calls showNudge directly — no inference needed, works before the model is loaded.
// Force-clears any existing nudge so repeated demo triggers always work.
document.addEventListener('ca:demo-trigger', () => {
  clearNudge()
  void showNudge({
    id:         crypto.randomUUID(),
    message:    "You can take a moment before deciding.",
    tone:       'gentle',
    action:     'pause_for_a_moment',
    confidence: 0.85,
    tier:       'full',
  })
})

const navigationTimer = setInterval(checkNavigation, 1_000)
function checkNavigation(): void {
  const key = contextKey()
  if (observedContext === key) return
  observedContext = key
  clearNudge()
  teardownDetectors()
  teardownTrackers()
  focusEvents = []
  teardownDetectors = setupDetectors(push)
  teardownTrackers = setupTrackers(push)
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearNudge()
})

function clearNudge(): void {
  unmountNudge?.()
  unmountNudge = null
  hostEl?.remove()
  hostEl = null
  shownAt = null
}

window.addEventListener('beforeunload', () => {
  clearInterval(navigationTimer)
  clearNudge()
  teardownDetectors()
  teardownTrackers()
}, { once: true })

/** Returns false when a nudge is already on screen — one at a time. */
function showNudge(intervention: Intervention): boolean {
  if (hostEl) return false

  hostEl    = document.createElement('div')
  shownAt   = Date.now()
  hostEl.id = 'ca-nudge-host'
  // Only positioning lives here — all visual styling ships inside the shadow
  // root (see ui.tsx), where host-page CSS cannot reach it.
  Object.assign(hostEl.style, {
    position:      'fixed',
    top:           '28px',
    right:         '28px',
    zIndex:        '2147483647',
    pointerEvents: 'none',
  })
  document.body.appendChild(hostEl)
  unmountNudge = mountNudge(hostEl, intervention, (outcome) => dismiss(intervention, outcome), async () => {
    const result = await chrome.runtime.sendMessage({ type: MSG.COMPANION_ACTION, payload: { action: 'save' } })
    return !!result?.session?.returnPoint && !result.error
  })
  return true
}

function dismiss(intervention: Intervention, outcome: NudgeOutcome) {
  const dwellMs = shownAt !== null ? Date.now() - shownAt : 0

  safeSend({
    type: MSG.DISMISSED,
    payload: {
      id:       intervention.id,
      episodeId: intervention.episodeId,
      dwellMs,
      outcome,
      tone:     intervention.tone,
      cogState: intervention.cogState ?? 'intentional_browsing',
      category: intervention.category,

      // How many deferrals this nudge has already been through, so the
      // background can weigh the outcome against them.
      snoozeCount: intervention.snoozeCount,

      // The background re-delivers this verbatim, so it need not hold every
      // in-flight nudge on the chance one gets deferred.
      ...(outcome === 'snoozed' ? { intervention } : {}),
    },
  })

  clearNudge()
}
