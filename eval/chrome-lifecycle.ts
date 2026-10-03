// Lifecycle checks in Chrome for Testing that need a real page or browser setting.
//
//   wake       With consent and cached files (run `eval:chrome -- webgpu` once on
//              the same profile first), opening the popup must leave the model in
//              standby; a shopping page with pressure mechanics, clicked in rapid
//              bursts, must wake it; and the model, loaded from cached files only,
//              must then return a real judgment. Without interaction Angel
//              estimates intentional browsing, whose strategy never asks for a
//              judgment, so an untouched page does not wake it.
//   no-webgpu  With the GPU disabled and a fresh profile, the popup must say local
//              AI is unavailable and nothing may start downloading.
//
// Usage: npm run eval:chrome -- lifecycle <wake|no-webgpu> [--profile=<dir>]
import { createServer } from 'node:http'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import manifest from '@shared/model-manifest.json'
import { CASES } from './cases'
import { Cdp, defaultProfile, evaluateIn, extensionWorker, launchChrome, note as noter, port, sleep, targets, waitFor } from './chrome-lib'

const check = process.argv[2]
if (check !== 'wake' && check !== 'no-webgpu') throw new Error('Usage: eval:chrome -- lifecycle <wake|no-webgpu> [--profile=<dir>]')
const flag = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const log: string[] = []
const note = noter(log)

// A product page using the mechanics Angel's detectors look for.
const SHOP_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Flash Sale: Noise-Cancelling Headphones – Only 3 left</title></head>
<body style="font-family: system-ui; max-width: 640px; margin: 40px auto">
<h1>Noise-Cancelling Headphones</h1>
<p><strong>Flash sale!</strong> Only 3 left in stock. 27 people are viewing this right now.</p>
<p>Hurry, offer ends in <span id="t">04:59</span>. Don't miss out. Today only.</p>
<button>Buy now</button>
<script>let s = 299; setInterval(() => { s = Math.max(0, s - 1); document.getElementById('t').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') }, 1000)</script>
</body></html>`

async function openTab(url: string): Promise<Cdp> {
  const browser = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() as { webSocketDebuggerUrl: string }
  const b = new Cdp(browser.webSocketDebuggerUrl)
  const { targetId } = await b.send<{ targetId: string }>('Target.createTarget', { url })
  b.close()
  const t = await waitFor(`tab ${url}`, async () => (await targets()).find(t => (t as { id?: string }).id === targetId))
  const tab = new Cdp(t.webSocketDebuggerUrl)
  await tab.send('Page.enable')
  await tab.send('Page.bringToFront')
  return tab
}
async function screenshot(tab: Cdp, file: string) {
  const { data } = await tab.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  writeFileSync(file, Buffer.from(data, 'base64'))
  note(`screenshot ${file}`)
}

const results: Record<string, unknown> = { check, date: new Date().toISOString() }
mkdirSync('eval/results', { recursive: true })
const shots = resolve('eval/results/screenshots')
mkdirSync(shots, { recursive: true })

if (check === 'no-webgpu') {
  const profile = resolve(flag('profile') ?? defaultProfile('angel-chrome-no-webgpu'))
  rmSync(profile, { recursive: true, force: true })
  const chrome = await launchChrome(profile, ['--disable-gpu'])
  try {
    const sw = await extensionWorker()
    const id = new URL((await targets()).find(t => t.url.endsWith('/service-worker-loader.js'))!.url).host
    const popup = await openTab(`chrome-extension://${id}/src/popup/index.html`)
    results.adapter = await evaluateIn(popup, `return !!(await navigator.gpu?.requestAdapter())`)
    results.message = await waitFor('popup setup card', async () => {
      const text = await evaluateIn<string>(popup, `return document.body.innerText`)
      return /not available in this browser|Download and enable/.test(text) ? text : undefined
    })
    await sleep(3_000)
    results.offscreenDocument = await evaluateIn(sw, `return await chrome.offscreen.hasDocument()`)
    results.storage = await evaluateIn(sw, `return { local: await chrome.storage.local.get('modelPreference'), session: await chrome.storage.session.get(null) }`)
    results.passed = results.adapter === false && /not available in this browser/.test(String(results.message)) &&
      !/Download and enable/.test(String(results.message)) && results.offscreenDocument === false
    note(`adapter ${results.adapter}; popup ${/not available in this browser/.test(String(results.message)) ? 'shows unavailable' : 'offers setup'}; model document ${results.offscreenDocument}`)
    await screenshot(popup, join(shots, 'popup-no-webgpu.png'))
  } finally { chrome.kill() }
}

