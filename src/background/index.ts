import { evaluate } from '@heuristics/index'
import { getState, patchState } from '@storage/index'
import { ensureOffscreenDocument } from './offscreen'
import { compress } from '@ai/pipeline'
import { computeTier, isAnyTierAllowed, afterIntervention, afterDismissal } from './gate'
import { incrementPattern, getMemorySummary, recordInterventionOutcome, recordSessionEnd, recordStateTransition } from '@memory/index'
import { resolveIntensity } from '@ai/guidance'
import { getRecentPhrases, recordPhrase } from './phrase-cache'
import { estimateCognitiveState } from './cognitive-state'
import { analyzeDrift, driftCooldownScale } from './drift'
import type { RollingCognitiveContext } from './cognitive-state'
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
  InterventionStyle,
} from '@shared/types'

// Pre-warm the offscreen document (and start Gemma download) as soon as the
// extension loads — not lazily on first signal. This means the model is
// downloading in the background from day one, visible in the popup.
chrome.runtime.onInstalled.addListener(() => void ensureOffscreenDocument())
chrome.runtime.onStartup.addListener(()   => void ensureOffscreenDocument())

// Track which tab triggered an AI inference so the intervention routes back correctly
let pendingTabId:     number           | null = null
let pendingEventType: EventType        | null = null
let lastShownTone:    InterventionStyle | null = null  // tone of most recently shown intervention

// Latest model status relayed from offscreen — injected into GET_STATE responses
let latestModelStatus: ModelLoadStatus = { phase: 'idle' }

// Bounded per-tab event buffer — enriches CompressedContext when Gemma is invoked
const MAX_EVENTS_PER_TAB = 60
const tabEvents           = new Map<number, BehavioralEvent[]>()
const tabCognitiveContext = new Map<number, RollingCognitiveContext>()

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

chrome.tabs.onRemoved.addListener((tabId) => {
  tabEvents.delete(tabId)
  tabCognitiveContext.delete(tabId)
  void recordSessionEnd()  // tolerance recovers gradually as sessions end
})

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

      const accepted     = outcome === 'accepted'
      const quickDismiss = dwellMs < GATE.QUICK_DISMISS_MS

      // Memory: pattern counters — fire-and-forget, non-critical
      if (accepted) {
        void incrementPattern('interventions_accepted')
      } else if (quickDismiss) {
        void incrementPattern('interventions_quick_dismissed')
      }

      // Profile: record tone effectiveness and tolerance signal
      if (lastShownTone) {
        void recordInterventionOutcome(lastShownTone, accepted, quickDismiss)
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

  // Cognitive state estimation — runs synchronously from heuristics, no I/O
  const { estimate: cognitiveState, next: nextCogCtx } = estimateCognitiveState(
    signal,
    rawCtx,
    tabCognitiveContext.get(tabId) ?? null,
  )
  tabCognitiveContext.set(tabId, nextCogCtx)

  // Profile: record state transitions for vulnerability + escalation/recovery tracking
  if (cognitiveState.transition) {
    void recordStateTransition(
      cognitiveState.transition.from,
      cognitiveState.transition.to,
      rawCtx.session_context.minutes_active,
      cognitiveState.durationMs,
      new Date().getHours(),
    )
  }

  // Drift analysis — reads from the updated history, no I/O
  const drift       = analyzeDrift(cognitiveState.state, nextCogCtx.history)
  const driftScale  = driftCooldownScale(drift)

  // Apply drift-based cooldown adjustment alongside existing suppression
  const adjustedState = driftScale !== 1.0
    ? { ...state, suppressionMultiplier: (state.suppressionMultiplier ?? 1.0) * driftScale }
    : state

  if (!isAnyTierAllowed(adjustedState, Date.now(), rawCtx.event_type, cognitiveState.state)) return

  // Record behavioral patterns — fire-and-forget, non-critical
  void recordPatterns(rawCtx)

  // Enrich context with memory, intensity, and phrase cache before inference
  const memory        = await getMemorySummary().catch(() => undefined)
  const intensity     = resolveIntensity(rawCtx.event_type, memory)
  const recentPhrases = await getRecentPhrases()

  const ctx: CompressedContext = { ...rawCtx, memory, intensity, recentPhrases, cognitiveState, drift }

  pendingTabId     = tabId
  pendingEventType = rawCtx.event_type
  await ensureOffscreenDocument()
  chrome.runtime.sendMessage({ type: MSG.AI_CONTEXT, payload: ctx })
}

async function onIntervention(intervention: Intervention) {
  if (pendingTabId === null) return

  const state = await getState()
  const pendingCogState = pendingTabId !== null ? tabCognitiveContext.get(pendingTabId)?.state : undefined
  const tier  = computeTier(intervention.confidence, state, Date.now(), pendingEventType ?? undefined, pendingCogState)

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

  // Track tone so DISMISSED can record outcome against correct style
  lastShownTone = intervention.tone

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
