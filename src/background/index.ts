import { evaluate } from '@heuristics/index'
import { getState, patchState } from '@storage/index'
import { modelSetupView, enableModel, stopModel, restoreModel, acceptModelProgress } from './model-setup'
import { getAuthorizedModelRun } from '@shared/model-plan'
import { compress } from '@ai/pipeline'
import { guardianVerdict, isAnyTierAllowed, afterIntervention, afterDismissal } from './gate'
import { incrementPattern, getMemorySummary, recordInterventionOutcome, recordSessionEnd, recordStateTransition, recordStateInterventionOutcome, recordStateInterventionShown, recordReflectiveEngagement } from '@memory/index'
import { resolveIntensity } from '@ai/guidance'
import { getRecentPhrases, recordPhrase } from './phrase-cache'
import { estimateCognitiveState } from './cognitive-state'
import { analyzeDrift, driftCooldownScale, HEALTH_SCORE } from './drift'
import { resolveStrategy } from './intervention-strategy'
import { scheduleSnooze, onSnoozeAlarm, clearSnoozesForTab } from './snooze'
import { serial } from './serial'
import { freshEvents } from './evidence'
import { getCompanion, putCompanion, clearCompanion, nextSession, isCurrentIntervention } from './companion'
import { derivePresence } from './presence'
import * as narrator from './narrator'
import { recordAlignment, getAlignmentPrior } from './priors'
import type { RollingCognitiveContext } from './cognitive-state'
import type { PatternKey } from '@memory/index'
import type { Message, JudgmentPayload, DismissedPayload } from '@shared/messages'
import { MSG, GATE, OFFSCREEN_URL, PRESENCE_DEFAULT } from '@shared/constants'
import type {
  BrowsingSignal,
  BehavioralEvent,
  CognitiveState,
  DetectionResult,
  CompressedContext,
  EventType,
  DomainCategory,
  CompanionSession,
  CompanionView,
} from '@shared/types'

// Consent is required even for installations upgraded from automatic loading.
chrome.runtime.onInstalled.addListener(() => { void serial(() => restoreModel()) })
chrome.runtime.onStartup.addListener(() => { void serial(() => restoreModel()) })

// ─── In-flight inference routing ──────────────────────────────────────────────
// Each Narrator consultation is keyed by requestId so concurrent requests from
// different tabs can never overwrite each other (the old single-slot pending
// state routed tab A's nudge to tab B whenever signals overlapped inference).

interface PendingRequest {
  tabId:     number
  eventType: EventType
  cogState:  CognitiveState
  category:  DomainCategory
  at:        number
  session:   CompanionSession
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
const lastNudgeAt = new Map<number, number>()

// Evaluation thresholds
const REFLECTIVE_DWELL_MS          = 8_000        // genuine read+reflect threshold
const POST_NUDGE_RECOVERY_WINDOW_MS = 15 * 60_000  // nudge → recovery attribution window

// Bounded per-tab event buffer — enriches CompressedContext when Gemma is invoked
const MAX_EVENTS_PER_TAB = 60
const tabEvents           = new Map<number, BehavioralEvent[]>()
const latestSignals = new Map<number, BrowsingSignal>()
const recordedPatterns = new Map<number, Set<string>>()
const tabCognitiveContext = new Map<number, RollingCognitiveContext>()

function storeEvents(tabId: number, events: BehavioralEvent[]): void {
  const existing = tabEvents.get(tabId) ?? []
  const combined = freshEvents([...existing, ...events])
  tabEvents.set(tabId, combined.slice(-MAX_EVENTS_PER_TAB))
}

function recentDetections(tabId: number): DetectionResult[] {
  return freshEvents(tabEvents.get(tabId) ?? [])
    .filter((e): e is Extract<BehavioralEvent, { kind: 'detection' }> => e.kind === 'detection')
    .map(e => e.data)
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void serial(() => clearCompanion(tabId))
  latestSignals.delete(tabId)
  recordedPatterns.delete(tabId)
  lastNudgeAt.delete(tabId)
  invalidateRequests(tabId)
  tabEvents.delete(tabId)
  tabCognitiveContext.delete(tabId)
  narrator.clearTab(tabId)
  void clearSnoozesForTab(tabId)  // the moment a reminder belonged to is gone
  void recordSessionEnd()  // tolerance recovers gradually as sessions end
})

