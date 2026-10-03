# Local AI onboarding

Scope: 0.3.0-dev.1 (unreleased). Angel remains AI-led. This change adds consent and setup UX, not a detector-only nudge mode or a new model provider.

## User experience

The popup explains why AI considers session context and offers an illustrative example. It discloses the download size and recommends an unmetered connection. Local AI needs WebGPU; without a WebGPU adapter the popup explains that local AI is not available and offers no download. The example is explicitly labelled; it is not a model result or a claim of demonstrated effectiveness.

- **Download and enable Angel** approves one model revision on WebGPU. Setup runs in the offscreen document and continues when the popup closes while Chrome stays open.
- **Not now** remembers the choice. The full invitation collapses to **Review AI setup**. Controls and saved return points remain available; proactive nudges remain paused.
- **Cancel setup** revokes the active run and closes the offscreen document, terminating its fetches and inference work. Complete cached files may remain; partial-file resume is not promised.
- **Retry AI setup** is explicit. Failures do not silently retry with networking enabled. A failed load closes the model document to release its memory.
- **Angel is ready** means initialization completed, or the model is resting in standby. Install, browser startup and opening the popup leave a consented model in standby; a page moment that will be judged loads it from cached files, and 10 minutes without a judgment unloads it again. The global nudge switch and episode quiet preferences still apply. Users can turn off local AI separately.

Consent is not inferred from legacy cache metadata or old installations. Loads from standby use Transformers.js `local_files_only` with remote access disabled. Missing/evicted files require another setup click. A changed pinned model revision resets enabled consent to pending. Revoked or superseded run IDs cannot update progress or authorize inference.

## Sizes and progress

[`model-manifest.json`](../src/shared/model-manifest.json) records file sizes from the [Hugging Face model repository](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/tree/9f4bef82ea6e296bc69f8a2f5939f73af81b07a6), retrieved 28 September 2026. The text-generation path loads the decoder and text embeddings, not the vision/audio encoders. Its q4f16 GPU files total about 3.1 decimal GB, including tokenizer and configuration files. The manifest also lists the q4 CPU files (about 3.6 GB); the extension does not offer them, because the bundled WASM runtime has no CPU implementation of the `GatherBlockQuantized` operator they use. The offline evaluation uses them through onnxruntime-node.

These are file-metadata estimates, not benchmarked download traffic, disk overhead, or memory requirements. The extension/runtime package is separate. Older caches addressed under an unpinned revision may not be reusable.

The progress ledger retains completed files and uses the full pinned file total. It counts available model bytes, including complete files read from cache, rather than implying those bytes were all transferred during this attempt. Model preparation is a separate stage. Readiness is reported only after the runtime is initialized.

For model updates, change the pinned revision, verify every file/size, update public disclosures, and validate fresh/cached flows. Do not silently float back to `main`.

## Verification

Automated tests cover absent/deferred consent, direct runtime invocation, install/startup, signals, explicit enable/cancel, stale progress, cached-only restore, failed cache restore, revision changes, size accounting, and rendered UI states. Pipeline tests mock model construction; they do not download gigabytes or prove real hardware compatibility.

Preview: `npx vite --config screenshots/harness/vite.config.ts --host 127.0.0.1`, then open `/?setup&companion`. This uses the real popup and simulated progress; it never downloads a model.

No connected browser was available for interactive QA during implementation. Before stable release, test a fresh install, upgrade with legacy cache, close/reopen popup, cancellation during each file, browser restart, worker suspension, cleared cache, disk/network failure, both processors, and keyboard/screen-reader navigation in real Chrome. Confirm through the network panel that no model request occurs before consent or after cancellation. A full model download and runtime initialization were not performed as part of these checks.
