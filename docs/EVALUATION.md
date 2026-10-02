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

`npm run eval:models` runs [44 companion scenarios](../eval/cases.ts) through the production `judgeSession` path (system prompt, evidence encoding, retries, schema validation and nudge gate) with real model weights on CPU through onnxruntime-node. Each scenario is labelled from the companion contract: stay quiet, a check-in is appropriate, or either. Sixteen stay-quiet cases are critical, meaning a nudge there is a companion-safety failure. The first run downloads the pinned CPU files into `.eval-cache/`; results go to `eval/results/` and a report to `docs/evaluation/`. To try another model, pin its files in [`eval/candidates.json`](../eval/candidates.json).

The first run (2 October 2026, Apple M4, `q4` weights) is recorded in [Lite vs Full](evaluation/LITE_VS_FULL.md):

- The shipped model returned schema-valid output in all 44 cases, but nudged in 8 of 30 stay-quiet cases. Five were critical: documentation reading for a stated task, stated pricing research, a recipe page's timer, and both pages whose titles contained instructions to intervene. It missed 3 of 10 check-ins.
- Gemma 3 1B, a 75% smaller download, produced valid output in 3 of 44 cases and was not shipped.

These are results from one CPU run. They do not cover the WebGPU `q4f16` weights, Chrome resource use, or real browsing, and the rubric is the maintainers' reading of the contract.

## Stable-release validation

Before a stable release, record browser version, operating system, hardware, model configuration, build commit, and outcomes for:

1. Load/reload, model download progress, offline cache use, failed downloads, and unsupported GPU/WASM behavior.
2. Tab switching, background tabs, same-site SPA navigation, cross-origin navigation, worker suspension, tab closure, and browser restart.
3. Optional intent changes, I chose this, quiet/resume, global nudge toggle, save/open/forget, and controls while inference is pending.
4. Reminder expiry/cancellation and global interruption limits across multiple tabs.
5. Keyboard/focus behavior, readable explanations, hover/focus timeout handling, and page interaction around the overlay.
6. Scenarios involving chosen entertainment, study, ambiguous evidence, checkout language, and cleared detectors. Assess false interruptions and correct abstention, not just nudge frequency.

Interactive Chrome testing and in-browser inference evaluation have not yet been completed for this development version. Any future opt-in study requires its own explicit data handling and measurement design.
