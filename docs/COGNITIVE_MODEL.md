# Cognitive Model

Angel's cognitive model has two levels. The **7-state estimator** described in this document is fast, deterministic *witness evidence* — a behavioral prior computed every signal cycle. Above it sits the **intent alignment judgment**: the Narrator (on-device Gemma) weighs the state estimate together with the session's semantic trajectory and decides whether the session still serves the user's own intent. The state model informs judgment; it never triggers a nudge by itself.

---

## Intent Alignment — the Judgment Above the States

The question that decides whether Angel may intervene is not "which cognitive state is the user in?" but **"is the user still the author of this session?"** The same behavioral fingerprint — long session, media playing, low interaction — describes both a chosen lecture and an autoplay rabbit hole. No behavioral state model can tell them apart; the difference lives in the *trajectory*: how the session began, and where it has drifted since.

The Narrator judges every consulted session as one of three alignments:

| Alignment | Meaning | Consequence |
|---|---|---|
| `aligned` | The session plausibly serves an intent the user chose — searched/typed entry, stable topic, deliberate pace. A lecture, a PDF, a paper, a chosen film, focused shopping. | **Hard veto.** Never nudged, regardless of cognitive state or detected mechanics. A confident verdict also suppresses re-judging for 8 minutes. |
| `drifting` | The trajectory is diverging from the entry intent — topic drift across page titles, the original task looks finished but the session continues. | Observed; nudged only with confidence, usually at the subtle tier. |
| `captured` | Environment mechanics are steering — feed-push entry plus urgency mechanics, autoplay chains pulling the topic away, doom-scroll velocity, countdown pressure at a decision point. | The intervention window. Nudges are grounded in the session story ("this started with eigenvalues…"). |

Three rules of evidence govern the judgment:

1. **Content is never the verdict.** No topic, site, or format is inherently bad — trajectories are judged, never taste. This is what makes the model robust to the unenumerable cases (PDFs, lectures, research, chosen leisure) that defeat any content allowlist.
2. **Entry matters.** Search/direct arrival means the user chose this; social or external push means the environment did.
3. **The burden of proof is on `captured`.** Interrupting an aligned user is the worst failure available to the system.

The judgment, its confidence, an inferred intent, and a rolling one-sentence session narrative are produced together; the narrative is cached per tab and fed back on the next consultation, so judgments build on each other across a session. Verdicts are also tallied into per-category alignment priors (see ARCHITECTURE.md) that feed back into future judgments.

---

## Design Principles

