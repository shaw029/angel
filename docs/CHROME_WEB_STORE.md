# Chrome Web Store submission

Working notes for the Angel listing (item ID `geemggebjlbjnkhgbgloldmnfefoghip`).
Everything below is written to be pasted straight into the developer dashboard.

## Why v0.2.0 was rejected

Violation reference **Purple Potassium**, use of permissions, on two counts:

| Flagged | Reviewer's point | Status in v0.2.1 |
|---|---|---|
| `activeTab` | Requested but never used | Removed — it appeared in no source file |
| `tabs` | Not needed for the methods actually called | Removed — see below |

The `tabs` removal is safe because none of the three call sites required it:

- `chrome.tabs.onRemoved` has never required a permission.
- `chrome.tabs.sendMessage` reaches a content script through host access.
- `chrome.tabs.get(...).url` in `src/background/snooze.ts` is populated for any
  tab covered by our `http://*/*` + `https://*/*` host permissions, which is
  every tab Angel ever runs in. Both readers already treat a missing `url` as
  "the moment is gone", so even the excluded cases degrade safely.

While auditing, `web_accessible_resources` was also dropped from the source
manifest. It exposed the 23 MB ONNX runtime wasm to every website, but the
runtime only ever loads inside the offscreen document — an extension page that
reads its own files without WAR. The build still emits a narrow WAR entry for
the content script's own code chunks, which CRXJS generates automatically.

**Do not appeal.** The reviewer was correct on both counts; resubmitting
v0.2.1 is the faster path.

## Single purpose

> Angel has one purpose: to help a person notice when their browsing has
> stopped matching their intent — a scroll loop, a return to a checkout under
> pressure, a decision being drawn out — and to offer a single quiet prompt to
> pause. All analysis runs locally on the user's own device.

## Permission justifications

Paste each into the matching field. Every permission left in the manifest is
exercised by shipped code.

**`storage`**
> Stores the user's own settings (on/off switch, the presence slider that
> controls how often Angel may speak) and the local counters behind the
> popup's summary, such as how many prompts were shown and how many were
> withheld. `chrome.storage.session` additionally holds the current tab's
> in-memory session state, which is discarded when the browser closes. No
> browsing content is stored and nothing is transmitted anywhere.

**`offscreen`**
> The on-device language model (Gemma, via onnxruntime-web) needs a DOM and
> WebGPU, neither of which exists in a service worker. Angel creates a single
> offscreen document to host the model and run inference locally. This is the
> only supported way to perform WebGPU inference from an MV3 extension.

**`alarms`**
> Backs the "remind me later" control on a prompt. When the user defers a
> prompt, an alarm re-offers it once the deferral elapses, and periodic alarms
> expire stale deferrals. Service workers are terminated aggressively, so
> `setTimeout` cannot survive long enough to do this.

**Host permissions (`http://*/*`, `https://*/*`)**
> Angel's judgements are about behaviour across whatever page the user is
> actually on — "the fourth video in a row", "the third return to this
> checkout", "a countdown timer that has been running for ten minutes". That
> pattern cannot be recognised from a fixed list of sites, and a blocklist
> would defeat the purpose: the extension is meant to notice the moment, not
> the domain. The content script reads the page title and interaction signals
> in the page itself, passes them to the local model, and discards them when
> the tab closes. Page body text is never read. Nothing is sent to any server — Angel has no backend.

## Remote code

Answer: **No, I am not using remote code.** All JavaScript and WebAssembly
executed by Angel ships inside the package.

If asked to elaborate:

> On first run the extension downloads the Gemma model's weights and tokenizer
> (ONNX tensor files and JSON) from the Hugging Face CDN and caches them
> locally. These are data files consumed by the bundled onnxruntime-web — they
> contain no executable JavaScript, WebAssembly, or CSS. The inference engine
> itself is packaged with the extension.

## Data usage disclosures

Angel transmits nothing off the device, so no collection category applies.

- Personally identifiable information — **no**
- Health information — **no**
- Financial and payment information — **no**
- Authentication information — **no**
- Personal communications — **no**
- Location — **no**
- Web history — **no**
- User activity — **no**
- Website content — **no**

