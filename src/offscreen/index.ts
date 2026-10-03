import type { Message } from '@shared/messages'
import { requestModelRun } from '@shared/model-plan'
import { MSG } from '@shared/constants'
import { judgeSession } from '@ai/index'
import { engine } from '@ai/engine'
import type { ModelLoadStatus, ModelRun } from '@shared/types'

// ─── Service-worker keepalive ─────────────────────────────────────────────────
// The SW can suspend while local work is running. Keep request routing alive
// during model loading and inference, and let it sleep otherwise:
//
//   1. A port reports disconnects. Opening it alone does not keep the SW alive.
//   2. Bounded 10-second pings reset the idle timer only while loading.

let startupRun: ModelRun | null = null
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
    void chrome.runtime.sendMessage({ type: MSG.MODEL_PROGRESS, payload: status, runId: startupRun?.id }).catch(() => undefined)
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

// The background creates this document only after consent. Ask it again here
// as a second boundary; loading the HTML directly cannot authorize a download.
void requestModelRun().then(run => {
  startupRun = run
  if (run) return engine.ensureReady()
}).catch(() => stopKeepalive())

let inferenceQueue: Promise<unknown> = Promise.resolve()

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  // Unhandled messages belong to the background/popup; never race their replies.
  if (message.type !== MSG.AI_CONTEXT) return false

  const { modelRunId, requestId, tabId, ctx, expiresAt } = message.payload

  // Always answer — even a failed inference must release the background's
  // in-flight lock for this tab, or the tab goes silent until SW restart.
  const task = inferenceQueue.then(async () => {
    const run = await requestModelRun()
    if (!run || run.id !== modelRunId || run.id !== startupRun?.id || !engine.isReady || Date.now() >= expiresAt) return { judgment: null, intervention: null }
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
