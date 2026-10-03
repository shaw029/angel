// npm run eval:chrome -- <webgpu|wasm> [--cases=all|<count>] [--profile=<dir>] [--idle]
// npm run eval:chrome -- lifecycle <wake|no-webgpu> [--profile=<dir>]
// Builds the extension, then measures model setup and judgments in Chrome for Testing.
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

if (spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }).status !== 0) process.exit(1)
const lifecycle = process.argv[2] === 'lifecycle'
const entry = lifecycle ? 'chrome-lifecycle' : 'chrome'
const outfile = resolve(`node_modules/.cache/angel-eval/${entry}.mjs`)
await build({
  entryPoints: [`eval/${entry}.ts`], outfile, bundle: true, platform: 'node', format: 'esm',
  tsconfig: 'tsconfig.json', logLevel: 'warning',
})
process.exitCode = spawnSync(process.execPath, [outfile, ...process.argv.slice(lifecycle ? 3 : 2)], { stdio: 'inherit' }).status ?? 1