Page titles and interaction signals are read *in the browser* and never leave it,
which is not "collection" under the store's definition (transmitting data off
the user's device). Tick all three certifications: data is not sold to third
parties, is not used or transferred for any purpose unrelated to the item's
single purpose, and is not used or transferred to determine creditworthiness or
for lending.

## Privacy policy URL

```
https://shaw029.github.io/angel/privacy.html
```

This is **mandatory**, not optional. The store's policy is that "if your Product
handles any user data, then you must post an accurate and up to date privacy
policy", and the [user data FAQ][faq] defines handling as "collecting,
transmitting, using, or sharing" — then states plainly that "extensions are
required to disclose how they handle user data, even when data is processed or
stored locally on a user's device and is not transmitted to external servers or
third parties". Both "website content and resources" and "web browsing activity"
are listed as user data. Angel reads page titles and browsing signals, so
local-only processing earns no exemption.

The page is generated from the source, not from boilerplate: the signal list
matches `BrowsingSignal`, the model input matches `CompressedContext`, and the
twelve-week retention claim matches `WEEKLY_RETENTION` in `src/memory/index.ts`.
If any of those change, update `landing/src/components/PrivacyPolicy.tsx` in the
same commit — an inaccurate policy is a worse violation than a missing one.

[faq]: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

## Store listing copy

**Short description** (132 char max)

> A quiet on-device companion that notices when your browsing stops matching
> your intent — and offers one gentle pause.

**Detailed description**

> Angel watches how you are browsing, not where.
>
> It runs a small language model entirely on your own machine, and when your
> behaviour drifts from your intent — the fourth video in a row, the third
> return to the same checkout, a decision you have been circling for an hour —
> it offers a single, quiet prompt. Not a block. Not a timer. One sentence that
> names what it noticed, and an easy way to step away.
>
> How it works
> • Angel reads the title of the page you are on and the rhythm of how you are
>   moving through it, locally. It never reads the page's body text.
> • A local model turns that into a plain-language observation.
> • A gating layer decides whether the moment is worth speaking about at all.
>   Most of the time it stays silent, and the popup tells you how often.
>
> What makes it different
> • No blocklists and no site rules — it responds to the moment, not the domain.
> • Two tiers: a one-line whisper, or a fuller card when the pattern warrants it.
> • "Remind me later" defers a prompt to the same moment, not the same minute.
> • A presence slider takes it from quiet to active. One switch turns it off.
>
> Privacy
> • Everything runs on your device through WebGPU. There is no account, no
>   server, and no telemetry.
> • Page content is read to understand the moment and is discarded when the tab
>   closes. Only anonymous counters persist, in your own browser.
> • The model files are downloaded once from a public CDN and cached locally.
>
> Angel needs access to the sites you visit because the patterns it looks for
> can only be seen from the page you are on. That access never leaves your
> browser.

## Screenshots

Regenerate with `node screenshots/capture.mjs` — it builds `screenshots/harness`,
which imports the real `Nudge` component (through the real content-script
`mountNudge`, shadow root included) and the real popup, so the images cannot
drift from the shipped UI. Output is `screenshots/store_*.png`, all 1280×800.

Upload in this order; the first is the gallery tile:

1. `store_1_full_card.png` — It reads the moment, not the site
2. `store_2_subtle_pill.png` — A whisper when a whisper is enough
3. `store_3_remind_me_later.png` — Says what it saw, then waits
4. `store_4_popup.png` — You set how present it is
5. `store_5_on_device.png` — Nothing leaves your device

The sites shown are fictional mock pages on purpose: real sites in store
screenshots are a trademark problem, and the subject is the prompt, not the page.

## Resubmission checklist

1. `npm run build && zip -rq angel-extension.zip dist` (or take the zip from the
   GitHub release).
2. Dashboard → Package → upload the 0.2.1 zip. The version must be higher than
   the rejected upload; the store will not accept the same number.
3. Privacy practices tab → paste the justifications above. The removed
   permissions disappear from this form once the new package is uploaded — make
   sure no stale `tabs` or `activeTab` justification is left behind.
4. Store listing tab → replace the five screenshots.
5. Privacy practices tab → set the privacy policy URL above.
6. Submit for review.
