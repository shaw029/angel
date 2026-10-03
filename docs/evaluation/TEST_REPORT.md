# Test report: 0.3.0 development build

Branch `feat/adaptive-companion-context`, tested 2–3 October 2026, up to the `0.3.0-rc.1` release candidate. This report summarises what was tested, what was found and fixed, and what still needs testing before a release. The detailed records are linked in each section.

## Summary

- **Ready:** on WebGPU, local AI sets up, judges and stays within time limits in real Chrome. Its decisions match the offline evaluation exactly.
- **Fixed during testing:** local AI never started in Chrome; every judgment failed after a browser restart or idle unload; the CPU option could never work; the loaded model held about 9.7 GB of memory at all times; Angel nudged people doing what they said they wanted to do and obeyed instructions in page titles.
- **Rejected:** the Lite profile (Gemma 3 1B) produced usable output in 3 of 44 cases and was removed.
- **Still open:** the manual click-through checklist, other hardware, the ~14 GB memory spike while the model loads, and two known misjudgments.

## Test environment

| | |
| --- | --- |
| Machine | Apple M4, 10 cores, 16 GB unified memory, macOS 27.0 |
| Browser | Chrome for Testing 153.0.8010.12, throwaway profile, unpacked `dist/` |
| Offline runtime | Node 24.15, `@huggingface/transformers` 4.2.0, onnxruntime-node (CPU) |
| Model | `onnx-community/gemma-4-E2B-it-ONNX` @ `9f4bef82`, `q4f16` on WebGPU, `q4` offline |
| Memory | macOS `footprint`, which on Apple silicon includes GPU allocations |

## Results

### Automated tests

`npm run check`: 32 regression tests and 2 release tests pass. New coverage added during this cycle:

- the model engine runs with only `chrome.runtime`, as Chrome's offscreen documents do (fails against the previous code);
- only the model document can ask for the authorized model run;
- `drifting` needs a stated intent, `captured` needs two or more fresh mechanics, and a stated intent needs a `diverges` answer from the separate intent check;
- a CPU setup request is refused, and the popup offers no download without WebGPU;
- startup and the popup leave the model in standby, a judged page moment wakes it from cached files only, and 10 idle minutes unload it;
- a failed load closes the model document.

### Smaller model (Lite)

Gemma 3 1B was compared with the shipped model on 44 scenarios through the production judgment path ([record](LITE_VS_FULL.md)).

| | Lite (Gemma 3 1B) | Full (Gemma 4 E2B) |
| --- | ---: | ---: |
| Download, GPU | 0.78 GB | 3.13 GB |
| Valid outputs | 3 / 44 | 44 / 44 |
| Strict balanced decision score | 5% | 72% |
| Check-ins caught | 0 / 10 | 7 / 10 |

Lite failed its release gate and was reverted (`9a5f638`).

### Judgment quality, offline