// Deferred nudges ("remind me later") come back through here. chrome.alarms
// rather than a timer because the service worker is terminated while idle.
chrome.alarms.onAlarm.addListener((alarm) => {
  void serial(() => onSnoozeAlarm(alarm))
})

// Accept the long-lived port from the offscreen document while the model is
// loading. Only actual messages reset the service-worker idle timer.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'model-keepalive') port.disconnect()
  // The offscreen document sends bounded keepalive messages while loading.
})

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    if (message.type === MSG.AI_CONTEXT || message.type === MSG.INTERVENTION ||
        message.type === MSG.GET_PAGE_SNAPSHOT || message.type === MSG.CLEAR_NUDGE) return false
    // Read-only, so it skips the queue: the model document asks while setup is
    // still creating it. Only that document may learn the run ID.
    if (message.type === MSG.GET_MODEL_RUN) {
      if (sender.tab || sender.url !== chrome.runtime.getURL(OFFSCREEN_URL)) return false
      void getAuthorizedModelRun().then(sendResponse, () => sendResponse(null))
      return true
    }
    void serial(() => dispatch(message, sender.tab?.id, sendResponse)).catch(err => {
      console.error('[Angel] message failed:', err)
      sendResponse({ error: 'Could not update Angel. Please try again.' })
    })
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

    case MSG.BEHAVIORAL_EVENTS: {
      if (senderTabId === undefined || !(await getState()).enabled) break
      const signal = await readSnapshot(senderTabId)
      if (!signal || signal.contextKey !== message.payload.contextKey) break
      await observeSession(senderTabId, signal)
      storeEvents(senderTabId, message.payload.events)
      await onBrowsingSignal(signal, senderTabId)
      break
    }

    case MSG.GET_COMPANION:
      sendResponse(await companionView(senderTabId))
      return

    case MSG.COMPANION_ACTION:
      sendResponse(await companionAction(message.payload, senderTabId))
      return

    case MSG.JUDGMENT:
      await onJudgment(message.payload)
      break

    case MSG.DISMISSED:
      await onDismissed(message.payload, senderTabId)
      break

    case MSG.GET_MODEL_SETUP:
      await restoreModel()
      sendResponse(await modelSetupView())
      return

    case MSG.SET_MODEL_SETUP:
      if (senderTabId !== undefined) throw new Error('Model setup belongs to extension controls')
      for (const tabId of latestSignals.keys()) invalidateRequests(tabId)
      if (message.payload.action === 'enable') {
        const device = message.payload.device
        if (device !== 'webgpu' && device !== 'wasm') throw new Error('Choose a supported device')
        await enableModel(device)
      } else if (message.payload.action === 'defer' || message.payload.action === 'cancel') {
        await stopModel()
        const tabs = await chrome.tabs.query({})
        await Promise.allSettled(tabs.filter(t => t.id !== undefined).map(async t => {
          await clearSnoozesForTab(t.id!)
          await chrome.tabs.sendMessage(t.id!, { type: MSG.CLEAR_NUDGE })
        }))
      }
      sendResponse(await modelSetupView())
      return

    case MSG.MODEL_PROGRESS:
      if (senderTabId === undefined) await acceptModelProgress(message.runId, message.payload)
      break

    case MSG.GET_STATE:
      sendResponse({ ...(await getState()), modelStatus: (await modelSetupView()).status })
      return

    case MSG.SET_ENABLED:
      // Toggling must not erase user corrections or the interruption budget.
      for (const tabId of latestSignals.keys()) invalidateRequests(tabId)
      await patchState({ enabled: message.payload })
      if (!message.payload) {
        const tabs = await chrome.tabs.query({})
        await Promise.allSettled(tabs.filter(t => t.id !== undefined).map(t =>
          chrome.tabs.sendMessage(t.id!, { type: MSG.CLEAR_NUDGE })))
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
  const session = await observeSession(tabId, signal)
  narrator.noteSignal(tabId, signal)

  const result = evaluate(signal)

  const rawCtx = compress(
    result.reasons,
    signal,
    recentDetections(tabId),
    freshEvents(tabEvents.get(tabId) ?? []),
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
      cognitiveState.previousDurationMs ?? 0,
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
      const nudgeAt = lastNudgeAt.get(tabId)
      if (t.from === 'compulsive_loop' && nudgeAt !== undefined && Date.now() - nudgeAt < POST_NUDGE_RECOVERY_WINDOW_MS) {
        lastNudgeAt.delete(tabId)
        void incrementPattern('post_nudge_recoveries')
      }
    }
  }

  const signature = JSON.stringify([signal.pageTitle, signal.mediaPlaying, [...rawCtx.signals].sort()])
  if (session.evidenceSignature !== signature) {
    session.evidenceSignature = signature
    session.revision++
    invalidateRequests(tabId)
    await putCompanion(tabId, session)
  }
  // Cheap state estimation runs even during quiet stretches. Inference remains sparse.
  if (session.quiet || (!result.flagged && rawCtx.signals.every(s => s === 'session_long'))) return

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
  const strategy = resolveStrategy(
    cognitiveState.state,
    drift,
    cognitiveState.durationMs,
    sessionDismissals,
    presence,
  )

  // Record behavioral patterns regardless of whether an intervention fires.
  // The gate controls nudge frequency, not behavioural observation.
  void recordPatterns(rawCtx, tabId)

  const now = Date.now()

  await restoreModel()
  const modelRun = await getAuthorizedModelRun()
  if (!modelRun || (await modelSetupView()).status.phase !== 'ready') return

  // Guardian pre-check: skip inference when nothing could be delivered anyway
  if (!isAnyTierAllowed(adjustedState, now, rawCtx.event_type, cognitiveState.state, strategy)) return

  // Narrator cadence: one consultation per tab at a time, recent verdicts cached,
  // a confident 'aligned' buys a long quiet period
  if (!narrator.shouldConsult(tabId, rawCtx.event_type, now)) return

  // Enrich context with memory, intensity, and phrase cache before inference
  const memory        = await getMemorySummary().catch(() => undefined)
  const intensity     = resolveIntensity(rawCtx.event_type, memory)
  const recentPhrases = await getRecentPhrases()

  const ctx: CompressedContext = {
    ...rawCtx,
    explicitIntent: session.intent ?? undefined,
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
    cogState:  cognitiveState.state,
    category:  rawCtx.page_context.category,
    at:        now,
    session,
  })
  narrator.markRequested(tabId, now)

  try {
    void chrome.runtime.sendMessage({ type: MSG.AI_CONTEXT, payload: { modelRunId: modelRun.id, requestId, tabId, ctx, expiresAt: now + 90_000 } }).catch(() => {
      if (pending.delete(requestId)) narrator.invalidate(tabId)
    })
  } catch {
    pending.delete(requestId)
    narrator.invalidate(tabId)
  }
}

