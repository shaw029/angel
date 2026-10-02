// Usage: npm run eval:models [-- <model>|report <candidate>] [--prefetch] [--only=<case-id>]
// With no model, runs every candidate in eval/candidates.json and the shipped
// Full model, then writes one report per candidate. Pinned CPU model files are
// downloaded into .eval-cache/ on first run (Full alone is about 3.6 GB).
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const outfile = resolve('node_modules/.cache/angel-eval/run.mjs')
await build({
  entryPoints: ['eval/run.ts'], outfile,
  bundle: true, platform: 'node', format: 'esm', tsconfig: 'tsconfig.json',
  external: ['@huggingface/transformers'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
})

const args = process.argv.slice(2)
const flags = args.filter(a => a.startsWith('--'))
const [target, candidate] = args.filter(a => !a.startsWith('--'))
const candidates = Object.keys(JSON.parse(readFileSync('eval/candidates.json', 'utf8')))
const steps = target === 'report' ? [['report', candidate ?? candidates[0]]]
  : target ? [['run', target, ...flags]]
  : [...candidates.map(c => ['run', c, ...flags]), ['run', 'full', ...flags],
     ...(flags.length ? [] : candidates.map(c => ['report', c]))]

for (const step of steps) {
  const { status } = spawnSync(process.execPath, [outfile, ...step], { stdio: 'inherit' })
  if (status !== 0) { process.exitCode = status ?? 1; break }
}
