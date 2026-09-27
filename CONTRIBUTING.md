# Contributing to Angel

Angel should act as a companion: describe evidence, offer a choice, accept correction, and back off. Changes that block pages, force breaks, or equate entertainment with harm do not fit the product.

## Development

Use Node.js 22+ and npm. From the repository root:

```sh
npm ci
npm run build
npm run check
```

Load `dist/` as an unpacked extension in Chrome developer mode. `npm run dev` watches extension sources; reload the extension after changes. `npm run demo` serves local examples. Website dependencies are separate: `npm --prefix landing ci`, then `npm --prefix landing run dev`.

Use a focused feature/fix branch and a pull request describing the problem, resulting behavior, validation, and material limits. Never include personal browsing data, saved URLs, model caches, local store-submission notes, or generated release artifacts in commits.

## Where to work

- Observations and detectors: `src/content/`
- Heuristics/context compression: `src/heuristics/`
- Orchestration, episodes, delivery limits: `src/background/`
- Prompt/schema/runtime: `src/ai/`, `src/offscreen/`
- Local aggregates: `src/memory/`
- Popup and nudge UI: `src/popup/`, `src/ui/`
- Constants and message contracts: `src/shared/`

Consult [architecture](docs/ARCHITECTURE.md) before changing lifecycle or storage. Supported import aliases are defined in `vite.config.ts` and `tsconfig.json`; do not invent a background alias. Behavioral scores are implemented in `cognitive-state.ts`; persistent profile moving averages are a separate mechanism.

## Review expectations

Keep model uncertainty and explicit corrections meaningful. Negative detector results must clear earlier evidence. Delayed work must validate the current context before delivery. Both nudge tiers need accessible explanation and correction controls. Side effects require an explicit user action with an accurate label.

Tests should cover behavioral failure cases, especially races and stale context. Run `npm run check` and `npm run build`; also build the website or screenshot harness when those change. State which interactive Chrome and real-model checks you performed; mocks are not equivalent.

Match documentation to actual data handling. Aggregates exclude URLs, but temporary session context and explicitly saved pages contain page-level information. Update privacy copy when that boundary changes. Avoid unsupported effectiveness, latency, model-size, or mental-state claims.

## Releases

See [RELEASING.md](docs/RELEASING.md) for version changes, artifacts, tags, and draft publication. Add changes to the Unreleased changelog section. A feature-branch push is not a stable release or a store submission.
