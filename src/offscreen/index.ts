import type { Message } from '@shared/messages'
import { MSG } from '@shared/constants'
import { judgeSession } from '@ai/index'
import { engine } from '@ai/engine'
import type { ModelLoadStatus } from '@shared/types'

// ─── Service-worker keepalive ─────────────────────────────────────────────────
// The SW can suspend while local work is running. Keep request routing alive
// during model loading and inference, and let it sleep otherwise:
//
//   1. A port reports disconnects. Opening it alone does not keep the SW alive.
//   2. Bounded 10-second pings reset the idle timer only while loading.

let loadingModel = false
let activeInferences = 0

let livePort:      chrome.runtime.Port | null = null
let keepaliveTimer: ReturnType<typeof setInterval> | null = null

function startKeepalive() {
  if (livePort !== null || keepaliveTimer !== null) return
  try {
    livePort = chrome.runtime.connect({ name: 'model-keepalive' })
    startTimerFallback()
    livePort.onDisconnect.addListener(() => {
      livePort = null
      // The timer already keeps loading alive; an idle worker may restart later.
    })
  } catch {
    startTimerFallback()
  }
}

function startTimerFallback() {
  if (keepaliveTimer !== null) return
  keepaliveTimer = setInterval(() => {
    try { void chrome.runtime.sendMessage({ type: MSG.KEEPALIVE }).catch(() => stopKeepalive()) }
    catch { stopKeepalive() }
  }, 10_000)
}

function stopKeepalive() {
  const port = livePort
  livePort = null
  port?.disconnect()
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

  loadingModel = status.phase === 'checking' || status.phase === 'downloading' || status.phase === 'loading'
  if (loadingModel || activeInferences > 0) {
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

let inferenceQueue: Promise<unknown> = Promise.resolve()

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  // Unhandled messages belong to the background/popup; never race their replies.
  if (message.type !== MSG.AI_CONTEXT) return false

  const { requestId, tabId, ctx, expiresAt } = message.payload

  // Always answer — even a failed inference must release the background's
  // in-flight lock for this tab, or the tab goes silent until SW restart.
  const task = inferenceQueue.then(async () => {
    if (Date.now() >= expiresAt) return { judgment: null, intervention: null }
    activeInferences++
    startKeepalive()
    try { return await judgeSession(ctx) }
    finally {
      activeInferences--
      if (!loadingModel && activeInferences === 0) stopKeepalive()
    }
  })
  inferenceQueue = task.catch(() => undefined)
  void task
    .then(({ judgment, intervention }) => {
      chrome.runtime.sendMessage({
        type:    MSG.JUDGMENT,
        payload: { requestId, tabId, judgment, intervention },
      })
    })
    .catch((err) => {
      console.error('[CA offscreen] inference error:', err)
      chrome.runtime.sendMessage({
        type:    MSG.JUDGMENT,
        payload: { requestId, tabId, judgment: null, intervention: null },
      })
    })
    .finally(() => sendResponse(null))

  return true // keep channel open for async response
})
