import { evaluate } from '@heuristics/index'
import { getState, patchState } from '@storage/index'
import { ensureOffscreenDocument } from './offscreen'
import { compress } from '@ai/pipeline'
import { guardianVerdict, isAnyTierAllowed, afterIntervention, afterDismissal } from './gate'
import { incrementPattern, getMemorySummary, recordInterventionOutcome, recordSessionEnd, recordStateTransition, recordStateInterventionOutcome, recordReflectiveEngagement, getCognitiveProfile, getStateAcceptanceRate } from '@memory/index'
import { resolveIntensity } from '@ai/guidance'
import { getRecentPhrases, recordPhrase } from './phrase-cache'
import { estimateCognitiveState } from './cognitive-state'
import { analyzeDrift, driftCooldownScale, HEALTH_SCORE } from './drift'
import { resolveStrategy } from './intervention-strategy'
import { scheduleSnooze, onSnoozeAlarm, clearSnoozesForTab } from './snooze'
import { resolveAction } from './action-resolver'
import { derivePresence } from './presence'
import * as narrator from './narrator'
import { recordAlignment, getAlignmentPrior } from './priors'
import type { RollingCognitiveContext } from './cognitive-state'
import type { InterventionStrategy } from './intervention-strategy'
import type { PatternKey } from '@memory/index'
import type { Message, JudgmentPayload, DismissedPayload } from '@shared/messages'
import { MSG, GATE, PRESENCE_DEFAULT } from '@shared/constants'
import type {
  BrowsingSignal,
  BehavioralEvent,
  CognitiveState,
  DetectionResult,
  ModelLoadStatus,
  CompressedContext,
  EventType,
  DomainCategory,
} from '@shared/types'

// Pre-warm the offscreen document (and start Gemma download) as soon as the
// extension loads — not lazily on first signal. This means the model is
// downloading in the background from day one, visible in the popup.
chrome.runtime.onInstalled.addListener(() => void ensureOffscreenDocument())
chrome.runtime.onStartup.addListener(()   => void ensureOffscreenDocument())

// ─── In-flight inference routing ──────────────────────────────────────────────
// Each Narrator consultation is keyed by requestId so concurrent requests from
// different tabs can never overwrite each other (the old single-slot pending
// state routed tab A's nudge to tab B whenever signals overlapped inference).

interface PendingRequest {
  tabId:     number
  eventType: EventType
  strategy:  InterventionStrategy
  cogState:  CognitiveState
  category:  DomainCategory
  at:        number
}

const pending = new Map<string, PendingRequest>()

function prunePending(now: number): void {
  for (const [id, p] of pending) {
    if (now - p.at > 3 * 60_000) pending.delete(id)  // orphaned — offscreen never answered
  }
}

// Session-scoped quick-dismissal counter per cognitive state.
// Used by resolveStrategy to enforce per-state session caps.
// Resets naturally when the service worker restarts (new session).
const sessionQuickDismissalsByState = new Map<CognitiveState, number>()

// Evaluation: timestamp of most recent shown intervention, used to detect
// post-nudge recovery transitions.
let lastNudgeAt: number | null = null

// Evaluation thresholds
const REFLECTIVE_DWELL_MS          = 8_000        // genuine read+reflect threshold
const POST_NUDGE_RECOVERY_WINDOW_MS = 15 * 60_000  // nudge → recovery attribution window

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
  narrator.clearTab(tabId)
  void clearSnoozesForTab(tabId)  // the moment a reminder belonged to is gone
  void recordSessionEnd()  // tolerance recovers gradually as sessions end
})

