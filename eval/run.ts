// Offline candidate-vs-production comparison. Runs the production prompt, retry
// loop, schema validation and nudge gate (judgeSession) against each local model
// through onnxruntime-node on CPU, using the pinned files of the WASM processor option.
import { env, pipeline } from '@huggingface/transformers'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, platform, release, totalmem } from 'node:os'
import { join } from 'node:path'
import { engine, type ChatMessage, type GenerateOptions } from '@ai/engine'
import { judgeSession } from '@ai/index'
import { passesToneGuard } from '@ai/interpretation'
import { parseAndValidate } from '@ai/schema'
import { MODEL_DTYPE_WASM } from '@shared/constants'
import { CASES, type EvalCase } from './cases'
import { downloadBytes, MODELS, PRODUCTION } from './models'

const RESULTS = 'eval/results'
const resultPath = (key: string) => join(RESULTS, `${key}-cpu-${MODEL_DTYPE_WASM}.json`)

interface CaseResult {
  id: string
  group: string
  expect: EvalCase['expect']
  critical: boolean
  nudged: boolean
  alignment: string | null
  decision: string | null
  confidence: number | null
  narrative: string
  attempts: number
  firstAttemptValid: boolean
  valid: boolean
  decisionCorrect: boolean | null
  alignmentAcceptable: boolean
  languageFlags: string[]
  ms: number
  raw: string[]
}

// Shame or directive wording, beyond the shared tone guard. The narrative is
// not shown in the UI today, but it is fed back as the next prompt's story.
const DIRECTIVE = /\b(you should|you must|you need to|stop (watching|scrolling)|waste|wasting|lazy|addict\w*|compulsive)\b/i

function languageFlags(narrative: string, prompt: string): string[] {
  const flags: string[] = []
  if (!passesToneGuard(narrative)) flags.push('tone-guard')
  if (DIRECTIVE.test(narrative)) flags.push('directive-or-clinical')
  const invented = (narrative.match(/\d+(?:[.,:]\d+)?/g) ?? []).filter(n => !prompt.includes(n))
  if (invented.length) flags.push(`unsupported-number:${invented.join(',')}`)
  if (/[$£€]\s?\d/.test(narrative) && !/[$£€]\s?\d/.test(prompt)) flags.push('invented-price')
  return flags
}

async function run(key: string, prefetchOnly: boolean, only?: string) {
  const def = MODELS[key]!
  env.cacheDir = process.env.ANGEL_EVAL_CACHE ?? '.eval-cache/models'
  env.allowRemoteModels = true
  const cachedBefore = existsSync(join(env.cacheDir, def.modelId))

  const loadStart = performance.now()
  const pipe = await pipeline('text-generation', def.modelId, { dtype: MODEL_DTYPE_WASM, revision: def.revision, device: 'cpu' })
  const loadMs = Math.round(performance.now() - loadStart)
  const rssAfterLoad = process.memoryUsage().rss
  console.log(`[${key}] ${cachedBefore ? 'loaded from cache' : 'downloaded and loaded'} in ${(loadMs / 1000).toFixed(1)}s, RSS ${(rssAfterLoad / 1e9).toFixed(2)} GB`)
  if (prefetchOnly) return

  // Hand the Node pipeline to the production engine: generate() output parsing,
  // infer() retries and judgeSession() gating then run unmodified.
  ;(engine as unknown as { pipe: unknown }).pipe = pipe
  let raw: string[] = []
  let prompt = ''
  const generate = engine.generate.bind(engine)
  engine.generate = async (messages: ChatMessage[], options?: GenerateOptions) => {
    prompt ||= messages.find(m => m.role === 'user')?.content ?? ''
    const text = await generate(messages, options)
    raw.push(text ?? '')
    return text
  }

  let peakRss = rssAfterLoad
  const results: CaseResult[] = []
  for (const c of CASES.filter(c => !only || c.id === only)) {
    raw = []; prompt = ''
    const start = performance.now()
    const { judgment, intervention } = await judgeSession(c.ctx)
    const ms = Math.round(performance.now() - start)
    peakRss = Math.max(peakRss, process.memoryUsage().rss)

    let decision: string | null = null
    try { decision = parseAndValidate(raw.at(-1) ?? '').decision_state } catch { /* invalid final output */ }
    let firstAttemptValid = false
    try { parseAndValidate(raw[0] ?? ''); firstAttemptValid = true } catch { /* retried */ }

    const nudged = intervention !== null
    const result: CaseResult = {
      id: c.id, group: c.group, expect: c.expect, critical: !!c.critical, nudged,
      alignment: judgment?.alignment ?? null, decision, confidence: judgment?.confidence ?? null,
      narrative: judgment?.narrative ?? '', attempts: raw.length, firstAttemptValid, valid: judgment !== null,
      decisionCorrect: c.expect === 'either' ? null : nudged === (c.expect === 'nudge'),
      alignmentAcceptable: !!judgment && c.accept.includes(judgment.alignment),
      languageFlags: judgment ? languageFlags(judgment.narrative, prompt) : [],
      ms, raw,
    }
    results.push(result)
    const mark = result.decisionCorrect === null ? '·' : result.decisionCorrect ? '✓' : '✗'
    console.log(`[${key}] ${mark} ${c.id.padEnd(30)} ${String(result.alignment).padEnd(9)} ${String(decision).padEnd(9)} ${nudged ? 'NUDGE' : 'quiet'}  ${(ms / 1000).toFixed(1)}s${result.languageFlags.length ? '  ' + result.languageFlags.join(' ') : ''}`)
  }

  mkdirSync(RESULTS, { recursive: true })
  writeFileSync(resultPath(key), JSON.stringify({
    profile: key, modelId: def.modelId, revision: def.revision, dtype: MODEL_DTYPE_WASM,
    runtime: `onnxruntime-node (CPU) via @huggingface/transformers ${readPackageVersion()}`,
    downloadBytes: { webgpu: downloadBytes(def, 'webgpu'), wasm: downloadBytes(def, 'wasm') },
    machine: { cpu: cpus()[0]?.model, cores: cpus().length, memoryGB: Math.round(totalmem() / 1e9), os: `${platform()} ${release()}`, node: process.version },
    commit: execSync('git rev-parse --short HEAD').toString().trim(),
    date: new Date().toISOString(),
    loadMs, cachedBefore, rssAfterLoad, peakRss,
    results,
  }, null, 2) + '\n')
}

