// Loads the built extension in Chrome for Testing with a throwaway profile,
// prepares the shipped model on one processor and times real judgments through
// the offscreen document. Model consent is written the way setup writes it
// (popup consent is covered by unit tests); downloads go to the throwaway profile.
//
// Usage: npm run eval:chrome -- <webgpu|wasm> [--cases=all|<count>] [--profile=<dir>]
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import manifest from '@shared/model-manifest.json'
import { CASES } from './cases'

type Device = 'webgpu' | 'wasm'
const device = process.argv[2] as Device
if (device !== 'webgpu' && device !== 'wasm') throw new Error('Usage: eval:chrome -- <webgpu|wasm> [--cases=all|<count>] [--profile=<dir>]')
const flag = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const profile = resolve(flag('profile') ?? join(tmpdir(), 'angel-chrome-eval'))
const casesFlag = flag('cases') ?? (device === 'webgpu' ? 'all' : '8')
const port = 9333
const JUDGMENT_WINDOW_MS = 90_000  // background discards older judgments (src/background/index.ts)

function chromeBinary(): string {
  if (process.env.CHROME_FOR_TESTING) return process.env.CHROME_FOR_TESTING
  const root = join(homedir(), 'Library/Caches/ms-playwright')
  const found = execFileSync('find', [root, '-maxdepth', '6', '-path', '*MacOS/Google Chrome for Testing', '-type', 'f']).toString().trim().split('\n').sort().at(-1)
  if (!found) throw new Error('Chrome for Testing not found; set CHROME_FOR_TESTING')
  return found
}

// ─── Minimal CDP client ───────────────────────────────────────────────────────

class Cdp {
  private id = 0
  private pending = new Map<number, (msg: { result?: unknown; error?: unknown }) => void>()
  private listeners: ((msg: { method: string; params: unknown }) => void)[] = []
  private ready: Promise<void>
  constructor(url: string) {
    const ws = new WebSocket(url)
    this.ws = ws
    this.ready = new Promise((ok, fail) => { ws.onopen = () => ok(); ws.onerror = () => fail(new Error(`CDP connect failed: ${url}`)) })
    ws.onmessage = ev => {
      const msg = JSON.parse(String(ev.data))
      if (msg.id) this.pending.get(msg.id)?.(msg)
      else for (const l of this.listeners) l(msg)
    }
  }
  private ws: WebSocket
  async send<T = Record<string, unknown>>(method: string, params: object = {}): Promise<T> {
    await this.ready
    const id = ++this.id
    return new Promise((ok, fail) => {
      this.pending.set(id, msg => msg.error ? fail(new Error(JSON.stringify(msg.error))) : ok(msg.result as T))
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  on(listener: (msg: { method: string; params: any }) => void) { this.listeners.push(listener) }
  close() { this.ws.close() }
}

async function targets(): Promise<{ type: string; url: string; webSocketDebuggerUrl: string }[]> {
  return (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
async function waitFor<T>(what: string, fn: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) { try { const v = await fn(); if (v) return v } catch { /* not yet */ } await sleep(500) }
  throw new Error(`Timed out waiting for ${what}`)
}

// ─── Process memory (macOS footprint, includes GPU allocations on Apple silicon) ─

interface Footprint { now: number; peak: number }
function processTree(root: number): { pid: number; kind: string }[] {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,command=']).toString().trim().split('\n')
    .map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)!).filter(Boolean)
    .map(([, pid, ppid, cmd]) => ({ pid: Number(pid), ppid: Number(ppid), cmd: cmd! }))
  const out: { pid: number; kind: string }[] = []
  const walk = (pid: number) => {
    for (const r of rows.filter(r => r.ppid === pid)) {
      const kind = r.cmd.includes('--type=gpu-process') ? 'gpu'
        : r.cmd.includes('--extension-process') ? 'extension'
        : r.cmd.includes('--type=renderer') ? 'renderer' : 'other'
      out.push({ pid: r.pid, kind }); walk(r.pid)
    }
  }
  out.push({ pid: root, kind: 'browser' }); walk(root)
  return out
}
function memory(root: number): Record<string, Footprint> {
  const procs = processTree(root)
  const file = join(tmpdir(), `angel-fp-${process.pid}.json`)
  try { execFileSync('footprint', ['-j', file, ...procs.map(p => String(p.pid))], { stdio: 'ignore' }) } catch { /* partial output is fine */ }
  const data = JSON.parse(readFileSync(file, 'utf8')) as { processes: { pid: number; footprint: number; auxiliary?: { phys_footprint_peak?: number } }[] }
  const byKind: Record<string, Footprint> = {}
  for (const p of data.processes) {
    const kind = procs.find(x => x.pid === p.pid)?.kind ?? 'other'
    const k = (byKind[kind] ??= { now: 0, peak: 0 })
    k.now += p.footprint; k.peak += p.auxiliary?.phys_footprint_peak ?? p.footprint
  }
  byKind.total = Object.values(byKind).reduce((t, k) => ({ now: t.now + k.now, peak: t.peak + k.peak }), { now: 0, peak: 0 })
  return byKind
}
const gb = (b: number) => `${(b / 1e9).toFixed(2)} GB`

// ─── Run ─────────────────────────────────────────────────────────────────────

mkdirSync(profile, { recursive: true })
const dist = resolve('dist')
const chrome = spawn(chromeBinary(), [
  `--user-data-dir=${profile}`, `--load-extension=${dist}`, `--disable-extensions-except=${dist}`,
  `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' })
const log: string[] = []
const note = (s: string) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`; log.push(line); console.log(line) }

try {
  const swTarget = await waitFor('extension service worker', async () =>
    (await targets()).find(t => t.type === 'service_worker' && t.url.endsWith('/service-worker-loader.js')))
  const sw = new Cdp(swTarget.webSocketDebuggerUrl)
  const evaluate = async <T>(body: string): Promise<T> => {
    const r = await sw.send<{ result: { value: T }; exceptionDetails?: unknown }>('Runtime.evaluate',
      { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
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
  const times = results.map(r => r.ms).sort((a, b) => a - b)
  const scored = results.filter(r => r.expect !== 'either')
  const summary = {
    device, chrome: execFileSync(chromeBinary(), ['--version']).toString().trim(),
    commit: execFileSync('git', ['describe', '--always', '--dirty', '--exclude=*']).toString().trim(),
    date: new Date().toISOString(), setup: { phase, reason: status?.reason ?? null, ms: setupMs, downloadMs: downloadEnd ? downloadEnd - setupStart : null },
    memory: { baseline, setupPeak, afterSetup, afterRun },
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
  writeFileSync(`eval/results/chrome-${device}.json`, JSON.stringify(summary, null, 2) + '\n')
  note(`judgments: ${summary.judgments.correct} correct, median ${((summary.judgments.medianMs ?? 0) / 1000).toFixed(1)} s, max ${((summary.judgments.maxMs ?? 0) / 1000).toFixed(1)} s, over 90 s: ${summary.judgments.overWindow.length}`)
  note(`peak footprint during run: extension ${gb(afterRun.extension?.peak ?? 0)}, GPU ${gb(afterRun.gpu?.peak ?? 0)}, total ${gb(afterRun.total!.peak)}`)
  if (errors.length) note(`offscreen errors (${errors.length}): ${errors.slice(0, 3).join(' | ')}`)
  sw.close(); off.close()
} finally {
  chrome.kill()
}
