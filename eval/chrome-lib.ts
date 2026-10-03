// Shared helpers for the Chrome scripts: Chrome for Testing, a minimal CDP
// client, and per-process memory from macOS footprint.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const port = 9333

export function chromeBinary(): string {
  if (process.env.CHROME_FOR_TESTING) return process.env.CHROME_FOR_TESTING
  const root = join(homedir(), 'Library/Caches/ms-playwright')
  const found = execFileSync('find', [root, '-maxdepth', '6', '-path', '*MacOS/Google Chrome for Testing', '-type', 'f']).toString().trim().split('\n').sort().at(-1)
  if (!found) throw new Error('Chrome for Testing not found; set CHROME_FOR_TESTING')
  return found
}

// ─── Minimal CDP client ───────────────────────────────────────────────────────

export class Cdp {
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

export async function targets(): Promise<{ type: string; url: string; webSocketDebuggerUrl: string }[]> {
  return (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
}
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export async function waitFor<T>(what: string, fn: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) { try { const v = await fn(); if (v) return v } catch { /* not yet */ } await sleep(500) }
  throw new Error(`Timed out waiting for ${what}`)
}

// ─── Process memory (macOS footprint, includes GPU allocations on Apple silicon) ─

export interface Footprint { now: number; peak: number }
export function processTree(root: number): { pid: number; kind: string }[] {
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
export function memory(root: number): Record<string, Footprint> {
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
export const gb = (b: number) => `${(b / 1e9).toFixed(2)} GB`

// Starts Chrome for Testing with the built extension in `profile`. A reused
// profile keeps the previous build's worker script while the version is
// unchanged, so cached scripts and the registration are dropped; downloaded
// model files live separately in CacheStorage and are kept.
export async function launchChrome(profile: string, extraArgs: string[] = []): Promise<ChildProcess> {
  // A browser already on this port would receive the launch as a new tab
  // instead of starting, and the script would drive the wrong instance.
  const inUse = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)
  if (inUse) throw new Error(`Port ${port} is in use; close the other Chrome for Testing first`)
  mkdirSync(profile, { recursive: true })
  for (const dir of ['ScriptCache', 'Database']) rmSync(join(profile, 'Default', 'Service Worker', dir), { recursive: true, force: true })
  const dist = resolve('dist')
  return spawn(chromeBinary(), [
    `--user-data-dir=${profile}`, `--load-extension=${dist}`, `--disable-extensions-except=${dist}`,
    `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' })
}

export async function extensionWorker(): Promise<Cdp> {
  const t = await waitFor('extension service worker', async () =>
    (await targets()).find(t => t.type === 'service_worker' && t.url.endsWith('/service-worker-loader.js')))
  return new Cdp(t.webSocketDebuggerUrl)
}

// Runs an async function body in a CDP target and returns its value.
export async function evaluateIn<T>(target: Cdp, body: string): Promise<T> {
  const r = await target.send<{ result: { value: T }; exceptionDetails?: unknown }>('Runtime.evaluate',
    { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}

export const note = (log: string[]) => (s: string) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`; log.push(line); console.log(line) }
export const defaultProfile = (name: string) => join(tmpdir(), name)
