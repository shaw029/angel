# Angel

> A private, on-device AI companion for intentional browsing.

Kairos watches how you browse — scroll depth, time on page, tab switching, engagement patterns — and surfaces a single calm nudge at the right moment. Everything runs locally in your browser using [Gemma 4 2B](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX) via WebGPU or WASM. No data leaves your device.

---

## How it works

1. A content script collects behavioral signals (scroll, clicks, tab switches) every 30 seconds.
2. The background service worker runs heuristics to detect patterns: doom-scrolling, checkout pressure, subscription funnels, distracted browsing.
3. When a pattern is flagged and the gate allows it, the compressed context is sent to an offscreen document running Gemma 4 2B.
4. The model generates a short, non-judgmental reflection prompt and sends it back as a subtle overlay on the page.

All inference runs in the offscreen document — isolated, never touching the page DOM until a nudge is ready.

---

## Setup

**Requirements:** Node 18+, Chrome 116+

```bash
npm install
npm run setup      # copies the ORT WASM binary from node_modules (~23 MB)
npm run build      # bundles the extension into dist/
```

Then load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/` folder
4. The Kairos icon appears in your toolbar

The model downloads in the background on first install (~3.9 GB for GPU, ~2 GB for WASM fallback). Progress is visible in the popup.

### Development

```bash
npm run dev        # watch mode — rebuilds dist/ on every save
npm run start      # watch mode + demo pages server at localhost:3001
npm run typecheck  # type-check without building
```

After any source change, go to `chrome://extensions` and click the reload icon on the Kairos card.

---

## Architecture

```
src/
  background/     service worker — signal routing, gate, state
  content/        page script — behavioral signal collection
  offscreen/      isolated document — Gemma inference
  ai/             engine, prompts, pipeline helpers
  heuristics/     pattern detection (evaluate)
  memory/         IndexedDB pattern counters + summary
  storage/        chrome.storage.local state
  popup/          React UI — status, toggle
  shared/         types, constants, message contracts
  ui/             shared React components

public/
  ort-wasm-simd-threaded.asyncify.mjs   ORT runtime (committed, 47 KB)
  ort-wasm-simd-threaded.asyncify.wasm  ORT binary  (gitignored, 23 MB — run npm run setup)
```

**Model:** `onnx-community/gemma-4-E2B-it-ONNX` — Gemma 4 2B, q4f16 on WebGPU, q4 on WASM.  
**Intervention tiers:** `subtle` (inline overlay) · `nudge` (toast) · `companion` (full card).  
**Gate:** per-tier cooldowns, suppression multiplier based on quick-dismiss ratio, event-type-specific logic.

---

## Privacy

- No network requests except the one-time model download from Hugging Face.
- No URLs, page content, or personal data is stored or transmitted.
- All behavioral data lives in `chrome.storage.local` as aggregated counters only.
- The model runs entirely in an offscreen document with no access to page content.

---

## License

MIT
