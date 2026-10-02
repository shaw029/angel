# Behavioral estimates and adaptation

Scope: unreleased 0.3.0. Angel is a companion; its estimates support optional offers and must remain correctable by the person using it.

## State estimates

`src/background/cognitive-state.ts` scores seven internal labels from weighted boolean conditions over observations and compressed signals:

| Internal label | Evidence used, not a diagnosis |
| --- | --- |
| `intentional_browsing` | Focus, activity, relatively limited scrolling, absence of loop signals |
| `exploratory_browsing` | Short visits and moderate switching |
| `passive_consumption` | Longer sessions and low interaction |
| `compulsive_loop` | Repeated scrolling, rapid interaction, engagement-hook signals |
| `emotionally_reactive` | Purchase-pressure patterns and rapid interaction |
| `fragmented_attention` | Frequent switching and short visits |
| `decision_fatigue` | Longer purchase/billing sessions and inactivity |

Scores are clamped to 0–1. A candidate must exceed the current state's score by 0.15 to trigger a transition. This is hysteresis, not an exponential moving average or calibrated probability. The reported confidence is a heuristic score. State names describe implementation categories, not verified mental states.

The estimator retains up to 15 transitions in memory. On transition it reports the duration of the previous state separately from time in the new state. Cheap updates continue even when a snapshot does not justify model inference.

## Intent and uncertainty

The model receives optional user-stated intent, current signal labels, an observed mechanic hypothesis, page titles, entry category, media activity, duration, and behavioral estimates. Page strings are quoted as data. Arrival provenance is weak evidence; a missing referrer does not prove a typed URL or a chosen purpose.

Judgments can be `aligned`, `drifting`, `captured`, or `unknown`. Both `aligned` and `unknown` suppress intervention. `drifting` means divergence from a stated intent, so it cannot lead to a nudge without one; `captured` needs at least two fresh mechanic signals. With a stated intent, a separate check must also find that the current page diverges from it. The model's remaining proposal still needs fresh evidence, eligible preferences, a strategy that permits delivery, and Guardian limits. Visible copy comes from observed evidence, with an inspectable explanation.

**I chose this** quiets the current episode and updates a coarse category prior. Model judgments do not update those priors. Stated intent takes precedence over aggregate history. Ask Angel allows changing or clearing intent without requiring model readiness.

## Adaptation

The intervention strategy uses behavioral state, drift, time in state, and local profile summaries to suggest timing and tone. The Guardian bounds adaptive spacing and retains absolute interruption limits. Recovering estimates, dismissal patterns, and quiet preferences can lead Angel to back off. Low acceptance does not trigger a separate per-state cooldown multiplier.

Persistent profile fields use moving averages for selected aggregate observations; this is distinct from state estimation. Explicit Helpful/rejected feedback informs style outcomes. Save and reminder actions should not be interpreted as proof that advice was helpful. Ignoring a reminder receives no doubled refusal penalty.

These policies are hand-designed and have regression coverage. They are not a validated learned personalization policy. Improving contextual accuracy, calibration, and abstention comes before making the system more assertive. See [evaluation](EVALUATION.md) and [future work](COMPANION_ROADMAP.md).
