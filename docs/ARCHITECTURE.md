# Architecture

Angel is a layered pipeline running entirely within the Chrome extension sandbox. This document describes each layer, its responsibilities, and the design decisions behind it.

Authority in the pipeline is split three ways — **the Witness collects, the Narrator judges, the Guardian bounds**:

- **Witness** (Layers 1–5): detectors, trackers, heuristics, cognitive state estimation, and drift tracking produce *testimony*. Nothing in these layers can trigger a nudge; a heuristic flag means "worth the Narrator's attention", never "intervene".
- **Narrator** (Layer 8): on-device Gemma reconstructs the session story from semantic and behavioral evidence, judges intent alignment (`aligned` / `drifting` / `captured`), and decides whether, at what tier, and with what words to nudge. An `aligned` verdict is a hard veto enforced in code.
- **Guardian** (Layer 7): a small set of hard delivery limits — absolute spacing floor, hourly budget, bounded adaptive cooldowns, tier clamp. It can refuse or shrink the Narrator's proposal, never originate one.

The organizing question is intent alignment, not content classification: manipulation is a mismatch between what the user came to do and what the environment got them doing. No topic, site, or format is judged bad — only trajectories are.

---

## Execution Contexts

Chrome MV3 extensions have three isolated execution environments. Angel uses all three deliberately:

| Context | Files | Capabilities | Angel's Use |
|---|---|---|---|
| **Content Script** | `src/content/` | DOM access, page events, chrome.runtime messaging | Behavioral signal collection, nudge rendering |
| **Service Worker** | `src/background/` | All chrome APIs, no DOM | Reasoning, gating, memory access, intervention dispatch |
| **Offscreen Document** | `src/offscreen/` | Worker APIs, no DOM, no chrome APIs | Gemma inference (isolated from page) |

This separation is not incidental — it enforces the privacy model. The inference context (`offscreen/`) never has access to the page DOM. The content script never has access to the behavioral profile stored in IndexedDB. The service worker never runs inference directly.

---

## Layer 1: Behavioral Signal Collection

**Files:** `src/content/detectors/`, `src/content/trackers/`

### Detectors

Detectors perform local DOM and text-node analysis. They run on a 30-second interval and on `MutationObserver` notifications when significant DOM changes occur.

Some detectors walk text nodes and regex-match them in memory — for example, the urgency detector matches against 7 language categories, and the countdown detector reads displayed timer text to confirm a decreasing value. No matched text, no page content, and no URLs are stored or emitted downstream. Only structured summaries flow out.

Each detector produces a `DetectionResult`:
```typescript
interface DetectionResult {
  detector:    DetectorId          // 'countdown_timer' | 'urgency_language' | etc.
  found:       boolean
  confidence:  number              // 0–1
  count:       number              // distinct instances; no DOM refs stored
  categories?: readonly number[]   // sub-pattern indices that fired (detector-specific)
}
```

