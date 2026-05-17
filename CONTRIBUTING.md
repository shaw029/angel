# Contributing to Angel

Angel is a research-oriented project. Contributions are welcome across the detection layer, cognitive modeling, intervention design, and evaluation framework. This document explains how the codebase is organized, where the most valuable contribution surface is, and the conventions you need to follow.

---

## Before You Start

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. Understanding the full pipeline before touching any layer will save you significant time. The key insight is that **each layer has a single responsibility and communicates through typed contracts** — changes in one layer rarely require changes in another if the interface types are respected.

---

## Setup

```bash
git clone <repo>
cd angel
npm install
npm run setup      # copies ORT WASM binary from node_modules
npm run build      # initial build into dist/
```

Load into Chrome: `chrome://extensions` → Developer mode → Load unpacked → `dist/`

```bash
npm run dev        # watch mode — rebuilds on every save
npm run start      # watch + demo server at localhost:3001
npm run typecheck  # TypeScript strict check (no build)
```

After any source edit, click the reload icon on the Angel card at `chrome://extensions`.

**VS Code:** open `angel.code-workspace` and use the **Launch Chrome (Extension)** debug configuration (`F5`). It builds, opens a clean Chrome profile with the extension loaded, and attaches the debugger. The **Full Test: Extension + Demo** configuration also starts the demo server and opens `http://localhost:3001`.

---

## High-Value Contribution Areas

### 1. Manipulation Detection — New Detectors

**Location:** `src/content/detectors/`

Each detector is a self-contained module that exports a `detect(document: Document): DetectionResult[]` function. Adding a new detector requires:

1. Create `src/content/detectors/<mechanic>.ts`
2. Export `detect()` returning `DetectionResult[]` with appropriate `SignalType` and confidence
3. Register it in `src/content/detectors/index.ts`
4. Add the new `SignalType` to `src/shared/types.ts` if needed
5. Update `src/ai/pipeline/signals.ts` to map the new signal to a `SignalLabel`
6. Test it against the relevant demo page or a new demo scenario

**Detectors must be:**
- Stateless (no DOM references retained between runs)
- Conservative (two-sample confirmation for anything time-varying)
- Content-blind (no page text or URLs stored — only boolean/count outputs)

**Good candidates:** cookie consent dark patterns, fake review indicators, misleading comparison tables, pre-checked upsell options.

---

### 2. Manipulation Mechanic Templates

**Location:** `src/ai/interpretation.ts`

The `MECHANIC_TEMPLATES` record maps each `ManipulationMechanic` to a pool of 5 framing observations. Adding a new mechanic:

1. Add the mechanic name to the `ManipulationMechanic` type in `src/shared/types.ts`
2. Add a `templates` entry in `MECHANIC_TEMPLATES` with 5 distinct non-judgmental observations
3. Add a mapping from the relevant `SignalType` to the new mechanic in `classifyMechanic()`

**Template writing guidelines:**
- Describe what the environment is doing, not what the user should do
- Avoid moralizing ("you shouldn't be here") or prescriptive framing ("close this tab")
- Prefer mechanic-naming framing: "This timer is designed to..." rather than "You're feeling rushed because..."
- Each of the 5 templates in a pool should approach the same mechanic from a different angle — not just synonyms

---

### 2b. Companion Action Labels

**Location:** `src/background/action-resolver.ts`, `src/ui/components/Nudge.tsx`, `src/shared/types.ts`

The action label displayed on a nudge is resolved deterministically in the service worker — Gemma does not choose it. `resolveAction(state, mechanic)` maps the current `CognitiveState` × `ManipulationMechanic` pair to a `SuggestedAction`. Adding or changing a label requires updating three places in concert:

1. Add the new key to the `SuggestedAction` union in `src/shared/types.ts`
2. Add the corresponding display string to `ACTION_LABELS` in `src/ui/components/Nudge.tsx`
3. Map the appropriate `(state, mechanic)` combinations to the new key in `resolveAction()` in `src/background/action-resolver.ts`
4. Update `SUGGESTED_ACTIONS` in `src/ai/schema.ts` and the action list in `src/ai/system-prompt.ts` so Gemma's output schema stays in sync (even though Gemma's choice is overridden, the schema validation must pass)

**Label writing guidelines:**
- Companion-toned, soft, and kind — never directive or alarming
- 2–4 words, sentence case, no punctuation
- Name what the user can do with their attention, not what the page is doing wrong
- Good: "Let this rest", "Come back later", "One thing at a time"
- Bad: "Stop scrolling", "Close this tab", "You need a break"

---

### 3. Cognitive State Model

**Location:** `src/background/cognitive-state.ts`

The 7-state model uses weighted signal scoring. To refine the model:

