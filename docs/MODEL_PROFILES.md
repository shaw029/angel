# Local AI profiles

Scope: unreleased 0.3.0 development work. Angel offers local model profiles only to give people a resource choice; it does not use a smaller model to make more interventions or to change the companion's non-blocking policy.

## Profiles

| Profile | Model | GPU files | CPU files | Intended use |
| --- | --- | ---: | ---: | --- |
| Lite | Google Gemma 3 1B, q4 | about 0.8 GB | about 0.9 GB | Smaller download for short, structured companion judgments. |
| Full | Gemma 4 E2B, q4 | about 3.1 GB | about 3.6 GB | The existing, larger model for the most nuanced local context judgment. |

Lite's pinned ONNX repository is [`onnx-community/gemma-3-1b-it-ONNX-GQA`](https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX-GQA), converted from Google's Gemma 3 1B instruction model for Transformers.js. It is not a Chinese model. The selected files and the exact revisions are recorded in [`model-manifest.json`](../src/shared/model-manifest.json); the file totals are download estimates, not promises about bandwidth, disk overhead, RAM, response time, or quality.

The Full profile remains the default. Existing enabled installations written before profile selection continue to refer to Full. Choosing a different profile is a new explicit download choice; it closes the running offscreen model before the new profile starts. Angel does not delete an existing model cache when switching. Cached files can remain until browser storage is cleared.

## Evaluation gate

Lite is available in the development build for technical validation. It must not be advertised as equivalent to Full, or as a broadly recommended default, until it passes the following recorded checks:

1. Verify the actual pinned files and fresh-install transfer totals in Chrome. Lite must reduce the initial download by at least 70% on both processors.
2. Run the same evaluation cases through Lite and Full on WebGPU and WASM. Include intentional study/relaxation, ambiguous evidence, shopping pressure, autoplay, scrolling loops, explicit intent, corrections, and abstention cases.
3. Check structured-output validity, nudge-versus-abstain decisions, use of supplied context, and companion language. Any coercive, blocking, invented-evidence, or invalid-schema output fails the gate.
4. Have reviewers score the cases before looking at the model name. Lite's decision and abstention score may be at most 8 percentage points below Full; target is 5 points or less. Do not treat the Full model as ground truth when it conflicts with the case rubric.
5. Record cold-load time, median inference time, Chrome Task Manager memory footprint, and GPU-process impact. Lite must show materially lower resource use on at least one representative WebGPU and one representative WASM machine.

Store the browser version, operating system, hardware, model profile/revision, build commit, case results, and any failures with the release evidence. A successful schema test alone does not establish comparable companion behavior.

## Release decision

If Lite meets every gate, publish it as **Lite — lower storage and memory** and retain Full as **Full — more model capacity for nuanced context**. If it fails any gate, remove it from the released selector and keep the profile code and evaluation record for future work. Do not silently replace a person's Full selection with Lite.