function readPackageVersion(): string {
  return JSON.parse(readFileSync('node_modules/@huggingface/transformers/package.json', 'utf8')).version
}

// ─── Report ───────────────────────────────────────────────────────────────────

type RunFile = ReturnType<typeof load>
function load(key: string) {
  return JSON.parse(readFileSync(resultPath(key), 'utf8')) as {
    profile: string; modelId: string; revision: string; dtype: string; runtime: string; commit: string; date: string
    downloadBytes: Record<'webgpu' | 'wasm', number>
    machine: { cpu: string; cores: number; memoryGB: number; os: string; node: string }
    loadMs: number; cachedBefore: boolean; rssAfterLoad: number; peakRss: number; results: CaseResult[]
  }
}

const pct = (n: number, d: number) => d ? (100 * n) / d : NaN
const fmt = (n: number) => Number.isNaN(n) ? 'n/a' : `${n.toFixed(1)}%`
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN }
const p90 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.ceil(0.9 * s.length) - 1]! : NaN }

function metrics(f: RunFile) {
  const r = f.results
  const quiet = r.filter(x => x.expect === 'quiet')
  const nudge = r.filter(x => x.expect === 'nudge')
  const specificity = pct(quiet.filter(x => !x.nudged).length, quiet.length)
  const recall = pct(nudge.filter(x => x.nudged).length, nudge.length)
  // An invalid output stays quiet by construction; the strict score does not credit it.
  const strictSpecificity = pct(quiet.filter(x => !x.nudged && x.valid).length, quiet.length)
  return {
    cases: r.length,
    valid: pct(r.filter(x => x.valid).length, r.length),
    firstAttemptValid: pct(r.filter(x => x.firstAttemptValid).length, r.length),
    invalid: r.filter(x => !x.valid).map(x => x.id),
    specificity, recall,
    balanced: (specificity + recall) / 2,
    strictBalanced: (strictSpecificity + recall) / 2,
    decision: pct(r.filter(x => x.decisionCorrect).length, quiet.length + nudge.length),
    alignment: pct(r.filter(x => x.alignmentAcceptable).length, r.length),
    criticalFailures: r.filter(x => x.critical && x.nudged).map(x => x.id),
    falseInterruptions: quiet.filter(x => x.nudged).map(x => x.id),
    missed: nudge.filter(x => !x.nudged).map(x => x.id),
    languageFlags: r.filter(x => x.languageFlags.length).map(x => `${x.id} (${x.languageFlags.join(', ')})`),
    medianMs: median(r.map(x => x.ms)),
    p90Ms: p90(r.map(x => x.ms)),
    retries: r.reduce((n, x) => n + Math.max(0, x.attempts - 1), 0),
  }
}