// Deferred nudges ("remind me later") come back through here. chrome.alarms
// rather than a timer because the service worker is terminated while idle.
chrome.alarms.onAlarm.addListener((alarm) => {
  void onSnoozeAlarm(alarm)
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

    case MSG.JUDGMENT:
      await onJudgment(message.payload)
      break

    case MSG.DISMISSED:
      await onDismissed(message.payload, senderTabId)
      break

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
      if (message.payload === true) {
        // Re-enabling: clear all in-memory and persisted gate state so nudges
        // can fire immediately on a clean slate.
        sessionQuickDismissalsByState.clear()
        tabCognitiveContext.clear()  // drop stale drift history so recovery_in_progress doesn't persist
        pending.clear()
        await patchState({
          enabled:                true,
          lastFullIntervention:   null,
          lastSubtleIntervention: null,
          suppressionMultiplier:  1.0,
          recentDismissals:       [],
          recentNudges:           [],
        })
      } else {
        await patchState({ enabled: false })
      }
      break

    case MSG.SET_PRESENCE:
      await patchState({ presenceLevel: message.payload })
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

  // Fold the signal into the tab's session story regardless of flagging —
  // the Narrator needs the title trail even for quiet stretches.
  narrator.noteSignal(tabId, signal)

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
    const t = cognitiveState.transition
    void recordStateTransition(
      t.from,
      t.to,
      rawCtx.session_context.minutes_active,
      cognitiveState.durationMs,
      new Date().getHours(),
    )

    // Evaluation: track compulsive and reactive state entries
    if (t.to === 'compulsive_loop')      void incrementPattern('compulsive_loop_entries')
    if (t.to === 'emotionally_reactive') void incrementPattern('reactive_entries')

    // Evaluation: track recoveries — and whether a nudge preceded them
    const isRecovery = (
      (t.from === 'compulsive_loop' || t.from === 'emotionally_reactive') &&
      HEALTH_SCORE[t.to] < HEALTH_SCORE[t.from]
    )
    if (isRecovery) {
      void incrementPattern('recovery_transitions')
      if (lastNudgeAt !== null && Date.now() - lastNudgeAt < POST_NUDGE_RECOVERY_WINDOW_MS) {
        void incrementPattern('post_nudge_recoveries')
      }
    }
  }

  // Drift analysis — reads from the updated history, no I/O
  const drift      = analyzeDrift(cognitiveState.state, nextCogCtx.history)
  const driftScale = driftCooldownScale(drift)

  // Apply drift-based cooldown adjustment alongside existing suppression
  // (the Guardian clamps the combined multiplier, so stacking stays bounded)
  const adjustedState = driftScale !== 1.0
    ? { ...state, suppressionMultiplier: (state.suppressionMultiplier ?? 1.0) * driftScale }
    : state

  // Resolve intervention strategy for current state, trajectory, and session history
  const sessionDismissals = sessionQuickDismissalsByState.get(cognitiveState.state) ?? 0
  const presence = derivePresence(state.presenceLevel ?? PRESENCE_DEFAULT)
  let strategy = resolveStrategy(
    cognitiveState.state,
    drift,
    cognitiveState.durationMs,
    sessionDismissals,
    presence,
  )

  // Record behavioral patterns regardless of whether an intervention fires.
  // The gate controls nudge frequency, not behavioural observation.
  void recordPatterns(rawCtx)

  const now = Date.now()

  // Guardian pre-check: skip inference when nothing could be delivered anyway
  if (!isAnyTierAllowed(adjustedState, now, rawCtx.event_type, cognitiveState.state, strategy)) return

  // Narrator cadence: one consultation per tab at a time, recent verdicts cached,
  // a confident 'aligned' buys a long quiet period
  if (!narrator.shouldConsult(tabId, rawCtx.event_type, now)) return

  // Enrich context with memory, intensity, and phrase cache before inference
  const memory        = await getMemorySummary().catch(() => undefined)
  const intensity     = resolveIntensity(rawCtx.event_type, memory)
  const recentPhrases = await getRecentPhrases()

  // Responsiveness modifier: if this user rarely engages during this cognitive state,
  // extend cooldowns further rather than continuing to fire unproductive interventions.
  const profile         = await getCognitiveProfile().catch(() => null)
  const stateAcceptance = profile ? getStateAcceptanceRate(profile, cognitiveState.state) : null
  if (stateAcceptance !== null && stateAcceptance < 0.20) {
    strategy = { ...strategy, cooldownScale: strategy.cooldownScale * 1.5 }
  }

  const ctx: CompressedContext = {
    ...rawCtx,
    memory,
    intensity,
    recentPhrases,
    cognitiveState,
    drift,
    page:              narrator.getPageSemantics(tabId, signal),
    previousNarrative: narrator.previousNarrative(tabId),
    alignmentPrior:    await getAlignmentPrior(rawCtx.page_context.category),
  }

  const requestId = crypto.randomUUID()
  prunePending(now)
  pending.set(requestId, {
    tabId,
    eventType: rawCtx.event_type,
    strategy,
    cogState:  cognitiveState.state,
    category:  rawCtx.page_context.category,
    at:        now,
  })
  narrator.markRequested(tabId, now)

  await ensureOffscreenDocument()
  chrome.runtime.sendMessage({ type: MSG.AI_CONTEXT, payload: { requestId, tabId, ctx } })
}