- `SIGNAL_WEIGHTS` maps `SignalType → Record<CognitiveState, number>` — adjusting weights changes which signals push toward which states
- `STATE_THRESHOLDS` controls the minimum score required for each state to be estimated
- `EMA_ALPHA` controls smoothing (lower = smoother, more resistant to noise but slower to react)

Adding a new state requires updating:
1. `CognitiveState` type in `src/shared/types.ts`
2. `HEALTH_SCORE` in `src/background/drift.ts`
3. `STATE_STRATEGY` baseline in `src/background/intervention-strategy.ts`
4. The system prompt in `src/ai/system-prompt.ts` with example pairs for the new state

---

### 4. Intervention Strategy

**Locations:** `src/background/intervention-strategy.ts`, `src/background/presence.ts`

The `STATE_STRATEGY` table defines baseline intervention behavior per cognitive state. `resolveStrategy()` applies 6 dynamic overrides and then a presence bias layer. Contributions here:

- Calibrating the `minConfidence`, `cooldownScale`, `stateEntryDelayMs`, and `sessionDismissalCap` values per state based on observed behavior
- Adding new override conditions for specific edge cases (e.g., detecting when a user has been in a loop across multiple sessions, not just within one)
- Adjusting presence zone boundaries or the scaling functions in `derivePresence()` — the three knobs it exposes are `cooldownScale`, `confidenceDelta`, `entryDelayScale`, and `sessionCapDelta`

Changes here directly affect user experience. Test against demo pages and aim for the minimum intervention frequency that still produces recovery transitions.

---

### 5. Evaluation Metrics

**Location:** `src/memory/evaluation.ts`, `src/popup/App.tsx`

The evaluation framework is intentionally minimal — 5 core metrics, no gamification. Contributions welcome for:

- Improving the trend direction algorithm (currently a simple 2-period comparison; a more robust regression would reduce noise)
- Adding new metrics that measure resilience without creating pressure or gamification incentives
- Refining the `awarenessBuilding` composite

See [docs/EVALUATION.md](docs/EVALUATION.md) for the measurement philosophy before proposing new metrics. The guiding constraint: the metric should not create a goal that users optimize toward.

---

## Code Conventions

### TypeScript

The project uses strict TypeScript. All public APIs are typed with no `any`. Message contracts use discriminated unions — if you add a new message type, add it to `src/shared/messages.ts` and handle it in `src/background/index.ts`.

```typescript
// Path aliases — use these, not relative imports across module boundaries
import type { CognitiveState } from '@shared/types'
import { incrementPattern }    from '@memory/index'
import { resolveStrategy }     from '@background/intervention-strategy'
```

### No Comments for What, Only Why

Comments explain non-obvious constraints, invariants, or workarounds. They do not explain what the code does (the names should do that) or reference the current task.

```typescript
// Good: explains a subtle invariant
// Avoid unstable ratios when baseline is near zero
if (prior < 1 && recent < 1) return 'insufficient_data'

// Bad: explains what the code does
// Check if prior is less than 1 and recent is less than 1
```

### Privacy Invariants

Any code that touches the memory layer must respect these invariants. Violations are bugs, not design tradeoffs:

- **No URLs** in any stored value — not hashed, not truncated, not encoded
- **No page content** — no text, no titles, no structured data from the page
- **No timestamps on events** — counters and EMA values only; weekly snapshot keys are ISO week strings, not dates
- **No per-event records** — only aggregated counts and floating-point profile values

If a contribution requires storing something outside these constraints, the architecture should be redesigned to avoid it.

### Detector Contract

```typescript
// Every detector must follow this contract:
export function detect(doc: Document): DetectionResult[] {
  // - Pure function of doc (no closures over external state)
  // - Returns [] when nothing detected (never null/undefined)
  // - Confidence is 0–1, never > 1
  // - No side effects, no storage writes
}
```

---

## Testing Contributions

There is no automated test suite yet (this is a pre-1.0 research project). Test contributions against the demo scenarios:

```bash
npm run start
# Open http://localhost:3001
```

For detector changes, verify against the relevant scenario that:
1. The `DetectionResult` appears in the background service worker's event buffer (check with `chrome.storage.session` in DevTools)
2. The flagging decision fires correctly (watch the background console in `chrome://extensions`)
3. No false positives on unrelated pages

For strategy/gate changes, verify that:
1. Interventions do not fire during `intentional_browsing` state
2. Interventions do not fire excessively (> 1 per 5 minutes in a single state)
3. The `recovering` trajectory correctly suppresses interventions when the user is already improving

---

## Submitting Changes

1. Fork the repository and create a branch from `main`
2. Run `npm run typecheck` before submitting — PRs with type errors will not be merged
3. Keep PRs focused: one change per PR (new detector, template expansion, metric refinement)
4. In the PR description, describe what the change is and why — not what the code does

For significant changes to the cognitive model, intervention strategy, or evaluation framework, open an issue first to discuss the approach before writing code. These layers have subtle interdependencies that are easier to reason about before implementation.
