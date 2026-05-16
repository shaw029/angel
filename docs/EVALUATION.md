# Evaluation Framework

Angel measures the quality of behavioral change, not the quantity of screen time avoided. This document describes the metrics, their measurement philosophy, and what success and failure look like.

---

## The Measurement Problem

Most digital wellbeing tools optimize for easily measurable proxies: screen time, app opens, notification count. These metrics are legible and convenient, but they are poor proxies for what actually matters — whether users develop greater capacity to navigate manipulative environments with intention.

A user who has Angel installed and spends the same amount of time online, but exits compulsive loops faster and makes more deliberate purchasing decisions, is succeeding. A user who reduces screen time because they are anxious about the intervention system, or because they wait out a hard limit, is not building resilience — they are building a different dependency.

Angel's evaluation framework is built around this distinction.

---

## Core Metrics

### Post-Nudge Recovery Rate

**Definition:** fraction of interventions delivered in `compulsive_loop` state that were followed by a recovery transition within 15 minutes.

**Measurement:**
```
lastNudgeAt: timestamp of most recent delivered intervention
POST_NUDGE_RECOVERY_WINDOW_MS: 15 * 60 * 1000

When a recovery transition fires:
  if (lastNudgeAt !== null && Date.now() - lastNudgeAt < POST_NUDGE_RECOVERY_WINDOW_MS):
    increment post_nudge_recoveries
```

**Denominator:** `stateStats.compulsive_loop.shown` (interventions shown in compulsive_loop state specifically)

**Why this matters:** This is the closest proxy to "did the nudge actually interrupt a loop." It is not causal — the recovery might have happened anyway — but it measures temporal co-occurrence with a meaningful signal window.

**Minimum data requirement:** 5 compulsive_loop nudges before this metric is displayed. Below this threshold, the value is `null` (displayed as "insufficient data").

**What success looks like:** 40–60% recovery-after-nudge rate indicates strong responsiveness. Below 20% suggests the user is in states where nudges are not landing; the system should respond with increased cooldowns (and does, via per-state acceptance rate logic).

---

### Reflective Engagement Rate

**Definition:** fraction of accepted interventions where dwell time was ≥ 8 seconds.

**Measurement:**
```
REFLECTIVE_DWELL_MS: 8_000

In MSG.DISMISSED handler:
  if (outcome === 'accepted' && dwellMs >= REFLECTIVE_DWELL_MS):
    increment reflective_engagements
    recordReflectiveEngagement(dwellMs)
```

**Denominator:** `interventions_accepted` (total accepted interventions)

**Why 8 seconds:** 8 seconds is approximately the reading time for a 3-sentence nudge at average pace. Dwell below this threshold means the user clicked the action button without reading. Dwell above this threshold indicates the user paused, read, and reflected — the intended interaction.

**What this measures:** It distinguishes two failure modes:
1. User dismisses nudge immediately → captured by `interventions_quick_dismissed`
2. User clicks accept without reading → captured by low reflective engagement rate

A 40%+ reflective engagement rate means nearly half of accepted nudges are being genuinely processed.

**Minimum data requirement:** 5 accepted interventions before metric is displayed.

---

### Recovery Acceleration

**Definition:** EMA of time from compulsive state onset to natural recovery, measured in minutes.

**Measurement:** Stored in `CognitiveProfile.recoveryDurationMinutes` as an EMA (α = 0.2) updated on each `compulsive_loop → healthier_state` transition. The duration is computed from `durationMs` at the point of recovery transition.

**Why this matters:** A decreasing `recoveryDurationMinutes` over weeks means the user is exiting compulsive loops faster — either they are catching themselves earlier (escalation awareness) or the loops are becoming shorter (reduced susceptibility). Both are positive outcomes.

**Interpretation:**
- Decreasing over 4+ weeks: user is developing self-regulation capacity
- Stable: neither improving nor worsening
- Increasing: user is spending longer in compulsive states (may indicate growing susceptibility)

This metric is not directly displayed in the popup but feeds into the `awarenessBuilding` composite.

---

### Escalation Depth

**Definition:** EMA of time from session start to first compulsive state entry, measured in minutes.

**Measurement:** Stored in `CognitiveProfile.escalationDepthMinutes`. Updated when a `compulsive_loop` state is entered, using `session_context.minutes_active` from the `CompressedContext`.

**Why this matters:** Escalation depth measures how far into a session the user gets before slipping into a compulsive state. Increasing depth means the user is sustaining intentional or exploratory browsing for longer before the loop begins — they are more resistant at the start of sessions.

This is the strongest resilience signal in the framework. If a user consistently takes 25 minutes to enter a compulsive state where they previously took 8 minutes, the tool is working.

---

### Awareness Building (Composite)

**Definition:** boolean composite — `escalationDepthMinutes > 10 minutes` AND `weeklyTrends.length >= 2` AND escalation depth is trending upward.

**Measurement:** Derived in `getEvaluationMetrics()`:
```typescript
const awarenessBuilding = (
  profile.escalationDepthMinutes !== null &&
  profile.escalationDepthMinutes > 10 &&
  weeklyTrends.length >= 2
)
```

