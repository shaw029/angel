# Evaluation and validation limits

Scope: unreleased 0.3.0. Angel records local behavioral proxies, not psychological diagnoses or demonstrated wellbeing outcomes. No controlled user study is claimed here. The offline model evaluation below scores scenarios against a rubric; it does not measure outcomes for people.

## What the metrics mean

| Metric | Implementation and limits |
| --- | --- |
| Interventions shown | Incremented after delivery; per-state display counters are recorded separately from feedback. |
| Acceptance rate | Explicit Helpful outcomes divided by displays. Missing feedback is not proof of dissatisfaction. |
| Engagement after longer dwell | Accepted interventions displayed for at least eight seconds. Time on screen does not prove reflection or attention. |
| Post-nudge recovery proxy | Qualifying transition after a nudge in the loop state, within 15 minutes. Attribution is per-tab and consumed once; temporal association is not causation. |
| Recovery duration | Moving average of time in the loop estimate before leaving it. Any exit contributes; a different label is not necessarily a healthier state. |
| Escalation depth | Moving average of active-session minutes at entries into the loop estimate. Depends on heuristic classification. |
| Weekly trends | Differences between stored cumulative snapshots. Missing weeks, the first retained snapshot, and partial weeks can distort comparisons. |
| Tolerance | Internal adaptation parameter based on interaction outcomes, not a measured personal trait. |

Rate fields with minimum sample thresholds can remain unavailable. The awareness-building flag is disabled because counter thresholds cannot establish improved awareness. Existing histories are retained; earlier releases used different accounting, so historical and new measurements may not be directly comparable. Worker suspension resets some in-memory attribution/history, which limits completeness.

Sources: [`evaluation.ts`](../src/memory/evaluation.ts), [`profile.ts`](../src/memory/profile.ts), and [background orchestration](../src/background/index.ts). UI wording should describe these observations without implying causal effectiveness.

## Automated coverage

Run `npm run check` for version consistency, TypeScript, and regression/static-rendering tests. Tests exercise evidence expiration and clearing, intent/quiet scope, saved pages, stale or unknown judgments, navigation and preference changes, concurrent delivery limits, reminders, state duration, both nudge tiers' explanation/correction controls, model download consent, cancellation, cached-only restores, and progress accounting.

`npm run build` validates extension bundling; `npm --prefix landing run build` validates the website. The screenshot harness uses fixture data. Passing these checks does not demonstrate model accuracy or Chrome lifecycle reliability.

## Offline model evaluation

`npm run eval:models` runs [65 companion scenarios](../eval/cases.ts) through the production `judgeSession` path (system prompt, evidence encoding, retries, schema validation, nudge rules and the stated-intent check) with real model weights on CPU through onnxruntime-node, then writes the [Full report](evaluation/FULL.md). Each scenario is labelled from the companion contract: stay quiet, a check-in is appropriate, or either. Twenty-eight stay-quiet cases are critical, meaning a nudge there is a companion-safety failure. Held-out batches are written before the change they measure. The first run downloads the pinned CPU files into `.eval-cache/`; per-case results go to `eval/results/`. To compare a smaller model, pin its files in [`eval/candidates.json`](../eval/candidates.json) and run `npm run eval:models -- <model>`, then `npm run eval:models -- compare <model>`.

### Results so far

One greedy CPU run per row, 2 October 2026, Apple M4, `q4` weights.

| Change | Scenarios | Stayed quiet | Checked in | Critical false interruptions | Results file |
| --- | ---: | ---: | ---: | ---: | --- |
| Shipped model before these changes | 44 | 22 / 30 | 7 / 10 | 5 | `full-cpu-q4.original.json` |
| Evidence rules in code: `drifting` needs a stated intent, `captured` needs two or more fresh mechanics | 55 | 33 / 37 | 9 / 14 | 4 | the original run with the rules applied, plus `full-cpu-q4.before-prompt.json` for batch 1 |
| Prompt judges alignment by whether the page serves the stated intent, not by its mechanics | 55 | 32 / 37 | 13 / 14 | 5 | `full-cpu-q4.before-intent-check.json` |
| Separate stated-intent check before any nudge | 65 | 42 / 43 | 17 / 18 | 1 | `full-cpu-q4.json` |

The evidence rules stopped nudges without a stated intent, including both title-injection cases in the original set. The prompt change recovered missed check-ins but read timers and feeds as divergence from a stated intent, interrupting a stated linear-algebra lecture. The stated-intent check asks the model one question without the page mechanics: does the current page serve the stated intent? Only a `diverges` answer lets a nudge through. Held-out batch 2, written before that check, scored 6 / 6 stay-quiet and 4 / 4 check-ins.

Remaining failures: the check judged a competitor's pricing page as diverging from "research competitor pricing for my report", and the main judgment accepted a fourth autoplaying episode as aligned with "watch one episode before bed".

Gemma 3 1B, a 75% smaller download, produced valid output in 3 of 44 cases with the original prompt and was not shipped; see [Lite vs Full](evaluation/LITE_VS_FULL.md).

### Limits

- The stated-intent check is an extra model call, made only when a nudge is about to be proposed for a session with a stated intent. On CPU it added about 10 seconds per such case. The background discards judgments older than 90 seconds, so on a slow WASM device the extra call can turn a check-in into silence. Measure this in Chrome.
- These runs do not cover the WebGPU `q4f16` weights, Chrome resource use, or real browsing.
- The rubric is the maintainers' reading of the contract. The prompt and the check were designed after reviewing the original 44 cases and held-out batch 1, so only batch 2 is an unseen test, and it has 10 cases.

## Stable-release validation

Before a stable release, record browser version, operating system, hardware, model configuration, build commit, and outcomes for:

1. Load/reload, model download progress, offline cache use, failed downloads, and unsupported GPU/WASM behavior.
2. Tab switching, background tabs, same-site SPA navigation, cross-origin navigation, worker suspension, tab closure, and browser restart.
3. Optional intent changes, I chose this, quiet/resume, global nudge toggle, save/open/forget, and controls while inference is pending.
4. Reminder expiry/cancellation and global interruption limits across multiple tabs.
5. Keyboard/focus behavior, readable explanations, hover/focus timeout handling, and page interaction around the overlay.
6. Scenarios involving chosen entertainment, study, ambiguous evidence, checkout language, and cleared detectors. Assess false interruptions and correct abstention, not just nudge frequency.

Interactive Chrome testing and in-browser inference evaluation have not yet been completed for this development version. Any future opt-in study requires its own explicit data handling and measurement design.