async function onJudgment({ requestId, judgment, intervention }: JudgmentPayload) {
  const req = pending.get(requestId)
  pending.delete(requestId)
  if (!req || !(await getAuthorizedModelRun()) || (await modelSetupView()).status.phase !== 'ready') return
  const currentSession = await getCompanion(req.tabId)
  const signal = await readSnapshot(req.tabId)
  if (!currentSession || !signal || currentSession.revision !== req.session.revision ||
      currentSession.episodeId !== req.session.episodeId || currentSession.quiet ||
      signal.contextKey !== req.session.contextKey ||
      Date.now() - req.at > 90_000 || !(await getState()).enabled) {
    narrator.invalidate(req.tabId)
    return
  }

  const currentContext = compress([], signal, recentDetections(req.tabId), freshEvents(tabEvents.get(req.tabId) ?? []))
  const signature = JSON.stringify([signal.pageTitle, signal.mediaPlaying, [...currentContext.signals].sort()])
  if (signature !== currentSession.evidenceSignature) {
    invalidateRequests(req.tabId)
    return
  }
  narrator.recordJudgment(req.tabId, judgment, req.eventType)
  // Model predictions are not user labels and never train alignment priors.
  if (!judgment || !intervention || judgment.alignment === 'aligned' || judgment.alignment === 'unknown') return
  if (intervention.reasonKey && currentSession.lastReason === intervention.reasonKey) return

  const state = await getState()
  const rolling = tabCognitiveContext.get(req.tabId)
  if (!rolling) return
  const drift = analyzeDrift(rolling.state, rolling.history)
  const strategy = resolveStrategy(rolling.state, drift, Date.now() - rolling.enteredAt,
    sessionQuickDismissalsByState.get(rolling.state) ?? 0,
    derivePresence(state.presenceLevel ?? PRESENCE_DEFAULT))
  const tier = guardianVerdict(intervention.tier, intervention.confidence,
    { ...state, suppressionMultiplier: state.suppressionMultiplier * driftCooldownScale(drift) },
    Date.now(), currentContext.event_type, rolling.state, strategy)
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
    action: 'none' as const,
    contextKey: req.session.contextKey,
    contextTitle: signal.pageTitle,
    episodeId: req.session.episodeId,
    revision: req.session.revision,
    expiresAt: req.at + 90_000,
    cogState: req.cogState,
    category: req.category,
  }

  // Attempt delivery first — only update cooldowns/count if the nudge actually
  // reached the screen. Without this, a closed tab (or one already showing a
  // nudge) burns cooldown budget with nothing shown.
  try {
    const tab = await chrome.tabs.get(req.tabId)
    if (!tab.active || !isCurrentIntervention(tiered, currentSession)) return
    const shown = await chrome.tabs.sendMessage(req.tabId, { type: MSG.INTERVENTION, payload: tiered })
    if (shown !== true) return  // slot occupied by an existing nudge
  } catch {
    return  // Tab closed or content script disconnected — skip state update
  }

  // Delivery succeeded — record state, patterns, and tracking metadata
  await patchState(afterIntervention(tier, state))
  await recordStateInterventionShown(req.cogState)
  void incrementPattern('interventions_shown')
  void recordPhrase(intervention.message)

  currentSession.lastExplanation = intervention.explanation
  currentSession.lastReason = intervention.reasonKey
  await putCompanion(req.tabId, currentSession)
  if (req.cogState === 'compulsive_loop') lastNudgeAt.set(req.tabId, Date.now())
}