**Why a composite:** Individual metrics can be noisy. The awareness building flag combines a threshold (> 10 minutes is meaningful escalation depth — better than average) with longitudinal depth (at least 2 weeks of weekly snapshots). It is a conservative signal that only fires when there is genuine multi-week evidence of improved resilience.

---

## Weekly Trend Directions

Each metric produces a weekly trend direction computed from the last two weekly delta values:

```typescript
function computeTrendDirection(weeks, getValue): TrendDirection {
  if (weeks.length < 2) return 'insufficient_data'

  const recent = getValue(weeks[weeks.length - 1])
  const prior  = getValue(weeks[weeks.length - 2])

  if (prior < 1 && recent < 1) return 'insufficient_data'
  if (prior === 0) return recent > 0 ? 'improving' : 'insufficient_data'

  const change = (recent - prior) / prior
  if (change >= 0.20)  return 'improving'
  if (change <= -0.20) return 'needs_attention'
  return 'stable'
}
```

The 20% threshold prevents noise from being misread as meaningful change. A metric can move by 15% from week to week due to natural variation in browsing behavior; only sustained directional movement above this threshold is reported.

**Trend directions in the popup:**
- `↑` — improving (green)
- `→` — stable (muted)
- `↓` — needs_attention (amber)
- (no indicator) — insufficient_data

---

## What Is Explicitly Not Measured

### Total Screen Time

Screen time is a proxy that conflates useful and manipulative engagement. A 2-hour deep-work session on a code editor and a 2-hour compulsive doom-scroll session both score "2 hours" — one is productive, one is exploitation. Angel ignores screen time entirely.

### "Productive" vs. "Unproductive" Time

This distinction requires Angel to make judgments about what the user's time should be used for — a paternalistic position that violates the autonomy-preservation principle. Angel does not know (and does not try to know) whether a user is correctly spending time on Twitter or incorrectly spending time on a work document.

### Acceptance Rate as a Performance Goal

The popup displays acceptance rate as context, not as a target. A high acceptance rate with no recovery transitions or reflective engagement means the user is clicking the action button reflexively — performing engagement without experiencing it. This is a form of failure.

A user with a 20% acceptance rate but strong post-nudge recovery rate and increasing escalation depth is succeeding. Angel's response to low acceptance rate is to extend cooldowns and reduce frequency — not to increase pressure.

### Intervention Count

The number of nudges shown is shown in the popup as context. It is not framed as a measure of protection received or work done by the system. More interventions is not better.

---

## Popup Display Philosophy

The `InsightPanel` in the popup shows at most 3 rows of data, chosen from available metrics in priority order. It appears only when there are ≥ 5 interventions on record (below this, users see "Still learning your patterns.").

The framing is observational: "Loop exits after nudge: 68% ↑" — not "Great job!" or "Needs improvement." The numbers are descriptive artifacts that the user can interpret for themselves, not gamification scores.

There are no streaks, no achievement badges, no session goals, no weekly summaries. These features create anxiety and gamification pressure that are forms of the same manipulation Angel is trying to counter.

---

## Longitudinal Measurement Architecture

### Weekly Snapshot Design

Pattern counters are cumulative. The weekly snapshot at the start of each ISO week records the current cumulative values. Delta computation (`this_week = snapshot_now - snapshot_last_week`) produces the weekly count without requiring per-event timestamps.

This design means:
- No event-level data is ever stored
- Trend computation works across arbitrary time gaps (missed weeks are correctly counted as zero-delta)
- Storage is bounded: 15 PatternKeys × 12 weeks × ~50 bytes = ~9 KB total for the snapshot store

### Evaluation Metrics Derivation

`getEvaluationMetrics()` (in `src/memory/evaluation.ts`) reads:
1. The current `CognitiveProfile` from IndexedDB
2. The current pattern counts from `STORE.PATTERNS`
3. The last 8 weekly snapshots from `STORE.WEEKLY_SUMMARIES`

It computes all metrics locally, with no external calls. The popup calls this directly (same extension origin) without a background round-trip.

---

## Research Alignment

These metrics are designed to align with established frameworks for measuring self-regulation and behavioral change:

**Habit loop interruption** (Duhigg, 2012): The post-nudge recovery rate measures whether interventions successfully interrupt the cue-routine-reward loop. Escalation depth measures how well users recognize and avoid the cue.

**Metacognitive awareness** (Flavell, 1979): Reflective engagement rate is a proxy for metacognitive processing — the user pausing to think about their own thinking. 8-second dwell is a conservative minimum for this cognitive event to occur.

**Self-determination theory** (Deci & Ryan, 2000): The framework explicitly avoids metrics that would create external pressure (targets, streaks, comparative scores). All metrics are descriptive of the user's own behavior, not comparative to an external standard.

**Temporal discounting and present bias** (Laibson, 1997): Recovery acceleration and escalation depth together measure the user's capacity to resist manipulation that exploits present-bias — the tendency to favor immediate engagement over deferred deliberation.
