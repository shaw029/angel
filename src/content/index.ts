import { snapshot } from './observer'
import { MSG, SIGNAL_INTERVAL_MS } from '@shared/constants'
import type { Message } from '@shared/messages'
import type { Intervention } from '@shared/types'
import { setup as setupDetectors } from './detectors/index'
import { setup as setupTrackers } from './trackers/index'
import { push } from './events/bus'
import { mountNudge } from './ui'

let switchCount = 0
let hostEl: HTMLElement | null = null
let shownAt:  number | null = null  // wall-clock ms when current nudge appeared

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) switchCount++
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
  safeSend({ type: MSG.BROWSING_SIGNAL, payload: snapshot(switchCount) })
}, SIGNAL_INTERVAL_MS)

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === MSG.INTERVENTION) {
    void showNudge(message.payload)
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

function showNudge(intervention: Intervention) {
  if (hostEl) return  // one nudge at a time

  hostEl    = document.createElement('div')
  shownAt   = Date.now()
  hostEl.id = 'ca-nudge-host'
  Object.assign(hostEl.style, {
    position:      'fixed',
    bottom:        '24px',
    right:         '24px',
    zIndex:        '2147483647',
    fontFamily:    '-apple-system, BlinkMacSystemFont, Inter, sans-serif',
    pointerEvents: 'none',
  })
  document.body.appendChild(hostEl)
  mountNudge(hostEl, intervention, (outcome) => dismiss(intervention.id, outcome))
}

function dismiss(id: string, outcome: 'accepted' | 'dismissed') {
  const dwellMs = shownAt !== null ? Date.now() - shownAt : 0

  safeSend({ type: MSG.DISMISSED, payload: { id, dwellMs, outcome } })

  hostEl?.remove()
  hostEl  = null
  shownAt = null
}