if (check === 'wake') {
  const profile = resolve(flag('profile') ?? defaultProfile('angel-chrome-eval'))
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(SHOP_PAGE) })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const pagePort = (server.address() as { port: number }).port
  const chrome = await launchChrome(profile)
  try {
    const sw = await extensionWorker()
    const evaluate = <T>(body: string) => evaluateIn<T>(sw, body)
    const status = () => evaluate<{ phase: string } | undefined>(`return (await chrome.storage.session.get('modelStatus')).modelStatus`)
    // Consent as setup writes it; the model files are already cached in this profile.
    await evaluate(`await chrome.storage.local.set({ modelPreference: { choice: 'enabled', device: 'webgpu', revision: ${JSON.stringify(manifest.revision)} } })`)
    await evaluate(`
      globalThis.__judgments = []
      chrome.runtime.onMessage.addListener(m => { if (m.type === 'JUDGMENT') globalThis.__judgments.push({ at: Date.now(), requestId: m.payload.requestId, alignment: m.payload.judgment?.alignment ?? null, nudged: !!m.payload.intervention }) })`)

    const id = new URL((await targets()).find(t => t.url.endsWith('/service-worker-loader.js'))!.url).host
    const popup = await openTab(`chrome-extension://${id}/src/popup/index.html`)
    await waitFor('popup ready card', async () => /Angel is ready/.test(await evaluateIn<string>(popup, `return document.body.innerText`)) || undefined)
    await sleep(2_000)
    results.afterPopup = { status: await status(), offscreenDocument: await evaluate(`return await chrome.offscreen.hasDocument()`) }
    note(`after opening the popup: ${JSON.stringify(results.afterPopup)}`)
    await screenshot(popup, join(shots, 'popup-standby.png'))
    await popup.send('Page.close').catch(() => undefined)

    const opened = Date.now()
    const page = await openTab(`http://127.0.0.1:${pagePort}/`)
    note('opened the shop page')
    // Bursts of trusted clicks: 8+ within 3 s is an interaction loop.
    const clicking = setInterval(() => void (async () => {
      for (let i = 0; i < 10; i++) {
        for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: 120, y: 260, button: 'left', clickCount: 1 }).catch(() => undefined)
        await sleep(120)
      }
    })(), 12_000)
    const phases: { phase: string; afterMs: number }[] = []
    let last = ''
    const modelErrors: string[] = []
    let watching = false
    // 1. The page alone must wake the model. How soon depends on Angel's
    //    behaviour estimate, which varies with the simulated clicks.
    await waitFor('the page to wake the model', async () => {
      const s = await status()
      if (s?.phase && s.phase !== last) { last = s.phase; phases.push({ phase: last, afterMs: Date.now() - opened }); note(`phase ${last} at ${((Date.now() - opened) / 1000).toFixed(0)} s`) }
      const off = !watching && (await targets()).find(t => t.url.includes('/src/offscreen/index.html'))
      if (off) {
        watching = true
        const doc = new Cdp(off.webSocketDebuggerUrl)
        doc.on(msg => {
          if (msg.method === 'Runtime.exceptionThrown') modelErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text)
          if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type) && !String(msg.params.args[0]?.value).startsWith('Unable to load from local path')) modelErrors.push(msg.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ').slice(0, 600))
        })
        await doc.send('Runtime.enable')
      }
      return s?.phase === 'ready' || s?.phase === 'error' || undefined
    }, 8 * 60_000).finally(() => clearInterval(clicking))
    results.phases = phases

    // 2. A model loaded from cached files only must produce a real judgment.
    const scenario = CASES.find(c => c.id === 'shop-bill-to-sale')!
    const judged = await evaluate<{ ms: number; alignment: string | null; nudged: boolean }>(`
      const run = (await chrome.storage.session.get('modelRun')).modelRun
      const requestId = crypto.randomUUID(); const start = Date.now()
      const seen = globalThis.__judgments.length
      chrome.runtime.sendMessage({ type: 'AI_CONTEXT', payload: { modelRunId: run.id, requestId, tabId: -1, ctx: ${JSON.stringify(scenario.ctx)}, expiresAt: start + 5 * 60_000 } }).catch(() => {})
      while (globalThis.__judgments.length === seen) await new Promise(r => setTimeout(r, 100))
      const j = globalThis.__judgments.at(-1)
      return { ms: j.at - start, alignment: j.alignment, nudged: j.nudged }`)
    results.judgmentAfterWake = { scenario: scenario.id, allowDownload: (await evaluate<{ allowDownload: boolean }>(`return (await chrome.storage.session.get('modelRun')).modelRun`)).allowDownload, ...judged }
    results.modelErrors = modelErrors
    note(`judgment after a cache-only wake (${scenario.id}): ${judged.alignment ?? 'EMPTY'}, ${judged.nudged ? 'nudge proposed' : 'quiet'}, ${(judged.ms / 1000).toFixed(1)} s`)
    if (modelErrors.length) note(`model document errors: ${modelErrors.slice(0, 3).join(' | ')}`)
    await sleep(4_000)
    await screenshot(page, join(shots, 'shop-page-after-judgment.png'))
    results.passed = (results.afterPopup as { status?: { phase: string }; offscreenDocument: boolean }).status?.phase === 'standby' &&
      !(results.afterPopup as { offscreenDocument: boolean }).offscreenDocument && phases.some(p => p.phase === 'ready') &&
      judged.alignment !== null && modelErrors.length === 0
  } finally { chrome.kill(); server.close() }
}

results.log = log
writeFileSync(`eval/results/chrome-lifecycle-${check}.json`, JSON.stringify(results, null, 2) + '\n')
note(`${check}: ${results.passed ? 'PASS' : 'FAIL'}`)
if (!results.passed) process.exitCode = 1
