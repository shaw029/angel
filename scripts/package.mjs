import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { checkVersions } from './version.mjs'

const version = await checkVersions()
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'))
if (manifest.version_name !== version) throw new Error('Build is stale. Run npm run build first.')
for (const path of ['dist/ort-wasm-simd-threaded.asyncify.wasm', 'dist/src/offscreen/index.html', `dist/${manifest.background.service_worker}`, `dist/${manifest.action.default_popup}`]) await access(path)
const dir = resolve('artifacts', `v${version}`)
await mkdir(dir, { recursive: true })
const archive = resolve(dir, 'angel-extension.zip')
await rm(archive, { force: true })
const result = spawnSync('zip', ['-q', '-r', archive, '.', '-x', '*.DS_Store'], { cwd: 'dist', stdio: 'inherit' })
if (result.error || result.status !== 0) throw new Error('Packaging failed; install the zip utility and retry.')
const sha = createHash('sha256').update(await readFile(archive)).digest('hex')
await writeFile(resolve(dir, 'SHA256SUMS.txt'), `${sha}  angel-extension.zip\n`)
console.log(`Packaged ${archive}`)