function report(key: string) {
  const name = MODELS[key]!.label
  const cand = load(key)
  const full = load(PRODUCTION)
  const C = metrics(cand)
  const F = metrics(full)
  const reduction = (d: 'webgpu' | 'wasm') => 100 * (1 - cand.downloadBytes[d] / full.downloadBytes[d])
  const gap = F.strictBalanced - C.strictBalanced
  const validCount = cand.results.filter(x => x.valid).length
  // Safety gates pass vacuously when the model rarely produces a usable judgment.
  const vacuous = validCount < C.cases ? ` (only ${validCount} of ${C.cases} outputs were valid)` : ''
  const gates = [
    ['Download reduction ≥ 70% on GPU and CPU', reduction('webgpu') >= 70 && reduction('wasm') >= 70, `${reduction('webgpu').toFixed(0)}% GPU, ${reduction('wasm').toFixed(0)}% CPU`],
    ['No nudges in critical stay-quiet cases', C.criticalFailures.length === 0, (C.criticalFailures.join(', ') || 'none') + vacuous],
    ['All final outputs schema-valid', C.invalid.length === 0, C.invalid.length ? `${C.invalid.length} of ${C.cases} invalid after retries` : 'none'],
    ['No coercive, clinical or invented-detail narrative', C.languageFlags.length === 0, (C.languageFlags.join('; ') || 'none') + vacuous],
    ['Strict balanced decision score within 8 points of Full', gap <= 8, `${gap >= 0 ? '' : '+'}${Math.abs(gap).toFixed(1)} points ${gap >= 0 ? 'below' : 'above'} Full`],
  ] as const
  const passed = gates.every(([, ok]) => ok)
  const gb = (b: number) => `${(b / 1e9).toFixed(2)} GB`
  const row = (label: string, l: string, f: string) => `| ${label} | ${l} | ${f} |`
  const list = (xs: string[]) => xs.length ? xs.join(', ') : 'none'
  const byId = new Map(full.results.map(x => [x.id, x]))
  const cell = (x: CaseResult | undefined) => x ? `${x.alignment ?? 'invalid'} / ${x.decision ?? '—'} / ${x.nudged ? '**nudge**' : 'quiet'}` : '—'

  const md = `# ${name} vs Full: offline evaluation record

Generated by \`npm run eval:models\` on ${cand.date.slice(0, 10)} at commit \`${cand.commit}\`. Re-running overwrites this file.

## What this run measures

Both models received the same ${C.cases} scenarios ([\`eval/cases.ts\`](../../eval/cases.ts)) through Angel's production \`judgeSession\` path: the same system prompt, evidence encoding, retry loop, schema validation and nudge gate. Decoding is greedy, so each model's output is deterministic for this input.

The rubric comes from the companion contract, not from the Full model's answers. \`quiet\` cases fail if a nudge is produced; \`nudge\` cases fail if no nudge is produced; \`either\` cases are reported but not scored. The balanced score is the average of stay-quiet accuracy and check-in recall, so a model that never speaks cannot score well. An invalid output produces no nudge in the extension, so the delivered score counts it as quiet; the strict score, used for the gate, does not credit an invalid output as a correct abstention.

- Runtime: ${cand.runtime}, \`${cand.dtype}\` weights (the files of the CPU/WASM processor option)
- Machine: ${cand.machine.cpu}, ${cand.machine.cores} cores, ${cand.machine.memoryGB} GB RAM, ${cand.machine.os}, Node ${cand.machine.node}
- ${name}: \`${cand.modelId}\` @ \`${cand.revision.slice(0, 8)}\`
- Full: \`${full.modelId}\` @ \`${full.revision.slice(0, 8)}\`

## Gates

A smaller model is only worth offering if it cuts the download substantially without a large quality gap.

| Gate | Result | Detail |
| --- | --- | --- |
${gates.map(([g, ok, d]) => `| ${g} | ${ok ? 'Pass' : '**Fail**'} | ${d} |`).join('\n')}

${passed
  ? `${name} passes the offline gates. Before offering it, still measure Chrome download totals, WebGPU (\`q4f16\`) behaviour, Chrome Task Manager memory and GPU-process impact, and have reviewers score the narratives below without the column headings.`
  : `${name} fails at least one offline gate, so Chrome resource measurements cannot change the decision. It should not be offered.`}

## Results

| Metric | ${name} | Full |
| --- | ---: | ---: |
${[
  row('Initial download, GPU / CPU', `${gb(cand.downloadBytes.webgpu)} / ${gb(cand.downloadBytes.wasm)}`, `${gb(full.downloadBytes.webgpu)} / ${gb(full.downloadBytes.wasm)}`),
  row('Strict balanced decision score (valid outputs only)', fmt(C.strictBalanced), fmt(F.strictBalanced)),
  row('Delivered balanced score (invalid output = quiet)', fmt(C.balanced), fmt(F.balanced)),
  row('Stay-quiet accuracy (no false interruptions)', fmt(C.specificity), fmt(F.specificity)),
  row('Check-in recall', fmt(C.recall), fmt(F.recall)),
  row('Raw decision accuracy (scored cases)', fmt(C.decision), fmt(F.decision)),
  row('Alignment label within rubric', fmt(C.alignment), fmt(F.alignment)),
  row('Schema-valid on first attempt', fmt(C.firstAttemptValid), fmt(F.firstAttemptValid)),
  row('Schema-valid after retries', fmt(C.valid), fmt(F.valid)),
  row('Retries used', String(C.retries), String(F.retries)),
  row('Critical false interruptions', list(C.criticalFailures), list(F.criticalFailures)),
  row('All false interruptions', list(C.falseInterruptions), list(F.falseInterruptions)),
  row('Missed check-ins', list(C.missed), list(F.missed)),
  row('Narrative language flags', list(C.languageFlags), list(F.languageFlags)),
  row('Model load (cached files)', cand.cachedBefore ? `${(cand.loadMs / 1000).toFixed(1)} s` : 'not measured (downloaded)', full.cachedBefore ? `${(full.loadMs / 1000).toFixed(1)} s` : 'not measured (downloaded)'),
  row('Median / p90 judgment time', `${(C.medianMs / 1000).toFixed(1)} s / ${(C.p90Ms / 1000).toFixed(1)} s`, `${(F.medianMs / 1000).toFixed(1)} s / ${(F.p90Ms / 1000).toFixed(1)} s`),
  row('Process memory after load / peak (RSS)', `${gb(cand.rssAfterLoad)} / ${gb(cand.peakRss)}`, `${gb(full.rssAfterLoad)} / ${gb(full.peakRss)}`),
].join('\n')}

Node CPU timings and RSS show the relative cost of the two models on one machine. They are not Chrome WASM or WebGPU measurements. Peak RSS includes runtime buffers such as prompt logits, which scale with vocabulary size; Gemma models use a 262,144-token vocabulary, so peak memory need not fall in proportion to the download.

## Per-case outcomes

Each cell is alignment / decision / delivered outcome.

| Case | Expected | ${name} | Full |
| --- | --- | --- | --- |
${cand.results.map(x => `| ${x.id}${x.critical ? ' (critical)' : ''} | ${x.expect} | ${cell(x)}${x.decisionCorrect === false ? ' ✗' : ''} | ${cell(byId.get(x.id))}${byId.get(x.id)?.decisionCorrect === false ? ' ✗' : ''} |`).join('\n')}

## Narratives for review

Narratives are stored in memory and fed back as the next prompt's story; the interface shows fixed, evidence-grounded copy instead. Reviewers should score these without looking at the column headings.

| Case | ${name} | Full |
| --- | --- | --- |
${cand.results.map(x => `| ${x.id} | ${x.narrative.replace(/\|/g, '\\|') || '—'} | ${(byId.get(x.id)?.narrative ?? '').replace(/\|/g, '\\|') || '—'} |`).join('\n')}
`
  const out = `docs/evaluation/${key.toUpperCase()}_VS_FULL.md`
  mkdirSync('docs/evaluation', { recursive: true })
  writeFileSync(out, md)
  console.log(`\nStrict balanced: ${name} ${fmt(C.strictBalanced)} vs Full ${fmt(F.strictBalanced)} (gap ${gap.toFixed(1)} points)`)
  for (const [g, ok, d] of gates) console.log(`${ok ? 'PASS' : 'FAIL'}  ${g}: ${d}`)
  console.log(`Wrote ${out}`)
}

const [mode, key, ...flags] = process.argv.slice(2)
const candidates = Object.keys(MODELS).filter(k => k !== PRODUCTION)
if (mode === 'report' && key && candidates.includes(key)) report(key)
else if (mode === 'run' && key && key in MODELS) {
  const only = flags.find(f => f.startsWith('--only='))?.slice(7)
  await run(key, flags.includes('--prefetch'), only)
} else {
  console.error(`Usage: run <${Object.keys(MODELS).join('|')}> [--prefetch] [--only=<case-id>] | report <${candidates.join('|')}>`)
  process.exitCode = 1
}
