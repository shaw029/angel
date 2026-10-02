# Companion context and controls

Scope: unreleased 0.3.0, initially implemented on `feat/adaptive-companion-context`. See the [changelog](../CHANGELOG.md) for release status. Gemma and its quantization configuration are unchanged; the model revision is now pinned for consent and size disclosure. The 0.3.0-dev.1 [AI onboarding](AI_ONBOARDING.md) adds explicit download consent, cancellation, and cached-only automatic restores. Smaller-model benchmarking is deferred.

## User-facing behavior

- Open **Ask Angel** in the popup for optional intent, changed/cleared intent, the last nudge's explanation, quiet/resume controls, and a saved return point. This is a controls panel, not open-ended chat, and works without model readiness or proactive nudges enabled.
- Both nudge tiers offer **Why this?** and **I chose this**. Expanding a pill reveals the full controls. **Helpful** records explicit feedback; **Save this page for later** actually stores a return point; a requested reminder returns after five minutes when the context and hard interruption limits still allow it.
- Intent and quiet preferences apply to a tab on its current origin, survive worker suspension, and reset on an origin change or after 30 minutes without an observed foreground snapshot. A user's corrected choice suppresses that episode's proactive nudges.
- Saved URL/title pairs are explicit user-created records. One per tab is retained across navigation in browser session storage until forgotten, the tab closes, or the browser session ends. Opening a saved page requires a user click and opens a new tab.
- Navigation, hidden documents, disabling Angel, or changed user preferences prevent obsolete delivery. Existing cards are cleared when the page is hidden or navigates, or controls request quiet/disable.
- No blocking, forced pauses, or automatic navigation was added.

## Evidence and model contract

Detector results now include negative/clear states and refresh periodically. The background retains the newest state per detector/tracker for at most 90 seconds. Document/navigation identities keep old-page events out of new-page inference. Visible time, rather than tracker wall-clock milestones, supplies session duration.

Cheap cognitive-state updates continue on quiet snapshots so recovery can be observed without requesting a nudge. The prompt includes current signal labels, an evidence-grounded mechanic hypothesis, optional user-stated intent, title history, and behavioral estimates. Page strings are quoted as data. Social/referrer provenance is explicitly weak evidence; autoplay attributes do not establish an autoplay chain.

`unknown` and `aligned` judgments veto intervention. A `drifting` judgment needs a stated intent and a `captured` judgment needs at least two fresh mechanic signals before a nudge can be proposed. With a stated intent, a separate stated-intent check must also answer `diverges`. The model decides whether and at what tier to propose a nudge; the visible sentence and explanation come from observed evidence. Generated claims about goals, feelings, prices, or autoplay transitions cannot become visible nudge copy. A stable reason is offered at most once in an episode unless the user changes their stated intent.

Inference runs through a shared queue, and queued work past its deadline is skipped. Results are rechecked against current page identity, title, evidence signature, preferences, freshness, and Guardian limits. Normal delivery and reminders share a serialized background queue. Requested reminders retain the hard spacing floor and hourly budget, and expire instead of following the user into a different context.

## Feedback and measurement

Only explicit corrections update the new user-alignment prior key; legacy model-generated tallies are not imported. Ignoring a deferred reminder no longer receives a doubled refusal weight. Explicit feedback is separated from mere display; per-state display counts are recorded on delivery.

State transitions now pass the previous state's actual duration. Recovery attribution is per-tab and consumed once for a qualifying transition. Profile updates use a single read/write transaction, and pattern increments are serialized. The unsubstantiated awareness-building flag is disabled. These are behavioral proxies, not demonstrated psychological outcomes or causal evidence of benefit. Existing aggregate history is retained and can still contain legacy measurements.

## Verification

- `npm run check`: version consistency, TypeScript, 26 companion/onboarding/runtime tests, and two release-metadata tests.
- `npm run typecheck`
- `npm test`: regression/static-rendering tests covering evidence expiry and clearing; optional intent and quiet scope; saved return points; disabled, navigated, corrected, stale, and unknown responses; concurrent delivery budgets; reminder limits; actual recovery duration; grounded copy; and correction/explanation controls on both tiers.
- `npm run package`: extension build, root manifest and runtime packaging, ZIP, and SHA-256 checksum.
- `npm run build`
- `npx vite build --config screenshots/harness/vite.config.ts`
- `npm --prefix landing run build`

The Browser tool reported no connected browsers. There has been no interactive visual QA, real Chrome extension lifecycle test, or real-model accuracy/performance measurement in this session. Static rendering and mocks do not replace those checks.

For a manual UI preview, run `npx vite --config screenshots/harness/vite.config.ts` and open `/?companion` on the displayed local server. This renders the real popup with fixture-backed controls. Standard harness scenes still render the real nudges. For full extension testing, run the repository's setup/build instructions and reload `dist` in Chrome.

## Remaining boundaries

The first version uses generic DOM detectors, not site-specific purchase parsing or verified autoplay-transition tracking. It does not infer a precise shopping goal or promise that a deadline is artificial. It keeps per-tab context, not a cross-tab browsing history. New model comparisons, unrestricted chat, longitudinal adaptive-policy experiments, and claims of improved resilience remain future work.
