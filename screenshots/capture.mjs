/**
 * Regenerates the Chrome Web Store screenshots at the required 1280×800.
 *
 * This does not re-implement the UI in hand-written HTML the way the old
 * version did — it builds screenshots/harness, which imports the real Nudge
 * (mounted through the real content-script mountNudge, shadow root and all)
 * and the real popup App. When the shipped UI changes, these images follow.
 *
 * Run: node screenshots/capture.mjs
 * Requires: Google Chrome at /Applications/Google Chrome.app
 */

import { execSync, spawn } from 'child_process'
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { dirname, extname, join } from 'path'
import { fileURLToPath } from 'url'

const DIR    = dirname(fileURLToPath(import.meta.url))
const ROOT   = join(DIR, '..')
const DIST   = join(DIR, 'harness/dist')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT   = 4599

// Scene ids, kept in sync with harness/scenes.tsx.
const SCENES = [
  '1_full_card',
  '2_subtle_pill',
  '3_remind_me_later',
  '4_popup',
  '5_on_device',
]

// How long the load event is held open so the nudge's entry spring settles.
// Must stay well under the component's own auto-dismiss (10s subtle / 20s full).
const HOLD_MS = 900

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif',
}

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

console.log('Building harness…')
execSync(`npx vite build --config ${JSON.stringify(join(DIR, 'harness/vite.config.ts'))}`, {
  cwd: ROOT, stdio: 'pipe',
})

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0]

  // Deliberately slow: this is what holds the load event open.
  if (path === '/hold.gif') {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'image/gif' })
      res.end(GIF)
    }, HOLD_MS)
    return
  }

  try {
    const file = join(DIST, path === '/' ? 'index.html' : path)
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end('not found')
  }
})

await new Promise(r => server.listen(PORT, '127.0.0.1', r))
console.log(`Serving harness on :${PORT}…`)

let ok = 0, fail = 0
for (const scene of SCENES) {
  const out = join(DIR, `store_${scene}.png`)
  const url = `http://127.0.0.1:${PORT}/index.html?scene=${scene}&hold=1`
  // Must be async: the hold server lives in this process, so a blocking
  // execSync here would deadlock against Chrome's own request for /hold.gif.
  const code = await new Promise(resolve => {
    const child = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1280,800',
      `--screenshot=${out}`,
      url,
    ], { stdio: 'ignore' })
    const t = setTimeout(() => { child.kill(); resolve('timeout') }, 60_000)
    child.on('exit', c => { clearTimeout(t); resolve(c) })
  })

  if (code === 0) { console.log(`  ✓  store_${scene}.png`); ok++ }
  else { console.error(`  ✗  ${scene} → chrome exited: ${code}`); fail++ }
}

server.close()
console.log(`\nDone — ${ok} saved, ${fail} failed.  Output: screenshots/store_*.png`)