65 scenarios through `judgeSession` with real weights ([full report](FULL.md), [method and history](../EVALUATION.md#offline-model-evaluation)).

| Version | Scenarios | Stayed quiet | Checked in | Critical false interruptions |
| --- | ---: | ---: | ---: | ---: |
| Before this cycle | 44 | 22 / 30 | 7 / 10 | 5 |
| After `ca5b5ed` | 65 | 42 / 43 | 17 / 18 | 1 |

Held-out batch 2, written before the final change, scored 10 / 10. Remaining misjudgments, in both CPU and Chrome runs:

- `work-pricing-research`: nudged on a competitor's pricing page when the stated intent was "research competitor pricing for my report".
- `held-one-episode`: stayed quiet on a fourth autoplaying episode when the stated intent was "watch one episode before bed".

### Chrome, WebGPU

| | Result |
| --- | --- |
| First setup | Ready in 85 s, 76 s of it downloading |
| Setup from cached files | Ready in 13–14 s |
| Decisions, 65 scenarios | Same alignment and same nudge-or-quiet outcome as the offline run in every case; 59 / 61 scored correct |
| Judgment time | Median 13.8 s, slowest 20.9 s; none near the 90 s delivery window |

Records: [`chrome-webgpu.json`](../../eval/results/chrome-webgpu.json), [`chrome-webgpu-first-download.json`](../../eval/results/chrome-webgpu-first-download.json).

### Chrome, CPU (WASM)

Setup failed after the 3.6 GB download: the bundled runtime has no CPU implementation of `GatherBlockQuantized`, which the model's 4-bit embedding file uses. Published 0.2.2 uses the same model and CPU fallback. The CPU option is removed in `bc101df`. Record: [`chrome-wasm.json`](../../eval/results/chrome-wasm.json).

### Memory, WebGPU

| State | Extension process | GPU process | All Chrome processes |
| --- | ---: | ---: | ---: |
| Before setup | 0.09 GB | 0.20 GB | 0.58 GB |
| After first download and load | 5.32 GB | 6.18 GB | 11.81 GB |
| After loading from cache | 8.62 GB | 5.03 GB | 13.99 GB |
| At rest after judgments | 3.43 GB | 5.96 GB | 9.71 GB |
| Standby, 5 s after the idle unload | 1.49 GB | 0.28 GB | 2.30 GB |
| Highest single-process peak | 8.64 GB | 7.93 GB | — |

Standby was measured after `bc101df`; the other rows before it. Record: [`chrome-webgpu-idle.json`](../../eval/results/chrome-webgpu-idle.json).

### Chrome, lifecycle

| Check | Result |
| --- | --- |
| Browser without WebGPU (`--disable-gpu`, fresh profile) | Pass. The popup says local AI is not available and offers no download; no model document starts. [Screenshot](../../eval/results/screenshots/popup-no-webgpu.png) |
| Opening the popup with consent and cached files | Pass. The model stays in standby; no model document. [Screenshot](../../eval/results/screenshots/popup-standby.png) |
| A real shop page waking the model | Pass. With urgency, stock and timer text and rapid click bursts, the page woke the model 60–256 s after opening; it was ready 6–12 s later. An untouched page does not wake it: Angel then estimates intentional browsing, whose strategy never asks for a judgment. |
| Judging after a cache-only wake | Failed at first: every judgment came back empty with `Cannot read properties of null (reading 'add_bos_token')`. After the fix, `shop-bill-to-sale` returned drifting with a proposed nudge in 18.4 s, with no errors. |

Records: [`chrome-lifecycle-no-webgpu.json`](../../eval/results/chrome-lifecycle-no-webgpu.json), [`chrome-lifecycle-wake.json`](../../eval/results/chrome-lifecycle-wake.json).

## Defects found and fixed

| Defect | Effect | Fixed in | Verified by |
| --- | --- | --- | --- |
| The model document read consent from `chrome.storage`, which Chrome does not provide to offscreen documents | Local AI never started; setup stayed at "checking" | `6b04a34` | Chrome run; engine tests fail on the old code |
| Transformers.js looked for the tokenizer config without the pinned revision, so cache-only loads built a tokenizer with no config | Every judgment failed after a browser restart or an idle unload | Revision pinned in the model URL template | Chrome wake check; engine test |
| The CPU option used an operator the bundled WASM runtime lacks | CPU setup always failed after a 3.6 GB download | `bc101df` (option removed) | Chrome run; UI and background tests |
| The model stayed loaded for the whole browser session | About 9.7 GB held at rest | `bc101df` (standby) | Chrome: 2.3 GB after the idle unload; unit tests |
| A failed load left the model document open | 6.3 GB held after a failure | `6b04a34` | Unit test |
| Mechanics such as timers and feeds read as drift from a stated intent; page titles could instruct the model | 8 of 30 stay-quiet cases nudged, 5 critical | `ca5b5ed` | Offline evaluation; Chrome parity |
| Lite was offered and advertised before evaluation | 1B model unusable for this task | `9a5f638` | Offline comparison |

Testing note: a reused Chrome profile keeps the previous build's background worker while the extension version is unchanged. `npm run eval:chrome` clears the cached worker scripts before each run; when testing by hand, reload the extension after rebuilding.

## Not yet tested

- The manual [stable-release checklist](../EVALUATION.md#stable-release-validation): consent, cancel, restart, tab switching, quiet mode, reminders, keyboard use.
- Other hardware: Windows and Linux, discrete GPUs, 8 GB machines, and the popup on a device without WebGPU.
- Real browsing over days, and a blinded review of the scenario rubric and narratives.

## Before release

1. Run the manual checklist and record the results.
2. Review the expected answers in [`eval/cases.ts`](../../eval/cases.ts).
3. Decide whether the ~14 GB loading spike is acceptable for this release or needs runtime work first.
4. Ship soon: published 0.2.2 has the broken CPU fallback and keeps the model loaded.
5. Follow [RELEASING.md](../RELEASING.md): version, changelog, package, load the ZIP in Chrome.

## Reproducing

```sh
npm run check                                  # regression and release tests
npm run eval:models                            # offline evaluation, ~45 min; downloads 3.6 GB to .eval-cache/
npm run eval:models -- compare lite            # Lite vs Full report from saved results
npm run eval:chrome -- webgpu --cases=all      # Chrome run; needs Playwright's Chrome for Testing, downloads 3.1 GB
npm run eval:chrome -- webgpu --cases=2 --idle # adds the idle unload and standby memory
npm run eval:chrome -- lifecycle no-webgpu      # popup without WebGPU
npm run eval:chrome -- lifecycle wake           # page wakes the model; judging after a cache-only load
```