async function onDismissed(
  { dwellMs, outcome, tone, cogState, category, snoozeCount, intervention, episodeId }: DismissedPayload,
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

  // An ignored reminder is ambiguous timing feedback, never a hidden refusal.
  const negative = quickDismiss || rejected

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

    // Only explicit feedback compares usefulness. Unattended pills cannot be
  // treated as failed acceptances of an action they never offered.
  if (accepted || rejected) {
    await recordInterventionOutcome(tone, accepted, negative)
    await recordStateInterventionOutcome(cogState, accepted, negative)
  }

  // Session cap: quick dismissals accumulate; an explicit rejection opts the
  // user out of this state's nudges for the rest of the session immediately.
  if (quickDismiss) {
    const prev = sessionQuickDismissalsByState.get(cogState) ?? 0
    sessionQuickDismissalsByState.set(cogState, prev + 1)
  }
  if (rejected && senderTabId !== undefined) {
    const session = await getCompanion(senderTabId)
    if (session && session.episodeId === episodeId) {
      session.quiet = true
      session.revision++
      await putCompanion(senderTabId, session)
      invalidateRequests(senderTabId)
      await clearSnoozesForTab(senderTabId)
    }
  }

  // Feedback loop: a rejection means the Narrator called 'captured' and the
  // user disagreed — the strongest alignment label we ever receive.
  if (rejected && category) {
    await recordAlignment(category, 'aligned')
  }
}

