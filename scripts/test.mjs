import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const dir = await mkdtemp(join(tmpdir(), 'angel-tests-'))
try {
  for (const name of ['core', 'background', 'ui', 'narrator', 'model']) {
    await build({
      entryPoints: [`tests/${name}.test.ts`], outfile: join(dir, `${name}.test.mjs`),
      bundle: true, platform: 'node', format: 'esm', tsconfig: 'tsconfig.json',
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
      plugins: name === 'narrator' ? [{ name: 'mock-local-inference', setup(build) {
        build.onResolve({ filter: /^\.\/infer$/ }, args => args.importer.endsWith('/src/ai/index.ts')
          ? { path: resolve('tests/fixtures/infer.ts') } : undefined)
      } }] : [],
      ...(name === 'model' ? { alias: { '@huggingface/transformers': resolve('tests/fixtures/model-runtime.ts') } } : {}),
      ...(name === 'background' ? { alias: { '@memory/index': resolve('tests/fixtures/memory.ts') } } : {}),
    })
  }
  const result = spawnSync(process.execPath, ['--test', join(dir, 'core.test.mjs'), join(dir, 'background.test.mjs'), join(dir, 'ui.test.mjs'), join(dir, 'narrator.test.mjs'), join(dir, 'model.test.mjs')], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} finally { await rm(dir, { recursive: true, force: true }) }