async function onJudgment({ requestId, judgment, intervention }: JudgmentPayload) {
  const req = pending.get(requestId)
  pending.delete(requestId)
  if (!req) return  // orphaned response (SW restarted, or request pruned)

  // Always fold the judgment into the tab story and longitudinal priors —
  // an 'aligned' verdict is as valuable to learn from as a 'captured' one.
  narrator.recordJudgment(req.tabId, judgment, req.eventType)
  if (judgment) void recordAlignment(req.category, judgment.alignment)

  if (!judgment || !intervention) return

  const state = await getState()
  const tier  = guardianVerdict(
    intervention.tier,     // the Narrator's proposal
    intervention.confidence,
    state,
    Date.now(),
    req.eventType,
    req.cogState,
    req.strategy,
  )
  if (tier === 'none') {
    // The Narrator had something to say and the Guardian declined it. Counting
    // these is what lets the popup show restraint rather than only activity —
    // for a system built to mostly stay quiet, the silences are the story.
    void incrementPattern('nudges_withheld')
    return
  }

  const tiered = {
    ...intervention,
    tier,
    action:   resolveAction(req.cogState, intervention.mechanic ?? null),
    cogState: req.cogState,
    category: req.category,
  }

  // Attempt delivery first — only update cooldowns/count if the nudge actually
  // reached the screen. Without this, a closed tab (or one already showing a
  // nudge) burns cooldown budget with nothing shown.
  try {
    const shown = await chrome.tabs.sendMessage(req.tabId, { type: MSG.INTERVENTION, payload: tiered })
    if (shown !== true) return  // slot occupied by an existing nudge
  } catch {
    return  // Tab closed or content script disconnected — skip state update
  }

  // Delivery succeeded — record state, patterns, and tracking metadata
  await patchState(afterIntervention(tier, state))
  void incrementPattern('interventions_shown')
  void recordPhrase(intervention.message)

  lastNudgeAt = Date.now()
}

async function onDismissed(
  { dwellMs, outcome, tone, cogState, category, snoozeCount, intervention }: DismissedPayload,
  senderTabId?: number,
) {
  // "Remind me later": re-arm before anything else, so nothing downstream can
  // lose a reminder the user explicitly asked for. The outcome is then recorded
  // like any other — a deferral is a data point, not an absence of one.
  if (outcome === 'snoozed' && intervention && senderTabId !== undefined) {
    await scheduleSnooze(senderTabId, intervention)
  }

  const deferred = (snoozeCount ?? 0) > 0
  const state    = await getState()
  await patchState(afterDismissal({ timestamp: Date.now(), dwellMs, outcome, deferred }, state))

  const accepted     = outcome === 'accepted'
  const rejected     = outcome === 'rejected'
  const quickDismiss = outcome === 'dismissed' && dwellMs < GATE.QUICK_DISMISS_MS

  // A nudge the user asked to have brought back, and then let time out, was not
  // really deferred — the deferral was the dismissal, just a politer one. This
  // is the only way that distinction reaches memory, since 'snoozed' itself is
  // recorded neutrally on the way in.
  const abandoned = deferred && outcome === 'ignored'
  const negative  = quickDismiss || rejected || abandoned

  // Memory: pattern counters — fire-and-forget, non-critical.
  // 'ignored' is deliberately neutral here: an unattended nudge is neither
  // engagement nor an explicit refusal.
  if (accepted) {
    void incrementPattern('interventions_accepted')
  } else if (negative) {
    void incrementPattern('interventions_quick_dismissed')
  }

  // Evaluation: reflective engagement = accepted and dwell ≥ 8 s
  if (accepted && dwellMs >= REFLECTIVE_DWELL_MS) {
    void incrementPattern('reflective_engagements')
    void recordReflectiveEngagement(dwellMs)
  }

  // Profile: record tone + per-state responsiveness. Rejection counts as the
  // strongest negative; 'ignored' passes through as neutral non-acceptance.
  void recordInterventionOutcome(tone, accepted, negative)
  void recordStateInterventionOutcome(cogState, accepted, negative)

  // Session cap: quick dismissals accumulate; an explicit rejection opts the
  // user out of this state's nudges for the rest of the session immediately.
  if (quickDismiss || abandoned) {
    const prev = sessionQuickDismissalsByState.get(cogState) ?? 0
    sessionQuickDismissalsByState.set(cogState, prev + 1)
  } else if (rejected) {
    sessionQuickDismissalsByState.set(cogState, 99)
  }

  // Feedback loop: a rejection means the Narrator called 'captured' and the
  // user disagreed — the strongest alignment label we ever receive.
  if (rejected && category) {
    void recordAlignment(category, 'aligned')
  }
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
