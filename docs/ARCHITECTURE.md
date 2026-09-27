# Architecture

This document describes the unreleased 0.3.0 source tree. Published builds are listed in the [changelog](../CHANGELOG.md).

## Pipeline

| Stage | Responsibility | Source |
| --- | --- | --- |
| Observe | Foreground duration, title, navigation identity, scroll, idle time, media, entry category | `src/content/observer.ts` |
| Detect | DOM mechanics and local text-pattern results, including cleared states | `src/content/detectors/`, `src/content/trackers/` |
| Collect | Latest evidence per producer, expiration, compressed context | `src/background/evidence.ts`, `src/heuristics/` |
| Estimate | Behavioral state, drift, bounded adaptive strategy | `src/background/cognitive-state.ts`, `drift.ts`, `intervention-strategy.ts` |
| Judge | Request routing, local model prompt, schema validation, cached narrative | `src/background/narrator.ts`, `src/ai/`, `src/offscreen/` |
| Deliver | Fresh context check, optional intent/quiet preference, interruption budget | `src/background/index.ts`, `companion.ts`, `gate.ts`, `snooze.ts` |
| Respond | Dismissible nudge, explanation, correction, save/reminder, popup controls | `src/ui/components/Nudge.tsx`, `src/popup/CompanionPanel.tsx` |

The model proposes a tier; neither a detector nor a behavioral state alone authorizes a nudge. `aligned` and `unknown` judgments veto delivery. User-visible text is selected from trusted evidence copy in `src/shared/evidence-copy.ts`, rather than displaying an unconstrained generated sentence.

## Context and lifecycle

Each document/navigation receives a context key. A single-page navigation resets content-side metrics, detector state, queued events, and visible UI. Hidden pages clear their cards. Evidence is kept as the newest result per detector/tracker, including negative results, and expires after 90 seconds.

A companion episode belongs to one tab and origin. Intent, quiet mode, the last explanation, and a revision survive service-worker suspension through session storage. Changing origin or resuming after 30 minutes without an observed foreground snapshot begins a new episode. User-created return points survive that reset.

The background requests a fresh page snapshot before accepting delayed inference. It checks page identity, title, evidence signature, visibility, episode revision, preference state, and expiry. Delivery and reminder decisions share a serialized queue so competing work cannot independently spend the same interruption budget. Closing a tab clears its temporary companion/reminder records.

The offscreen document owns the model runtime and a shared inference queue. Expired queued requests are skipped. Keepalive messages accompany active initialization/inference; unrelated runtime messages are not answered by the offscreen listener. In-memory narrator and state-estimator history can still reset on worker suspension; session-stored controls do not depend on that history.

## Timing and adaptation

Canonical values live in [`src/shared/constants.ts`](../src/shared/constants.ts), with lifecycle boundaries in [`companion.ts`](../src/background/companion.ts) and [`evidence.ts`](../src/background/evidence.ts). The Guardian enforces a hard 150-second minimum between nudges and at most five in a rolling hour. Adaptive cooldown factors are bounded. A full card can be reduced to a subtle pill.

Requested reminders wait five minutes and may skip adaptive spacing, but retain the hard limits and current-context checks. Deferrals and collision retries are bounded. Changed intent, correction, quiet mode, navigation, or expiry can invalidate a reminder; requesting one is not a promise to interrupt later regardless of context.

## Storage and lifetime

| Location | Contents | Lifetime |
| --- | --- | --- |
| Content/background memory | Current observations, short title trail, narrative, fresh evidence, heuristic history | Reset by navigation/context changes or process lifecycle as applicable |
| `chrome.storage.session` | Companion origin/context and evidence signature, optional intent, quiet state, explanations, reminder records, explicitly saved URL/title | Browser session; tab-specific records removed when the tab closes |
| `chrome.storage.local` | Settings, gate/outcome history, coarse user-correction priors | Until cleared or extension removed |
| IndexedDB | Enumerated aggregate counters, behavioral profile, weekly snapshots | Local persistent history; old weekly snapshots pruned on subsequent writes |
| Browser model cache | Downloaded model/tokenizer files | Until cleared/evicted or replaced |

Saved pages are explicit records, separate from aggregate behavioral history. Model verdicts are not training labels: only corrections update the new prior key, and old model-generated tallies are excluded. Profile changes use one read/write transaction; counter increments are serialized.

## Network boundary

Inference and detector processing are local. Model files are fetched from Hugging Face; requests can recur after cache eviction or version changes. The extension does not send prompts or browsing observations to a service. Opening a saved page is a user-requested browser navigation. Website analytics and embedded video are separate from extension operation.

## Limits

Autoplay attributes do not prove an autoplay chain. Generic urgency patterns do not prove a false deadline. Heuristic states do not establish a person's feelings or intentions. There is no cross-tab content history, unrestricted chat, site blocking, or enforced break. See [validation limits](EVALUATION.md) before interpreting metrics.
