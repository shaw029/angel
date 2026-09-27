import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export function chromeVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/.exec(version)
  if (!match || match.slice(1, 4).some(n => Number(n) > 65535) || match.slice(1, 4).every(n => Number(n) === 0)) {
    throw new Error(`Unsupported release version: ${version}`)
  }
  return match.slice(1, 4).join('.')
}

export async function checkVersions() {
  const [pkg, lock, manifest] = await Promise.all(['package.json', 'package-lock.json', 'manifest.json'].map(async p => JSON.parse(await readFile(p, 'utf8'))))
  const numeric = chromeVersion(pkg.version)
  if (lock.name !== pkg.name || lock.packages[''].name !== pkg.name || lock.version !== pkg.version || lock.packages[''].version !== pkg.version || manifest.version !== numeric || manifest.version_name !== pkg.version) {
    throw new Error('Version mismatch. Run npm run version:set -- <version>.')
  }
  return pkg.version
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2]
  if (target && target !== '--check') {
    const numeric = chromeVersion(target)
    for (const path of ['package.json', 'package-lock.json', 'manifest.json']) {
      const data = JSON.parse(await readFile(path, 'utf8'))
      data.version = path === 'manifest.json' ? numeric : target
      if (path === 'manifest.json') data.version_name = target
      if (path === 'package-lock.json') data.packages[''].version = target
      await writeFile(path, `${JSON.stringify(data, null, 2)}\n`)
    }
  }
  console.log(`Versions consistent: ${await checkVersions()}`)
}
