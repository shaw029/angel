import type { Message } from '@shared/messages'
import { MSG } from '@shared/constants'
import { generateIntervention } from '@ai/index'
import { engine } from '@ai/engine'
import type { ModelLoadStatus } from '@shared/types'

// ─── Service-worker keepalive ─────────────────────────────────────────────────
// The SW goes idle after ~30 s of inactivity and takes this offscreen doc with
// it, cancelling the in-flight ONNX fetch. We use two complementary strategies:
//
//   1. Long-lived port (Chrome ≥ 116) — an open port prevents SW termination
//      as long as the port stays connected. No polling needed.
//   2. Timer fallback (10 s) — if the port can't be opened (older Chrome or
//      context gone), periodic pings keep the SW event loop alive.

let livePort:      chrome.runtime.Port | null = null
let keepaliveTimer: ReturnType<typeof setInterval> | null = null

function startKeepalive() {
  if (livePort !== null || keepaliveTimer !== null) return
  try {
    livePort = chrome.runtime.connect({ name: 'model-keepalive' })
    livePort.onDisconnect.addListener(() => {
      livePort = null
      startTimerFallback()   // port dropped — fall back to pings
    })
  } catch {
    startTimerFallback()
  }
}

function startTimerFallback() {
  if (keepaliveTimer !== null) return
  keepaliveTimer = setInterval(() => {
    try { chrome.runtime.sendMessage({ type: MSG.KEEPALIVE }) }
    catch { stopKeepalive() }
  }, 10_000)
}

function stopKeepalive() {
  livePort?.disconnect()
  livePort = null
  if (keepaliveTimer !== null) { clearInterval(keepaliveTimer); keepaliveTimer = null }
}

// Relay engine load-status events to the background service worker so the
// popup can reflect download progress. Set up once, before any inference.
engine.onProgress((status: ModelLoadStatus) => {
  try {
    chrome.runtime.sendMessage({ type: MSG.MODEL_PROGRESS, payload: status })
  } catch {
    // Extension context may be invalidated during extension reload in dev
  }

  if (status.phase === 'checking' || status.phase === 'downloading' || status.phase === 'loading') {
    startKeepalive()
  } else {
    stopKeepalive()
  }
})

// Start downloading/loading the model immediately — don't wait for the first
// inference request. This way the model is ready (or still downloading and
// showing progress) as soon as the user opens the popup.
void engine.ensureReady().catch(() => {
  // Error already surfaced via onProgress({ phase: 'error' }) — no action needed here
  stopKeepalive()
})

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type !== MSG.AI_CONTEXT) {
    sendResponse(null)
    return false
  }

  void generateIntervention(message.payload)
    .then((intervention) => {
      if (intervention) {
        chrome.runtime.sendMessage({ type: MSG.INTERVENTION, payload: intervention })
      }
    })
    .catch((err) => console.error('[CA offscreen] inference error:', err))
    .finally(() => sendResponse(null))

  return true // keep channel open for async response
})