// ─── Pattern recording ────────────────────────────────────────────────────────
// Maps abstract behavioral context to pattern keys. No URLs, no content.

async function recordPatterns(ctx: CompressedContext, tabId: number): Promise<void> {
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
  const seen = recordedPatterns.get(tabId) ?? new Set<string>()
  recordedPatterns.set(tabId, seen)
  for (const [key, delta] of writes) {
    if (seen.has(key)) continue
    seen.add(key)
    await incrementPattern(key, delta)
  }
}


function invalidateRequests(tabId: number): void {
  for (const [id, request] of pending) if (request.tabId === tabId) pending.delete(id)
  narrator.invalidate(tabId)
}

async function readSnapshot(tabId: number): Promise<BrowsingSignal | null> {
  try { return await chrome.tabs.sendMessage(tabId, { type: MSG.GET_PAGE_SNAPSHOT }) ?? null }
  catch { return null }
}

async function observeSession(tabId: number, signal: BrowsingSignal): Promise<CompanionSession> {
  const previous = await getCompanion(tabId)
  const session = nextSession(previous, signal)
  if (previous?.contextKey !== signal.contextKey) {
    invalidateRequests(tabId)
    tabEvents.delete(tabId)
    tabCognitiveContext.delete(tabId)
    lastNudgeAt.delete(tabId)
    await clearSnoozesForTab(tabId)
  }
  if (previous?.episodeId !== session.episodeId) {
    narrator.clearTab(tabId)
    recordedPatterns.delete(tabId)
  }
  latestSignals.set(tabId, signal)
  await putCompanion(tabId, session)
  return session
}

async function companionTarget(senderTabId?: number): Promise<number | undefined> {
  if (senderTabId !== undefined) return senderTabId
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id
}

async function companionView(senderTabId?: number): Promise<CompanionView> {
  const tabId = await companionTarget(senderTabId)
  if (tabId === undefined) return { available: false, session: null }
  const signal = await readSnapshot(tabId)
  if (!signal) return { available: false, session: null }
  return { available: true, session: await observeSession(tabId, signal) }
}

async function companionAction(
  payload: { action: import('@shared/types').CompanionAction; intent?: string },
  senderTabId?: number,
): Promise<CompanionView> {
  const tabId = await companionTarget(senderTabId)
  if (tabId === undefined) return { available: false, session: null }
  const view = await companionView(tabId)
  const session = view.session
  if (!session) return view
  switch (payload.action) {
    case 'intent':
      session.intent = typeof payload.intent === 'string' ? payload.intent.trim().slice(0, 160) || null : null
      session.quiet = false
      session.lastReason = undefined
      break
    case 'quiet': session.quiet = true; break
    case 'resume': session.quiet = false; break
    case 'save': {
      const signal = latestSignals.get(tabId)
      if (signal && /^https?:\/\//.test(signal.url)) {
        session.returnPoint = { url: signal.url, title: signal.pageTitle || 'Saved page' }
      }
      break
    }
    case 'open':
      if (session.returnPoint && /^https?:\/\//.test(session.returnPoint.url)) {
        await chrome.tabs.create({ url: session.returnPoint.url })
      }
      return view
    case 'forget': session.returnPoint = undefined; break
    default: return view
  }
  if (payload.action !== 'save' && payload.action !== 'forget') session.revision++
  await putCompanion(tabId, session)
  invalidateRequests(tabId)
  await clearSnoozesForTab(tabId)
  if (payload.action !== 'save' && payload.action !== 'forget') {
    await chrome.tabs.sendMessage(tabId, { type: MSG.CLEAR_NUDGE }).catch(() => undefined)
  }
  return { available: true, session }
}
