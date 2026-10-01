# Local AI onboarding

Scope: 0.3.0-dev.1 (unreleased). Angel remains AI-led. This change adds consent, profile selection, and setup UX, not a detector-only nudge mode or a new model provider.

## User experience

The popup explains why AI considers session context and offers an illustrative example. It lets the person select Lite or Full before choosing a processor, discloses that selection's download size, and recommends an unmetered connection. The example is explicitly labelled; it is not a model result or a claim of demonstrated effectiveness.

- **Download and enable Lite/Full** approves one model profile, pinned revision, and processor. Setup runs in the offscreen document and continues when the popup closes while Chrome stays open.
- **Not now** remembers the choice. The full invitation collapses to **Review AI setup**. Controls and saved return points remain available; proactive nudges remain paused.
- **Cancel setup** revokes the active run and closes the offscreen document, terminating its fetches and inference work. Complete cached files may remain; partial-file resume is not promised.
- **Retry AI setup** is explicit. Failures do not silently retry with networking enabled or change the chosen processor.
- **Angel is ready** means initialization completed. A ready user can choose the other profile, explicitly download it, and switch. The global nudge switch and episode quiet preferences still apply. Users can turn off local AI separately.

Consent is not inferred from legacy cache metadata or old installations. Existing consent without a profile is treated as consent to the existing Full profile, preserving prior choices. Automatic restores use Transformers.js `local_files_only` with remote access disabled. Missing/evicted files require another setup click. A changed pinned model revision or a different profile requires an explicit setup choice. Revoked or superseded run IDs cannot update progress or authorize inference.

## Sizes and progress

[`model-manifest.json`](../src/shared/model-manifest.json) records the files and pinned revisions for both profiles. Lite uses [Google Gemma 3 1B in a Transformers.js ONNX conversion](https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX-GQA): its q4f16 GPU files total about 0.8 decimal GB and q4 CPU files about 0.9 decimal GB. Full's text-generation path loads the decoder and text embeddings, not the vision/audio encoders: its q4f16 GPU files total about 3.1 decimal GB and q4 CPU files about 3.6 decimal GB, including tokenizer and configuration files.

These are file-metadata estimates, not benchmarked download traffic, disk overhead, memory requirements, or quality claims. The extension/runtime package is separate. Changing the profile or processor may require a different set of weights. Older caches addressed under an unpinned revision may not be reusable.

The progress ledger retains completed files and uses the full pinned file total. It counts available model bytes, including complete files read from cache, rather than implying those bytes were all transferred during this attempt. Model preparation is a separate stage. Readiness is reported only after the runtime is initialized.

For model updates, change the pinned revision, verify every file/size for both processors, update public disclosures, and validate fresh/cached flows. Do not silently float back to `main`. See [profile evaluation gates](MODEL_PROFILES.md#evaluation-gate) before describing Lite as comparable to Full.

## Verification

Automated tests cover absent/deferred consent, direct runtime invocation, install/startup, signals, explicit enable/cancel, stale progress, cached-only restore, failed cache restore, revision changes, size accounting, and rendered UI states. Pipeline tests mock model construction; they do not download gigabytes or prove real hardware compatibility.

Preview: `npx vite --config screenshots/harness/vite.config.ts --host 127.0.0.1`, then open `/?setup&companion`. This uses the real popup and simulated progress; it never downloads a model.

No connected browser was available for interactive QA during implementation. Before stable release, test a fresh install, upgrade with legacy cache, close/reopen popup, cancellation during each file, browser restart, worker suspension, cleared cache, disk/network failure, both processors, and keyboard/screen-reader navigation in real Chrome. Confirm through the network panel that no model request occurs before consent or after cancellation. A full model download and runtime initialization were not performed as part of these checks.
