# Architecture

Angel is a layered pipeline running entirely within the Chrome extension sandbox. This document describes each layer, its responsibilities, and the design decisions behind it.

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

- **`BrowsingSignal`** (every 30 seconds) — purely behavioral, page-level metrics: `timeOnPage`, `scrollDepth`, `idleTime`, `switchCount`, `domain`. No detection results, no DOM content.
- **`BehavioralEvent[]`** — individual detection and tracking events accumulated per tab. Each event is typed as either `kind: 'detection'` (carrying a `DetectionResult`) or `kind: 'tracking'` (carrying a `TrackingResult`).

The service worker keeps a per-tab buffer of `BehavioralEvent[]`. When a `BrowsingSignal` arrives and the heuristic flags it, the service worker fuses both streams by calling `compress()` — which combines the heuristic reasons, the `BrowsingSignal` metrics, and the buffered `BehavioralEvent[]` into a single `CompressedContext` for downstream inference.

---

## Layer 2: Heuristics Engine

**File:** `src/heuristics/index.ts`

The heuristics engine evaluates the `BrowsingSignal` and makes the binary decision: flag or ignore. It operates entirely on behavioral metrics — it does not inspect detector results.

Flagging fires when at least one of these behavioral conditions holds:
- `idleTime ≥ IDLE_THRESHOLD_S` (60 s of inactivity on the page) → `extended-idle`
- `switchCount ≥ TAB_SWITCH_THRESHOLD` (8 tab-focus events in the signal window) → `rapid-tab-switching`
- `scrollDepth ≥ 0.60` within `timeOnPage ≤ 300 s` → `excessive-scroll`

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

The `CompressedContext` is what gets passed through the rest of the pipeline. It contains no raw signals — only derived semantic fields. Raw HTML, raw page text, CSS selectors, and full URLs must not enter the compressed context; only categorical/numeric fields (`EventType`, `DomainCategory`, `ScrollDepth`, `TimeBucket`, `TabActivity`) are permitted.

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

## Layer 7: Intervention Gate

**File:** `src/background/gate.ts`

The gate is the final arbiter before an inference request is made. It applies stacked cooldown multipliers and makes the tier selection decision:

```
effective_cooldown = base_cooldown
  × event_type_scale     (checkout = 0.7, engagement = 1.2, subscription = 0.8, …)
  × cognitive_state_scale (compulsive = 0.8, reactive = 0.7, fatigue = 1.5, …)
  × strategy.cooldownScale
  × drift_scale
  × state.suppressionMultiplier   (EMA of quick-dismiss ratio → persistent suppressor)
```

Tier selection:
1. If `confidence < strategy.minConfidence` → `none`
2. If `strategy.preferredTier === 'none'` → `none` (early exit, no cooldown math)
3. If `now - lastAny < subtleCooldown` → `none`
4. If `strategy.preferredTier === 'subtle'` → `subtle`
5. If `confidence >= 0.8` OR `strategy.preferredTier === 'full'` → check full cooldown; if elapsed → `full`, else → `subtle`

The `suppressionMultiplier` is an EMA that increases when the user consistently quick-dismisses (< 3 seconds dwell). It functions as an automatic cooldown extension when the user is not engaging. It decays over time as sessions end (via `recordSessionEnd()`).

---

## Layer 8: Inference (Offscreen Document)

**Files:** `src/offscreen/`, `src/ai/`

When the gate approves a tier, the service worker:
1. Fetches the Memory Summary from IndexedDB
2. Calls `resolveIntensity()` to determine tone
3. Calls `getRecentPhrases()` for the similarity check exclusion list
4. Sends `MSG.AI_CONTEXT` to the offscreen document with the `CompressedContext`

The offscreen document:
1. Ensures the Gemma model is loaded (pre-warmed on install)
2. Calls `generateInterpretation()` — Manipulation Interpreter generates the `observation` and identifies the `mechanic`
3. Calls `infer()` — encodes the state vector, constructs the prompt, runs inference
4. Applies the similarity check: if the output is too similar to recent phrases, retries once with an increased temperature
5. Sends `MSG.INTERVENTION` back to the service worker with the final `Intervention`

The service worker then calls `resolveAction(cognitiveState, mechanic)` (`src/background/action-resolver.ts`) to deterministically assign the `action` label, overriding whatever the model suggested. This keeps action selection consistent and tone-controlled without relying on Gemma's classification accuracy across 10+ options. The action is resolved before routing to the content script via `chrome.tabs.sendMessage`.

---

## Layer 9: Nudge UI

**Files:** `src/content/ui.tsx`, `src/ui/components/Nudge.tsx`

The content script receives the `Intervention` and renders it using the tier-matched component:

- **subtle pill** — small, unobtrusive overlay at the bottom of the viewport, auto-dismisses after 10 seconds
- **full card** — modal-style card with the manipulation observation (in muted text above), the intervention message, and an action button

Dwell time is measured from render to dismiss. The outcome (`accepted` if action button clicked, `dismissed` otherwise), `dwellMs`, and the `tone` of the shown intervention are sent back to the service worker via `MSG.DISMISSED`. Including `tone` in the payload (rather than relying on module-level state) ensures style effectiveness tracking survives service worker restarts.

The service worker uses dwell time to:
- Classify reflective engagement (≥ 8s accepted = genuine reflection)
- Update the tolerance EMA (quick dismissals → suppression multiplier increase)
- Update the intervention outcome for tone effectiveness tracking

---

## Data Flow Summary

```
Page DOM
  → Detectors (local DOM + text-node analysis; only counts/booleans emitted)  ─┐
  → Trackers  (behavioral metrics: velocity, session, interaction rate)         ├→ BehavioralEvent[] (per-tab buffer in SW)
  → BrowsingSignal (every 30s: timeOnPage, scrollDepth, idleTime, switchCount)  ─┘
  → Heuristics Engine (behaviour-based flag/ignore — no detector input)
  → compress() [SW] — fuses BrowsingSignal + BehavioralEvent[] into CompressedContext
      (no raw text, no URLs, no selectors — only categorical/numeric fields)
  → Cognitive State Estimator (7-state, margin-based transitions)
  → Drift Tracker (exponentially-weighted slope → direction + trajectory)
  → Strategy Resolver (intervention policy)
  → Gate (tier selection)
  → [Offscreen] Manipulation Interpreter
  → [Offscreen] Gemma 4 2B
  → Intervention (tier + message + observation + mechanic)
  → Action Resolver — resolveAction(cognitiveState, mechanic)
  → Content Script Nudge UI
  → Outcome (dwellMs + accepted/dismissed)
  → Memory (pattern counters + profile updates)
```

No step in this pipeline writes URLs, page content, or personally identifying information. The only persistent artifacts are integer counters, floating-point EMA values, and the synthesized memory summary that discards all raw data.

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
- **`tabs.onRemoved`** → clear per-tab event buffer, call `recordSessionEnd()` (tolerance decay)
- **Service worker restart** → `sessionQuickDismissalsByState` resets (fresh session caps); `lastNudgeAt` resets (post-nudge recovery window resets)

The service worker is kept alive during model loading via the open `model-keepalive` port. Chrome 116+ supports this pattern for long-running background tasks.
