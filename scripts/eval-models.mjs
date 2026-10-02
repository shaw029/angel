// npm run eval:models                       run the shipped model, write docs/evaluation/FULL.md
// npm run eval:models -- <model> [flags]    run one model: --only=<id,…|held-out> --tag=<name> --prefetch
// npm run eval:models -- report             rewrite FULL.md from saved results
// npm run eval:models -- compare <model>    write <MODEL>_VS_FULL.md for a candidate in eval/candidates.json
// Pinned CPU model files are downloaded into .eval-cache/ on first run (Full is about 3.6 GB).
import { build } from 'esbuild'
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
const steps = args.length === 0 ? [['run', 'full'], ['report']]
  : ['report', 'compare'].includes(args[0]) ? [args]
  : [['run', ...args]]

for (const step of steps) {
  const { status } = spawnSync(process.execPath, [outfile, ...step], { stdio: 'inherit' })
  if (status !== 0) { process.exitCode = status ?? 1; break }
}