Detectors are designed to be:
- **Conservative** — two-sample confirmation for anything time-varying (e.g. the countdown detector's `lastSeconds` WeakMap confirms the timer is actually decreasing before flagging)
- **Privacy-preserving** — page text is regex-matched in memory and immediately discarded; only boolean/count results flow downstream
- **Selectively stateful** — module-level state is allowed for cross-call continuity (WeakMap for per-element state, plain counters for page-level accumulators)

### Trackers

Trackers maintain lightweight running state (EMA values, counters) to compute behavioral continuity signals that detectors cannot observe.

- `scroll-continuity.ts`: Computes scroll velocity EMA using a 200ms event window. `doom_scrolling` flag fires when sustained velocity ≥ 2500 px/s. Also tracks scroll depth percentage.
- `session.ts`: Tracks `minutes_active` using `requestAnimationFrame` timestamps, not `Date.now()` — this correctly handles tab backgrounding.
- `interaction-loop.ts`: Maintains a sliding window of user events (clicks, keypresses, scroll starts). High event rate (> N events / 30s window) contributes to `rapid_interaction` signal.

### Two separate event streams

`src/content/index.ts` sends two distinct message types to the service worker:

- **`BrowsingSignal`** (every 30 seconds) — page-level metrics plus lightweight semantic context: `timeOnPage` (visible-foreground seconds only), `scrollDepth`, `idleTime` (0 while media plays — watching is engagement, not idleness), `switchCount` (rolling 10-minute window), `domain`, `pageTitle`, `mediaPlaying`, and `entry` (search / direct / social / external provenance). No detection results, no DOM content. The title and entry type feed the Narrator's session story in service-worker memory; they are never persisted.
- **`BehavioralEvent[]`** — individual detection and tracking events accumulated per tab. Each event is typed as either `kind: 'detection'` (carrying a `DetectionResult`) or `kind: 'tracking'` (carrying a `TrackingResult`).

The service worker keeps a per-tab buffer of `BehavioralEvent[]`. When a `BrowsingSignal` arrives and the heuristic flags it, the service worker fuses both streams by calling `compress()` — which combines the heuristic reasons, the `BrowsingSignal` metrics, and the buffered `BehavioralEvent[]` into a single `CompressedContext` for downstream inference.

---

## Layer 2: Heuristics Engine

**File:** `src/heuristics/index.ts`

The heuristics engine evaluates the `BrowsingSignal` and makes the binary decision: worth the Narrator's attention, or not. A flag is an **attention trigger, never a verdict** — it starts the judgment pipeline; it cannot cause a nudge by itself. It operates entirely on behavioral metrics — it does not inspect detector results.

Flagging fires when at least one of these behavioral conditions holds:
- `idleTime ≥ IDLE_THRESHOLD_S` (60 s of inactivity on the page) → `extended-idle` — never fires while media is playing, since the observer reports zero idle during playback
- `switchCount ≥ TAB_SWITCH_THRESHOLD` (8 tab-focus events within the rolling 10-minute window) → `rapid-tab-switching`
- `scrollDepth ≥ 0.60` within `timeOnPage ≤ 300 s` → `excessive-scroll`
- `mediaPlaying` with `timeOnPage ≥ 1800 s` → `extended-media-session` — surfaces long autoplay chains that the idle/scroll heuristics are structurally blind to, so the Narrator can judge whether it's a chosen film or a rabbit hole

A minimum `timeOnPage` guard (`MIN_PAGE_TIME_S = 30 s`) prevents flagging sessions that haven't had enough time to be meaningful. Confidence is `min(reasons.length / 2, 1)`.

When `flagged = true`, the service worker proceeds to the compression step, which merges the behavioral signal with the per-tab detector event buffer.

---

## Layer 3: AI Pipeline (Context Compression)

**Files:** `src/ai/pipeline/`

When a signal is flagged, the AI pipeline synthesizes it into a `CompressedContext`. This is the translation step: raw behavioral evidence becomes a semantic summary that Gemma can reason from efficiently.

```
src/ai/pipeline/
  signals.ts   — DetectionResult[] → SignalLabel[] (normalized signal names)
  domain.ts    — URL → DomainCategory (ecommerce | social | news | streaming | general)
  classify.ts  — SignalLabel[] → EventType (checkout_pressure | engagement_hook | …)
  session.ts   — tracker metrics → SessionContext (minutes_active, doom_scrolling, tab_count)
  index.ts     — orchestrates the above into CompressedContext
```

The `CompressedContext` is what gets passed through the rest of the pipeline. Its behavioral core contains only derived fields — raw HTML, raw page text, CSS selectors, and full URLs must not enter it; only categorical/numeric fields (`EventType`, `DomainCategory`, `ScrollDepth`, `TimeBucket`, `TabActivity`) are permitted.

The background then attaches the **Narrator context** before inference: `page` (title, title trail, entry type, media state), `previousNarrative` (the model's last session story for this tab), and `alignmentPrior` (the per-category longitudinal prior). These are the semantic exception, allowed under a strict rule: they live only in per-tab service-worker memory and the local inference prompt — never persisted, never transmitted. Local inference is what makes this safe: nothing the model sees can leave the device.

---

## Layer 4: Cognitive State Estimation

**File:** `src/background/cognitive-state.ts`

The state estimator maps a `CompressedContext` onto the 7-state cognitive model using a weighted signal scoring function. It maintains a per-tab `RollingCognitiveContext` in memory:

```typescript
interface RollingCognitiveContext {
  state:      CognitiveState
  history:    CognitiveState[]    // bounded ring buffer, last N states
  durationMs: number              // time in current state
  enteredAt:  number              // timestamp of last transition
  transition: StateTransition | null  // if a transition just occurred
}
```

State scoring uses `HEALTH_SCORE` weights — **lower = healthier/more intentional, higher = more escalated/reactive**:
```typescript
const HEALTH_SCORE: Record<CognitiveState, number> = {
  intentional_browsing:  0.00,
  exploratory_browsing:  0.20,
  passive_consumption:   0.40,
  fragmented_attention:  0.50,
  decision_fatigue:      0.60,
  compulsive_loop:       0.85,
  emotionally_reactive:  0.95,
}
```

**Transition rule:** a transition fires when the top-scoring candidate differs from the current state AND its score exceeds the current state's score by at least `TRANSITION_MARGIN = 0.15`. There is no consecutive-evaluation requirement — the margin alone controls stability. If two states score within 0.15 of each other, the current state is held.

When a transition occurs, the `transition` field is populated and the service worker records it in memory for longitudinal analysis.

---

## Layer 5: Drift Tracking

**File:** `src/background/drift.ts`

Drift analysis looks at the 1-hour transition history and computes a `DriftEstimate` using an **exponentially-weighted slope** (half-life = 20 min):

```typescript
interface DriftEstimate {
  direction:   DriftDirection   // 'escalating' | 'recovering' | 'stable' | 'fluctuating'
  confidence:  number           // 0–1: strength of the directional signal
  depth:       number           // 0–1: HEALTH_SCORE of current state (higher = worse)
  slope?:      number           // weighted average of per-transition deltas
  velocity?:   number           // (HEALTH_SCORE[now] - HEALTH_SCORE[first]) / windowMinutes
  trajectory:  DriftTrajectory | null
}
```

**Direction** is determined from the weighted slope:

| Direction | Condition |
|---|---|
| `escalating` | slope > 0.05 |
| `recovering` | slope < -0.05 |
| `fluctuating` | ≥ 2 escalating AND ≥ 2 recovering transitions, `\|slope\|` < 0.15 |
| `stable` | `\|slope\|` ≤ 0.05 |

**Named trajectories** (checked in priority order — first match wins):

| Trajectory | Cooldown scale |
|---|---|
| `recovery_in_progress` | 2.00× — do not interrupt |
| `urgency_spiral` | 0.55× — purchase window is time-sensitive |
| `attention_fragmentation` | 1.40× — already distracted, back off |
| `decision_overload` | 0.80× — timely nudge is useful |
| `rapid_escalation` | 0.50× — urgent, act now |
| `gradual_escalation` | 0.70× — intervene before it deepens |

If no trajectory matches, the direction-based fallback applies: `recovering` → 1.60×, `escalating` with depth > 0.6 → 0.80×, otherwise 1.0×.

---

## Layer 6: Adaptive Strategy Resolution

**File:** `src/background/intervention-strategy.ts`

The strategy resolver translates the cognitive state + drift + session history into an `InterventionStrategy`. Each state has a baseline strategy in the `STATE_STRATEGY` table:

| State | Min Confidence | Preferred Tier | Cooldown Scale | Entry Delay | Session Cap |
|---|---|---|---|---|---|
| `intentional_browsing` | 0.90 | `none` | 3.0× | — | 1 |
| `exploratory_browsing` | 0.78 | `subtle` | 2.0× | 5 min | 2 |
| `passive_consumption` | 0.55 | `subtle` | 1.5× | 3 min | 3 |
| `compulsive_loop` | 0.60 | `subtle` | 0.70× | 2 min | 3 |
| `emotionally_reactive` | 0.58 | `full` | 0.65× | 30 s | 2 |
| `fragmented_attention` | 0.72 | `subtle` | 1.80× | 4 min | 2 |
| `decision_fatigue` | 0.58 | `full` | 0.85× | 3 min | 3 |

Six dynamic overrides are applied in priority order (first matching condition returns early):

1. **Recovering trajectory** → `preferredTier = 'none'`, `cooldownScale *= 2.0` — never interrupt a correction already in progress
2. **State entry delay active** → `preferredTier = 'none'` — let the new state stabilize before the first nudge
3. **Session dismissal cap reached** → `preferredTier = 'none'` — user has opted out for this state this session
4. **Long-term stable compulsive/reactive (> 30 min)** → `cooldownScale *= 2.0`, `preferredTier = 'subtle'` — user has settled; continuing to nudge adds pressure without value
5. **Rapid escalation** → `cooldownScale *= 0.60` — bring the intervention forward before the state deepens
6. **State responsiveness < 20%** (from user profile, applied in `background/index.ts`) → `cooldownScale *= 1.5` — user is persistently unreceptive; reduce frequency rather than escalate

### Presence Modulation

**File:** `src/background/presence.ts`

After the dynamic overrides, `resolveStrategy()` applies a final bias layer derived from the user's Angel Presence setting (0.0–1.0, default 0.45). `derivePresence()` converts the slider level into a `PresenceProfile`:

```typescript
interface PresenceProfile {
  level:           number      // raw 0–1 value
  zone:            'quiet' | 'adaptive' | 'active'
  cooldownScale:   number      // 1.75 → 1.0 → 0.25 across the range
  confidenceDelta: number      // +0.15 → 0.0 → -0.15
  entryDelayScale: number      // 1.75 → 1.0 → 0.25
  sessionCapDelta: number      // -1 | 0 | +2 per zone
}
```

Zone boundaries: quiet (≤ 0.33), adaptive (0.33–0.66), active (≥ 0.67). The returned strategy multiplies cooldowns by `presence.cooldownScale`, clamps `minConfidence ± presence.confidenceDelta`, scales `stateEntryDelayMs` by `presence.entryDelayScale`, and adjusts `sessionDismissalCap` by `presence.sessionCapDelta`.

This is applied as a bias on top of the dynamic overrides, not before them — the recovery/suppression logic always takes precedence.

---

## Layer 7: The Guardian

**File:** `src/background/gate.ts`

The Guardian enforces delivery ceilings — it clamps the Narrator's proposal, never originates one. Its verdict runs twice: a fast pre-check before inference (`isAnyTierAllowed`, so the model isn't consulted when nothing could be delivered) and the binding check at delivery (`guardianVerdict`).

Hard limits, unscaled by anything:

1. **Absolute floor** — never two nudges within `MIN_GAP_MS` (2.5 min)
2. **Hourly budget** — at most `HOURLY_BUDGET` (5) nudges in any rolling hour, tracked in a persisted ring buffer

Adaptive spacing on top:

```
multiplier = clamp(
  state.suppressionMultiplier      (outcome-weighted dismissal history)
  × event_type_scale               (checkout = 0.5, passive = 2.0, ambient = 3.0, …)
  × cognitive_state_scale          (compulsive = 0.6, intentional = 2.5, …)
  × strategy.cooldownScale         (incl. drift + presence biases),
  MULTIPLIER_MIN = 0.5, MULTIPLIER_MAX = 6.0
)
effective_cooldown = SUBTLE_COOLDOWN_MS × multiplier
```

The clamp is the crucial change from the earlier design: the previous pipeline multiplied six unbounded factors, and stacked worst cases collapsed the 5-minute cooldown to ~30 seconds — the "rapid-fire nudges" failure mode.

Tier clamping (the Narrator proposes `subtle` or `full`):
1. `strategy.preferredTier === 'none'` (recovery / entry delay / session cap) → `none`
2. `confidence < strategy.minConfidence` → `none`
3. Floor, budget, or effective cooldown not satisfied → `none`
4. Proposed `full` is honored only if the state's tier ceiling allows it, `confidence ≥ 0.70`, and the full-card cooldown (20 min × multiplier) has elapsed — otherwise it degrades to `subtle`

The `suppressionMultiplier` is derived from an **outcome-weighted** negativity ratio over the last 20 dismissals: quick dismissal = 1.0, `ignored` (auto-timeout, never touched) = 0.5, `rejected` ("Not now") = 1.5, `snoozed` ("Remind me later") = 0, engaged dismissal or acceptance = 0. Any negative outcome on a nudge that was itself a deferred re-delivery is doubled, capped at 1.5. Weighting `ignored` matters: the earlier design counted an auto-dismissed nudge as an engaged one, so the system systematically overestimated its own welcome. It decays over time as sessions end (via `recordSessionEnd()`).

---

## Layer 8: The Narrator (Offscreen Inference)

**Files:** `src/offscreen/`, `src/ai/`, `src/background/narrator.ts`, `src/background/priors.ts`

### Consultation cadence

The Narrator is consulted sparingly. `src/background/narrator.ts` keeps a per-tab **session story** (entry type, title trail, last narrative, last judgment) and gates consultation:

- one in-flight request per tab (auto-expires after 3 min if the response is lost)
- at least 90 s between consultations per tab
- a confident `aligned` verdict (≥ 0.65) suppresses re-judging for 8 minutes, unless the witness event type changes

Every request carries a `requestId`; the background keeps a `Map<requestId, PendingRequest>` so concurrent judgments from different tabs can never cross wires. (The earlier single-slot pending state could deliver tab A's nudge to tab B whenever signals overlapped a slow inference.)

### The judgment

When the Guardian pre-check passes and the cadence allows, the service worker:
1. Fetches the Memory Summary from IndexedDB and the alignment prior for the page's domain category
2. Calls `resolveIntensity()` to determine tone, `getRecentPhrases()` for the similarity exclusion list
3. Attaches the page semantics and previous narrative, and sends `MSG.AI_CONTEXT` (`{requestId, tabId, ctx}`) to the offscreen document

The offscreen document calls `judgeSession()` (`src/ai/index.ts`), which:
1. Runs the Manipulation Interpreter for the `observation` line and `mechanic`
2. Runs `infer()` with the three-line evidence prompt (semantic / witness / continuity)
3. Validates the judgment JSON — strict on `alignment`, `decision_state`, `confidence`; lenient defaults on secondary fields so trivia never burns a retry
4. Enforces the hard veto: a nudge is proposed only when `decision_state === 'intervene'` AND `alignment !== 'aligned'` AND the message is non-empty
5. Replies with `MSG.JUDGMENT` (`{requestId, tabId, judgment, intervention|null}`) — always, even on failure, so the in-flight lock is released

The background records the judgment into the tab's session story and the per-category alignment priors *regardless of whether a nudge fires* — an `aligned` verdict is as valuable to learn from as a `captured` one. If an intervention was proposed, the Guardian clamps its tier, `resolveAction(cognitiveState, mechanic)` deterministically assigns the action label, and the nudge routes to the content script via `chrome.tabs.sendMessage(tabId, …)`.

### Alignment priors

`src/background/priors.ts` tallies judgment verdicts per `DomainCategory` (never per domain or URL) in `chrome.storage.local`, with periodic halving so recent behavior dominates. Once a category has ≥ 5 observations it is summarized into a single prompt token: `usually_aligned` / `mixed` / `often_captured`. A rejected nudge ("Not now — I chose to be here") writes a corrective `aligned` tally — the strongest label the system ever receives.

---

## Layer 9: Nudge UI

**Files:** `src/content/ui.tsx`, `src/ui/components/Nudge.tsx`

The content script receives the `Intervention` and renders it using the tier-matched component:

Both tiers render into a shadow root anchored to the **top-right** of the viewport (28 px inset, maximum z-index), so host-page CSS cannot reach them and their styles cannot leak out:

- **subtle pill** — small, unobtrusive single line, auto-dismisses after 10 seconds. No buttons beyond the close control: its premise is presence, not demand
- **full card** — card with the manipulation observation (in muted text above), the intervention message, an action button, and two ways to decline — "Not now — I chose to be here" and "Remind me later"

Dwell time is measured from render to dismiss. Five outcomes are distinguished and sent back via `MSG.DISMISSED`:

| Outcome | Trigger | Effect |
|---|---|---|
| `accepted` | action button clicked | positive; ≥ 8 s dwell counts as reflective engagement |
| `dismissed` | close button | neutral-to-negative; < 3 s dwell counts as quick dismissal |
| `ignored` | auto-timeout, never touched | mild negative (0.5 weight) — never mistaken for engagement |
| `rejected` | "Not now" clicked | strong negative: instantly caps the session for that cognitive state and writes a corrective `aligned` tally to the category's prior |
| `snoozed` | "Remind me later" clicked | neutral on its own (0 weight, no session-cap tick); the nudge returns in 5 minutes and is judged by what happens then |

The payload also echoes `tone`, `cogState`, `category`, and `snoozeCount` (rather than relying on module-level state) so effectiveness tracking and prior correction survive service worker restarts.

### Deferral — "Remind me later"

**File:** `src/background/snooze.ts`

Only the full card offers deferral, and only `SNOOZE.MAX` (2) times per nudge — past the cap the button stops rendering, so an intervention always resolves into a real signal rather than being pushed forward indefinitely. The deferred payload is stored in `chrome.storage.session` and re-armed with `chrome.alarms`; a `setTimeout` would not survive the service worker's ~30 s idle termination.

This is the one path where a nudge reaches the user without the Guardian's approval, because the user asked for it — routing it back through `guardianVerdict` would swallow it, since a 5-minute deferral clears `MIN_GAP_MS` but loses to `SUBTLE_COOLDOWN_MS` as soon as the adaptive multiplier exceeds 1. Four conditions still gate re-delivery: Angel must still be enabled, the tab must still exist, its origin must be unchanged (a reflection about a checkout countdown is noise on an unrelated page), and the one-nudge-at-a-time slot must be free — if it is occupied the alarm re-arms for a minute, up to 3 times. Delivery is recorded through `afterIntervention`, so the hourly budget and subsequent cooldowns account for it: the bypass skips the veto, not the bookkeeping.

**Closing the loop.** A free deferral would make "Remind me later" the lowest-friction way to make a nudge disappear, and a user who always took that exit would teach the gate nothing. So the deferral is judged by what happened when the nudge came back. Re-delivered nudges carry `deferred: true` into their `DismissalRecord`, and `negativeWeight` doubles any negative outcome on one (capped at 1.5) — a nudge asked for again and then let time out counts as a stronger refusal than a first-time ignore, and also ticks the session cap. Accepting after a deferral stays weight 0: that is the timing feedback working as intended.

---

## Data Flow Summary

```
Page DOM
  → Detectors (local DOM + text-node analysis; only counts/booleans emitted)  ─┐
  → Trackers  (behavioral metrics: velocity, session, interaction rate)         ├→ BehavioralEvent[] (per-tab buffer in SW)
  → BrowsingSignal (every 30s: visible time, scroll, media-aware idle,          ─┘
      rolling switchCount, title, entry provenance)
  → Heuristics Engine (attention trigger — flags mean "consult the Narrator")
  → compress() [SW] — fuses BrowsingSignal + BehavioralEvent[] into CompressedContext
  → Cognitive State Estimator (7-state, margin-based transitions)   — witness evidence
  → Drift Tracker (exponentially-weighted slope → trajectory)       — witness evidence
  → Strategy Resolver (per-state ceilings + presence bias)
  → Guardian pre-check (floor, budget, cooldown) + Narrator cadence (per-tab)
  → [Offscreen] Manipulation Interpreter
  → [Offscreen] Gemma 4 2B — session story → alignment judgment → nudge proposal
  → JUDGMENT {requestId, judgment, intervention?} → session story + alignment priors
  → Guardian verdict (tier clamp) → Action Resolver → Content Script Nudge UI
  → Outcome (dwellMs + accepted/dismissed/ignored/rejected/snoozed)
      └─ snoozed → chrome.alarms (5 min) → re-delivery into the same tab+origin
  → Memory (pattern counters + profile updates + prior correction)
```

No step in this pipeline writes URLs, page content, or personally identifying information. Page titles and narratives flow only through per-tab memory and the local prompt. The only persistent artifacts are integer counters, floating-point EMA values, category-level alignment tallies, and the synthesized memory summary that discards all raw data.

---

## Performance Considerations

| Operation | Latency | Notes |
|---|---|---|
| Signal dispatch (30s interval) | < 5ms | Content script only; no I/O |
| Heuristics evaluation | < 2ms | Pure computation |
| Cognitive state estimation | < 1ms | EMA lookup + scoring |
| Drift analysis | < 1ms | History window scan |
| Gate evaluation | < 2ms | Arithmetic + storage read (cached) |
| Gemma inference (WebGPU) | 2–4s | Acceptable; nudge is not time-critical |
| Gemma inference (WASM) | 8–15s | Longer but non-blocking |
| IndexedDB reads | 2–10ms | Async, non-blocking service worker |

The 30-second signal dispatch interval was chosen to balance responsiveness against battery/CPU impact. The content script is otherwise idle between dispatches.

---

## Extension Lifecycle

- **`onInstalled`** → pre-warm offscreen document (start model download)
- **`onStartup`** → pre-warm offscreen document (ensure model loaded after browser restart)
- **`onConnect` (model-keepalive port)** → holds service worker alive during model download
- **`tabs.onRemoved`** → clear per-tab event buffer and session story (title trail + narrative vanish), call `recordSessionEnd()` (tolerance decay)
- **Service worker restart** → `sessionQuickDismissalsByState` resets (fresh session caps); `lastNudgeAt` resets (post-nudge recovery window resets); session stories and pending inference requests reset (the Narrator re-learns the tab from its next signal). Deferred nudges survive: the alarm and its `chrome.storage.session` payload both outlive the worker, which is why deferral uses `chrome.alarms` rather than a timer

The service worker is kept alive during model loading via the open `model-keepalive` port. Chrome 116+ supports this pattern for long-running background tasks.
