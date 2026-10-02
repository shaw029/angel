# Store listing copy — 0.3.0 draft

This copy is prepared for the consent-enabled development version. It has not been submitted to the Chrome Web Store. Publish it alongside the matching release; older published versions may start setup automatically.

## Short description

A private browsing companion that offers gentle perspective. No blocking or enforced breaks. AI runs on your device.

## Setup disclosure

Angel uses on-device AI to consider browsing context before deciding whether to offer a nudge. It can be wrong, and your choice comes first.

AI requires a separate initial model download: approximately 3.1 GB for GPU or 3.6 GB for CPU. Angel shows the size and asks before downloading. Model files are cached for future use; an unmetered connection is recommended. Setup speed and compatibility depend on your device, and additional storage and memory are needed.

Choose Download and enable Angel or Not now. While AI is off, proactive nudges stay paused and your controls and saved return points remain available. You can cancel setup; complete cached files may remain for reuse. A later download may be needed after clearing files or updating the model, and Angel asks first.

Browsing observations and inference stay on your device. Model files download from Hugging Face; no account or cloud inference is required. Angel does not block sites or enforce time limits.

## Maintainer notes

Size source: [`model-manifest.json`](../src/shared/model-manifest.json). Keep this copy aligned with [AI onboarding](AI_ONBOARDING.md), the README, and the website privacy page. These are estimated file sizes, not promises about bandwidth, RAM, accuracy, or wellbeing improvements. The extension ZIP and AI model download are separate.
