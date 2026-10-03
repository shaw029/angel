// Loads the built extension in Chrome for Testing with a throwaway profile,
// prepares the shipped model on one processor and times real judgments through
// the offscreen document. Model consent is written the way setup writes it
// (popup consent is covered by unit tests); downloads go to the throwaway profile.
//
// Usage: npm run eval:chrome -- <webgpu|wasm> [--cases=all|<count>] [--profile=<dir>] [--idle]
// --idle then marks the model unused, fires the idle alarm and measures standby memory.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MODEL_IDLE_ALARM } from '@shared/constants'
import manifest from '@shared/model-manifest.json'
import { CASES } from './cases'
import { Cdp, chromeBinary, defaultProfile, extensionWorker, evaluateIn, gb, launchChrome, memory, note as noter, sleep, targets, waitFor, type Footprint } from './chrome-lib'

type Device = 'webgpu' | 'wasm'
const device = process.argv[2] as Device
if (device !== 'webgpu' && device !== 'wasm') throw new Error('Usage: eval:chrome -- <webgpu|wasm> [--cases=all|<count>] [--profile=<dir>]')
const flag = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const profile = resolve(flag('profile') ?? defaultProfile('angel-chrome-eval'))
const casesFlag = flag('cases') ?? (device === 'webgpu' ? 'all' : '8')
const JUDGMENT_WINDOW_MS = 90_000  // background discards older judgments (src/background/index.ts)


// ─── Run ─────────────────────────────────────────────────────────────────────

const chrome = await launchChrome(profile)
const log: string[] = []
const note = noter(log)

