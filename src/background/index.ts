import { evaluate } from '@heuristics/index'
import { getState, patchState } from '@storage/index'
import { ensureOffscreenDocument } from './offscreen'
import { compress } from '@ai/pipeline'
import { computeTier, isAnyTierAllowed, afterIntervention, afterDismissal } from './gate'
import { incrementPattern, getMemorySummary } from '@memory/index'
import { resolveIntensity } from '@ai/guidance'
import { getRecentPhrases, recordPhrase } from './phrase-cache'
import type { PatternKey } from '@memory/index'
import type { Message } from '@shared/messages'
import { MSG, GATE } from '@shared/constants'
import type {
  BrowsingSignal,
  BehavioralEvent,
  DetectionResult,
  ModelLoadStatus,
  Intervention,
  CompressedContext,
  EventType,
} from '@shared/types'

// Pre-warm the offscreen document (and start Gemma download) as soon as the
// extension loads — not lazily on first signal. This means the model is
// downloading in the background from day one, visible in the popup.
chrome.runtime.onInstalled.addListener(() => void ensureOffscreenDocument())
chrome.runtime.onStartup.addListener(()   => void ensureOffscreenDocument())

// Track which tab triggered an AI inference so the intervention routes back correctly
let pendingTabId:    number    | null = null
let pendingEventType: EventType | null = null

// Latest model status relayed from offscreen — injected into GET_STATE responses
let latestModelStatus: ModelLoadStatus = { phase: 'idle' }

// Bounded per-tab event buffer — enriches CompressedContext when Gemma is invoked
const MAX_EVENTS_PER_TAB = 60
const tabEvents = new Map<number, BehavioralEvent[]>()

function storeEvents(tabId: number, events: BehavioralEvent[]): void {
  const existing = tabEvents.get(tabId) ?? []
  const combined = [...existing, ...events]
  tabEvents.set(tabId, combined.slice(-MAX_EVENTS_PER_TAB))
}

function recentDetections(tabId: number): DetectionResult[] {
  return (tabEvents.get(tabId) ?? [])
    .filter((e): e is Extract<BehavioralEvent, { kind: 'detection' }> => e.kind === 'detection')
    .map(e => e.data)
}

chrome.tabs.onRemoved.addListener((tabId) => tabEvents.delete(tabId))

// Accept the long-lived port from the offscreen document while the model is
// loading. Holding an open port prevents Chrome from terminating the SW (≥116).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'model-keepalive') port.disconnect()
  // No further action needed — the open connection itself is the keepalive.
})

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    void dispatch(message, sender.tab?.id, sendResponse)
    return true
  },
)

async function dispatch(
  message:      Message,
  senderTabId:  number | undefined,
  sendResponse: (r: unknown) => void,
) {
  switch (message.type) {
    case MSG.BROWSING_SIGNAL:
      await onBrowsingSignal(message.payload, senderTabId)
      break

    case MSG.BEHAVIORAL_EVENTS:
      if (senderTabId !== undefined) storeEvents(senderTabId, message.payload)
      break

    case MSG.INTERVENTION:
      await onIntervention(message.payload)
      break

    case MSG.DISMISSED: {
      const { dwellMs, outcome } = message.payload
      const state = await getState()
      await patchState(afterDismissal({ timestamp: Date.now(), dwellMs }, state))

      // Memory: track outcome pattern — fire-and-forget, non-critical
      if (outcome === 'accepted') {
        void incrementPattern('interventions_accepted')
      } else if (dwellMs < GATE.QUICK_DISMISS_MS) {
        void incrementPattern('interventions_quick_dismissed')
      }
      break
    }

    case MSG.MODEL_PROGRESS: {
      const incoming = message.payload as import('@shared/types').ModelLoadStatus
      // Preserve max filesLoaded across reloads — engine counter resets but storage doesn't
      if (incoming.phase === 'loading') {
        const prev = await chrome.storage.session.get('modelStatus')
        const prevCount: number = (prev.modelStatus as { filesLoaded?: number })?.filesLoaded ?? 0
        incoming.filesLoaded = Math.max(prevCount, incoming.filesLoaded)
      }
      latestModelStatus = incoming
      void chrome.storage.session.set({ modelStatus: incoming })
      break
    }

    case MSG.GET_STATE:
      sendResponse({ ...(await getState()), modelStatus: latestModelStatus })
      return

    case MSG.SET_ENABLED:
      await patchState({ enabled: message.payload })
      break

    case MSG.KEEPALIVE:
      break  // receiving this message is enough to reset the service-worker idle timer
  }

  sendResponse(null)
}

async function onBrowsingSignal(signal: BrowsingSignal, tabId: number | undefined) {
  if (tabId === undefined) return

  const state = await getState()
  if (!state.enabled) return

  const result = evaluate(signal)
  if (!result.flagged) return

  const rawCtx = compress(
    result.reasons,
    signal,
    recentDetections(tabId),
    tabEvents.get(tabId) ?? [],
  )

  if (!isAnyTierAllowed(state, Date.now(), rawCtx.event_type)) return

  // Record behavioral patterns — fire-and-forget, non-critical
  void recordPatterns(rawCtx)

  // Enrich context with memory, intensity, and phrase cache before inference
  const memory        = await getMemorySummary().catch(() => undefined)
  const intensity     = resolveIntensity(rawCtx.event_type, memory)
  const recentPhrases = await getRecentPhrases()

  const ctx: CompressedContext = { ...rawCtx, memory, intensity, recentPhrases }

  pendingTabId     = tabId
  pendingEventType = rawCtx.event_type
  await ensureOffscreenDocument()
  chrome.runtime.sendMessage({ type: MSG.AI_CONTEXT, payload: ctx })
}

async function onIntervention(intervention: Intervention) {
  if (pendingTabId === null) return

  const state = await getState()
  const tier  = computeTier(intervention.confidence, state, Date.now(), pendingEventType ?? undefined)

  if (tier === 'none') {
    pendingTabId     = null
    pendingEventType = null
    return
  }

  await patchState(afterIntervention(tier, state))
  void incrementPattern('interventions_shown')

  const tiered: Intervention = { ...intervention, tier }
  chrome.tabs.sendMessage(pendingTabId, { type: MSG.INTERVENTION, payload: tiered })

  // Cache phrase for variety enforcement — fire-and-forget
  void recordPhrase(intervention.message)

  pendingTabId     = null
  pendingEventType = null
}

// ─── Pattern recording ────────────────────────────────────────────────────────
// Maps abstract behavioral context to pattern keys. No URLs, no content.

async function recordPatterns(ctx: CompressedContext): Promise<void> {
  const hour = new Date().getHours()
  const late = hour >= 22 || hour <= 4

  const writes: Array<[PatternKey, number?]> = []

  if (late && ctx.session_context.minutes_active > 10) {
    writes.push(['late_night_scroll_sessions'])
  }

  if (ctx.session_context.doom_scrolling) {
    writes.push(['doom_scroll_episodes'])
  }

  switch (ctx.event_type) {
    case 'checkout_pressure':
      writes.push(['checkout_pressure_events'])
      break
    case 'subscription_funnel':
      writes.push(['subscription_funnel_events'])
      break
    case 'engagement_hook':
      writes.push(['engagement_hook_events'])
      break
    case 'passive_consumption':
      if (ctx.session_context.minutes_active > 20) writes.push(['long_passive_sessions'])
      break
    case 'distracted_browsing':
      writes.push(['rapid_tab_switching_episodes'])
      break
  }

  // Sequential to avoid concurrent IDB transactions on the same store
  for (const [key, delta] of writes) {
    await incrementPattern(key, delta)
  }
}
