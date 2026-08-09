import { snapshot } from './observer'
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
let shownAt:  number | null = null  // wall-clock ms when current nudge appeared

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) focusEvents.push(Date.now())
})

function safeSend(message: Message): void {
  try {
    chrome.runtime.sendMessage(message)
  } catch {
    // Extension was reloaded while this content script was still alive — ignore.
  }
}

// Periodic browsing signal (basic metrics)
setInterval(() => {
  if (document.hidden) return
  safeSend({ type: MSG.BROWSING_SIGNAL, payload: snapshot(switchCount()) })
}, SIGNAL_INTERVAL_MS)

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === MSG.INTERVENTION) {
    // Answer synchronously with whether the nudge actually mounted. A deferred
    // reminder can arrive while another nudge still occupies the slot, and the
    // background re-arms rather than dropping it — but only if it can tell.
    sendResponse(showNudge(message.payload))
  }
})

// Behavioral detection + tracking — events flow through the bus to background
const teardownDetectors = setupDetectors(push)
const teardownTrackers  = setupTrackers(push)

// Demo trigger: dispatched by demo HTML pages via document.dispatchEvent(new CustomEvent('ca:demo-trigger')).
// Calls showNudge directly — no inference needed, works before the model is loaded.
// Force-clears any existing nudge so repeated demo triggers always work.
document.addEventListener('ca:demo-trigger', () => {
  if (hostEl) {
    hostEl.remove()
    hostEl  = null
    shownAt = null
  }
  void showNudge({
    id:         crypto.randomUUID(),
    message:    "You can take a moment before deciding.",
    tone:       'gentle',
    action:     'pause_for_a_moment',
    confidence: 0.85,
    tier:       'full',
  })
})

window.addEventListener('beforeunload', () => {
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
  mountNudge(hostEl, intervention, (outcome) => dismiss(intervention, outcome))
  return true
}

function dismiss(intervention: Intervention, outcome: NudgeOutcome) {
  const dwellMs = shownAt !== null ? Date.now() - shownAt : 0

  safeSend({
    type: MSG.DISMISSED,
    payload: {
      id:       intervention.id,
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

  hostEl?.remove()
  hostEl  = null
  shownAt = null
}