**Local pattern detection only.** Cognitive state is estimated from behavioral signals — scroll velocity, session duration, interaction patterns, and locally-matched text patterns (urgency language, billing terms, countdown timers). No page text is stored or transmitted; only boolean/confidence detection results flow into the state estimator. (Page titles are separately held in per-tab memory for the Narrator's prompt — never stored.)

**No self-reporting, but a correction channel.** Users do not select their state or rate their focus. The system infers continuously from observable behavior — and every full-card nudge carries "Not now — I chose to be here", whose one tap outranks every inferred signal. Alongside it, "Remind me later" separates a wrong *judgment* from a wrong *moment*: it accepts the read and defers the nudge five minutes, and it is scored not by the click but by what the user does when the nudge comes back.

**Intentional conservatism.** The model errs toward under-classifying problematic states rather than over-firing. A false negative (missing a loop) is preferable to a false positive (interrupting intentional browsing). Transitions require a candidate state to outscore the current state by a margin of 0.15, preventing flicker when signals are ambiguous. The alignment judgment adds a second, stronger layer of the same principle: aligned-until-proven-captured.

**Media-aware, window-aware inputs.** Watching a video counts as engagement, not idleness; `timeOnPage` counts only visible foreground seconds; tab switches are counted over a rolling 10-minute window. Without these corrections, lectures read as "extended idle" and long-lived tabs saturate every threshold permanently.

---

## The 7 States

### `intentional_browsing`

The baseline healthy state. The user is engaged in goal-directed behavior: purposeful tab switching, bounded scroll depth, moderate session duration without velocity spikes.

This state has `HEALTH_SCORE = 0.00` — the lowest value, meaning healthiest. Angel never intervenes in this state (`preferredTier: 'none'`). Interventions during intentional browsing would be interruptions, not assistance.

**Key signals:** low scroll velocity, shallow scroll depth, varied tab activity, moderate session time.

---

### `exploratory_browsing`

Open-ended, curiosity-driven browsing. Not compulsive, but not tightly goal-directed. The user is discovering rather than seeking. This is normal and healthy behavior.

`HEALTH_SCORE = 0.20`. Interventions are rare (high confidence threshold, subtle tier only, low session cap). The system mostly observes in this state.

**Key signals:** multiple domains, moderate scroll, no doom-scroll velocity, above-average session time without depth indicators.

---

### `passive_consumption`

Drifting, low-engagement scrolling without intent. The user is present but not purposeful — time is passing, content is moving, but there is no goal directing the session. Often a precursor to compulsive loop states when the feed is designed to hold passive attention.

`HEALTH_SCORE = 0.40`. The primary signal is extended session time with low interaction variety and shallow engagement signals. The system holds back (3-minute entry delay, 1.5× cooldown) — passive consumption is not intrinsically harmful, and over-firing here would create friction during normal browsing.

**Key signals:** extended session without scroll velocity spikes, low interaction rate, lack of multi-domain variety, absence of detector signals.

---

### `compulsive_loop`

Repetitive engagement with a single content stream in a way that resists natural disengagement. The user is scrolling continuously without apparent goal, in a context designed to prevent stopping (infinite feed, autoplay chain, comment thread).

`HEALTH_SCORE = 0.85`. This is the primary target state for Angel's interventions. The mechanic is the engagement loop — the content environment is designed to suppress the stop signal.

**Key signals:** high scroll velocity, single-domain dwell, feed height growth, autoplay detection, doom-scroll flag, session duration > 15 min.

The `engagement_loop` intervention strategy applies here. Entry delay is 2 minutes (let the state stabilize before the first nudge). Session cap is 6 — after 6 quick-dismissals in a session, the system backs off for that state.

---

### `emotionally_reactive`

Decision-making under manufactured urgency. The user is in a checkout or decision context where artificial signals (countdown timers, scarcity indicators, social proof live counts) are suppressing deliberate evaluation.

`HEALTH_SCORE = 0.95` — the highest value, meaning most reactive/escalated. The mechanic is decision pressure — the environment is designed to trigger System 1 responses that bypass System 2 deliberation.

**Key signals:** countdown_timer detection (confirmed decreasing), urgency_language (3+ categories), limited_stock indicators, social_proof_live counts, checkout_pressure event classification.

Interventions name the mechanic and restore the user's sense that their timeline is their own — not the goal of suggesting a purchase outcome one way or the other.

---

### `fragmented_attention`

Competing contexts, rapid task-switching, and interrupted workflows. The user is managing too many parallel attention demands simultaneously — notification pressure, tab proliferation, context-switching overhead.

`HEALTH_SCORE = 0.50`. The mechanic is attention fragmentation — design choices (notification badges, tab indicators, competing CTAs) that deliberately partition attention across multiple contexts.

**Key signals:** high tab switch velocity, above-average open tab count, rapid_interaction rate across multiple domains, multi-domain session within short window.

Intervention strategy is conservative (1.3× cooldown scale, high entry delay) — fragmented attention states are common and often transient. Over-firing in this state would add to the fragmentation rather than reduce it.

---

### `decision_fatigue`

Commitment architecture exploitation. The user is navigating a subscription funnel or pricing page designed to wear down resistance to commitment through option complexity, annual vs. monthly anchoring, and trial expiry pressure.

`HEALTH_SCORE = 0.60`. The mechanic is emotional escalation — the funnel applies emotional pressure to make commitment feel like relief rather than a decision requiring deliberation.

**Key signals:** subscription_funnel event classification, trial_language detection, recurring_billing detection, time-on-pricing-page above threshold.

Intervention framing names the mechanic without prescribing the outcome — restoring the user's awareness that deferral is always a valid choice.

---

## State Transition Rules

Transitions use score-margin hysteresis to prevent thrashing. A transition fires when:
1. The top-scoring candidate state differs from the current state, **and**
2. The candidate's score exceeds the current state's score by at least `TRANSITION_MARGIN = 0.15`

There is no minimum consecutive-evaluation requirement and no confidence-threshold override. The margin alone controls stability — if two states score within 0.15 of each other, the current state is held.

When a transition occurs:
- `recordStateTransition()` writes to IndexedDB with: from, to, session_minutes, durationMs, hour
- Evaluation pattern keys are incremented (`compulsive_loop_entries`, `reactive_entries`, `recovery_transitions`)
- The cognitive context's `transition` field is populated for the current evaluation cycle

### Recovery Transitions

A recovery transition is defined as: `(from === 'compulsive_loop' || from === 'emotionally_reactive') && HEALTH_SCORE[to] < HEALTH_SCORE[from]`.

Note the direction: **lower HEALTH_SCORE = healthier state** (0.0 is the healthiest, 0.95 is the most reactive). Recovery means moving to a *lower* HEALTH_SCORE value. Both of these count as recovery from `compulsive_loop` (0.85): moving to `exploratory_browsing` (0.20) and moving to `fragmented_attention` (0.50) — in both cases `HEALTH_SCORE[to] < 0.85`. The only transition from `compulsive_loop` that does NOT count as recovery is moving to `emotionally_reactive` (0.95), since 0.95 > 0.85 (the state has escalated further, not recovered).

If a recovery transition occurs within 15 minutes of a delivered nudge (`POST_NUDGE_RECOVERY_WINDOW_MS`), it is attributed as `post_nudge_recovery` for evaluation purposes. This is a correlation signal, not a causal attribution.

---

## Drift Tracking

The `DriftTracker` (`src/background/drift.ts`) analyzes the cognitive state history ring buffer to compute trajectory.

### Algorithm

`analyzeDrift()` computes an **exponentially-weighted slope** over the 1-hour transition history:

- Each transition's `delta = HEALTH_SCORE[to] - HEALTH_SCORE[from]` is weighted by recency: `weight = exp(-age × ln2 / DECAY_HALF_LIFE)` where `DECAY_HALF_LIFE = 20 min`
- `slope = Σ(delta × weight) / Σ(weight)` — positive slope = escalating, negative = recovering
- `velocity = (HEALTH_SCORE[current] - HEALTH_SCORE[first_in_window]) / windowMinutes`
- `confidence` is a composite of transition count (data quantity) and slope magnitude (signal quality)

### Direction

The `direction` field is one of four values:

| Direction | Condition |
|---|---|
| `escalating` | `slope > 0.05` |
| `recovering` | `slope < -0.05` |
| `fluctuating` | escalating ≥ 2 transitions AND recovering ≥ 2 transitions AND `|slope| < 0.15` |
| `stable` | `|slope| ≤ 0.05` |

### Named Trajectories

On top of direction, `detectTrajectory()` identifies one of six named patterns (checked in priority order, first match wins):

| Trajectory | Condition | Cooldown scale |
|---|---|---|
| `recovery_in_progress` | direction=recovering, ≥2 recovering transitions, current HEALTH_SCORE ≤ 0.4, last recovery < 15 min ago | 2.0× — do not interrupt |
| `urgency_spiral` | any `emotionally_reactive` in history AND direction=escalating | 0.55× — purchase window is time-sensitive |
| `attention_fragmentation` | ≥2 transitions to `fragmented_attention`, or currently fragmented with ≥2 escalating transitions | 1.40× — already distracted, back off |
| `decision_overload` | ≥2 transitions to `decision_fatigue`, or currently fatigued with ≥2 escalating | 0.80× — timely nudge is useful |
| `rapid_escalation` | direction=escalating, HEALTH_SCORE[current] ≥ 0.8, velocity ≥ 0.03/min | 0.50× — urgent, act now |
| `gradual_escalation` | direction=escalating, ≥3 escalating transitions, velocity < 0.03/min | 0.70× — intervene before it deepens |

If no trajectory matches, cooldown falls back to direction-based scaling: `recovering` → 1.6×, `escalating` with depth > 0.6 → 0.8×, otherwise 1.0×.

---

## User Profile

**File:** `src/memory/profile.ts`

The `CognitiveProfile` evolves continuously as the user interacts with interventions. It is stored in IndexedDB and never transmitted.

```typescript
interface CognitiveProfile {
  // Tone effectiveness (EMA over intervention outcomes per style)
  toneEma: Record<InterventionStyle, number>

  // Hourly vulnerability patterns (24-element array, EMA over compulsive/reactive state frequency)
  hourlyVulnerability: number[]

  // Tolerance: EMA of acceptance_rate, decays on quick dismissals
  toleranceLevel: number

  // Recovery: EMA of time from compulsive state onset to recovery
  recoveryDurationMinutes: number | null

  // Escalation: EMA of time from session start to first compulsive state entry
  escalationDepthMinutes: number | null

  // Per-state outcome stats (acceptance rate, quick dismiss rate, show count)
  stateStats: Record<CognitiveState, CogStateStats>

  // Reflective engagement: EMA of dwell time on accepted interventions
  reflectiveDwellEma: number | null
}
```

### Profile-Derived Computations

**`bestStyle(profile)`** — returns the `InterventionStyle` with the highest EMA tone effectiveness. Falls back to `'gentle'` if insufficient data.

**`isVulnerableNow(profile, hour)`** — returns true if the current hour's `hourlyVulnerability` EMA is above the per-user 75th percentile. Used by the memory summary to alert Gemma to vulnerability context.

**`escalatesFast(profile)`** — returns true if `escalationDepthMinutes < 12` (user tends to reach compulsive state quickly within sessions).

**`getStateAcceptanceRate(profile, state)`** — returns the per-state acceptance rate. Applied in the service worker as a responsiveness modifier: states with < 20% acceptance rate trigger 1.5× cooldown scaling (user is persistently unreceptive in this state; continuing to fire is counterproductive).

### EMA Parameters

Most EMA values use α = 0.2 (slow decay, robust to noise). The `toleranceLevel` uses α = 0.15 (even slower — suppression should build gradually and recover gradually). The `hourlyVulnerability` array uses α = 0.25 per-slot per observation (faster — vulnerability patterns can shift week to week).

---

## Weekly Pattern Snapshots

Pattern counters are cumulative (they never reset). At the start of each ISO week, the current counter values are snapshotted to `STORE.WEEKLY_SUMMARIES`.

This design enables:
- **Delta computation**: `this_week_value = snapshot[this_week] - snapshot[last_week]` (no per-event timestamps needed)
- **Trend direction**: comparing the last two weekly deltas produces `improving` / `stable` / `needs_attention`
- **Retention**: only the last 12 weeks of snapshots are retained; older summaries are pruned on the first write of each service worker session

The 12-week retention window was chosen to balance longitudinal trend analysis against indefinite storage growth.

---

## What the Profile Cannot Contain

The following are explicitly excluded by design:

- URLs or domain names
- Page titles or content
- Specific items viewed, searched, or purchased
- Timestamps of individual events
- Any network-observable identifier

The profile contains only: aggregated counts, floating-point EMA values, and derived booleans/enumerals. No combination of profile fields can reconstruct a browsing history.