try {
  const sw = await extensionWorker()
  const evaluate = <T>(body: string) => evaluateIn<T>(sw, body)
  const swErrors: string[] = []
  sw.on(msg => {
    if (msg.method === 'Runtime.exceptionThrown') swErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text)
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type))
      swErrors.push(`${msg.params.type}: ${msg.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ').slice(0, 400)}`)
  })
  await sw.send('Runtime.enable')
  const baseline = memory(chrome.pid!)
  note(`Chrome for Testing started; total footprint ${gb(baseline.total!.now)}`)

  // The same records startModel() writes after the user consents in the popup.
  const runId = await evaluate<string>(`
    const revision = ${JSON.stringify(manifest.revision)}
    if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
    await chrome.storage.local.set({ modelPreference: { choice: 'enabled', device: '${device}', revision } })
    const run = { id: crypto.randomUUID(), revision, device: '${device}', allowDownload: true }
    await chrome.storage.session.set({ modelRun: run, modelStatus: { phase: 'checking' } })
    await chrome.offscreen.createDocument({ url: chrome.runtime.getURL('src/offscreen/index.html'), reasons: ['DOM_SCRAPING'], justification: 'Angel model evaluation' })
    return run.id`)

  // Capture errors from the offscreen document, where the model runs.
  const offTarget = await waitFor('offscreen document', async () => (await targets()).find(t => t.url.includes('/src/offscreen/index.html')))
  const off = new Cdp(offTarget.webSocketDebuggerUrl)
  const errors: string[] = []
  off.on(msg => {
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text)
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type))
      errors.push(`${msg.params.type}: ${msg.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ').slice(0, 400)}`)
  })
  await off.send('Runtime.enable')

  const setupStart = Date.now()
  let phase = ''; let downloadEnd = 0; let status: any
  let setupPeak = baseline
  while (true) {
    status = await evaluate<any>(`return (await chrome.storage.session.get('modelStatus')).modelStatus`)
    if (status?.phase !== phase) {
      if (phase === 'downloading') downloadEnd = Date.now()
      phase = status?.phase
      note(`phase ${phase}${status?.reason ? `: ${status.reason}` : ''}`)
    }
    if (phase === 'ready' || phase === 'error' || Date.now() - setupStart > 45 * 60_000) break
    setupPeak = memory(chrome.pid!)
    await sleep(5_000)
  }
  const afterSetup = memory(chrome.pid!)
  const setupMs = Date.now() - setupStart
  note(`setup ${phase} in ${(setupMs / 1000).toFixed(0)} s (download ${downloadEnd ? ((downloadEnd - setupStart) / 1000).toFixed(0) : 'n/a'} s); footprint now ${gb(afterSetup.total!.now)}, peaks: extension ${gb(afterSetup.extension?.peak ?? 0)}, GPU ${gb(afterSetup.gpu?.peak ?? 0)}`)

  const results: { id: string; expect: string; ms: number; alignment: string | null; nudged: boolean; withinWindow: boolean }[] = []
  if (phase === 'ready') {
    await evaluate(`
      globalThis.__judgments ??= new Map()
      if (!globalThis.__listening) {
        globalThis.__listening = true
        chrome.runtime.onMessage.addListener(m => { if (m.type === 'JUDGMENT') globalThis.__judgments.set(m.payload.requestId, { ...m.payload, at: Date.now() }) })
      }`)
    // Prefer cases that exercise the stated-intent check when running a subset.
    const ordered = [...CASES.filter(c => c.ctx.explicitIntent), ...CASES.filter(c => !c.ctx.explicitIntent)]
    const chosen = casesFlag === 'all' ? CASES : ordered.filter((_, i) => i % 2 === 0).slice(0, Number(casesFlag))
    for (const c of chosen) {
      const r = await evaluate<{ ms: number; alignment: string | null; nudged: boolean }>(`
        const requestId = crypto.randomUUID(); const start = Date.now()
        chrome.runtime.sendMessage({ type: 'AI_CONTEXT', payload: { modelRunId: ${JSON.stringify(runId)}, requestId, tabId: -1, ctx: ${JSON.stringify(c.ctx)}, expiresAt: start + 30 * 60_000 } }).catch(() => {})
        while (!globalThis.__judgments.has(requestId)) await new Promise(r => setTimeout(r, 100))
        const j = globalThis.__judgments.get(requestId)
        return { ms: j.at - start, alignment: j.judgment?.alignment ?? null, nudged: !!j.intervention }`)
      const result = { id: c.id, expect: c.expect, ...r, withinWindow: r.ms < JUDGMENT_WINDOW_MS }
      results.push(result)
      const ok = c.expect === 'either' ? '·' : (r.nudged === (c.expect === 'nudge')) ? '✓' : '✗'
      note(`${ok} ${c.id.padEnd(30)} ${String(r.alignment).padEnd(9)} ${r.nudged ? 'NUDGE' : 'quiet'}  ${(r.ms / 1000).toFixed(1)} s`)
    }
  }
  const afterRun = memory(chrome.pid!)
  let standby: Record<string, Footprint> | null = null
  if (process.argv.includes('--idle') && phase === 'ready') {
    await evaluate(`await chrome.storage.session.set({ modelLastUsed: 0 }); chrome.alarms.create(${JSON.stringify(MODEL_IDLE_ALARM)}, { when: Date.now() + 100 }); return true`)
    note(`alarms before idle: ${JSON.stringify(await evaluate(`return await chrome.alarms.getAll()`))}`)
    try {
      await waitFor('standby', async () => (await evaluate<any>(`return (await chrome.storage.session.get('modelStatus')).modelStatus`))?.phase === 'standby' || undefined, 120_000)
    } catch (err) {
      note(`no standby: status ${JSON.stringify(await evaluate(`return await chrome.storage.session.get(null)`)).slice(0, 600)}; alarms ${JSON.stringify(await evaluate(`return await chrome.alarms.getAll()`))}; worker errors ${JSON.stringify(swErrors.slice(-5))}`)
      throw err
    }
    await sleep(5_000)
    standby = memory(chrome.pid!)
    note(`idle unload: standby, footprint now ${gb(standby.total!.now)} (extension ${gb(standby.extension?.now ?? 0)}, GPU ${gb(standby.gpu?.now ?? 0)})`)
  }
  const times = results.map(r => r.ms).sort((a, b) => a - b)
  const scored = results.filter(r => r.expect !== 'either')
  const summary = {
    device, chrome: execFileSync(chromeBinary(), ['--version']).toString().trim(),
    commit: execFileSync('git', ['describe', '--always', '--dirty', '--exclude=*']).toString().trim(),
    date: new Date().toISOString(), setup: { phase, reason: status?.reason ?? null, ms: setupMs, downloadMs: downloadEnd ? downloadEnd - setupStart : null },
    memory: { baseline, setupPeak, afterSetup, afterRun, standby },
    judgments: {
      count: results.length,
      medianMs: times[Math.floor((times.length - 1) / 2)] ?? null,
      maxMs: times.at(-1) ?? null,
      overWindow: results.filter(r => !r.withinWindow).map(r => r.id),
      correct: `${scored.filter(r => r.nudged === (r.expect === 'nudge')).length} / ${scored.length}`,
      falseInterruptions: scored.filter(r => r.expect === 'quiet' && r.nudged).map(r => r.id),
      missed: scored.filter(r => r.expect === 'nudge' && !r.nudged).map(r => r.id),
    },
    offscreenErrors: errors.slice(0, 40),
    results, log,
  }
  mkdirSync('eval/results', { recursive: true })
  writeFileSync(`eval/results/chrome-${device}${standby ? '-idle' : ''}.json`, JSON.stringify(summary, null, 2) + '\n')
  note(`judgments: ${summary.judgments.correct} correct, median ${((summary.judgments.medianMs ?? 0) / 1000).toFixed(1)} s, max ${((summary.judgments.maxMs ?? 0) / 1000).toFixed(1)} s, over 90 s: ${summary.judgments.overWindow.length}`)
  note(`peak footprint during run: extension ${gb(afterRun.extension?.peak ?? 0)}, GPU ${gb(afterRun.gpu?.peak ?? 0)}, total ${gb(afterRun.total!.peak)}`)
  if (errors.length) note(`offscreen errors (${errors.length}): ${errors.slice(0, 3).join(' | ')}`)
  sw.close(); off.close()
} finally {
  chrome.kill()
}
