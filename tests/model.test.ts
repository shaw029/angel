import test from 'node:test'
import assert from 'node:assert/strict'
import { GemmaEngine } from '../src/ai/engine'
import manifest from '../src/shared/model-manifest.json'
import { MODEL_ID, MSG } from '../src/shared/constants'
import { calls, env, setFailure } from './fixtures/model-runtime'
import { getAuthorizedModelRun, MODEL_REVISION, ModelDownloadProgress, modelFiles, modelDownloadBytes } from '../src/shared/model-plan'
const local: Record<string, any> = {}
const session: Record<string, any> = {}
// The engine runs in an offscreen document, where Chrome provides chrome.runtime
// but not chrome.storage. Consent is answered by the background's own check.
const background = { storage: {
  local: { async get(key: string) { return { [key]: local[key] } } },
  session: { async get(key: string) { return { [key]: session[key] } } },
} }
const offscreen = {
  runtime: {
    getURL: (path: string) => `chrome-extension://fixture/${path}`,
    async sendMessage(message: { type: string }) {
      if (message.type !== MSG.GET_MODEL_RUN) return undefined
      ;(globalThis as any).chrome = background
      try { return await getAuthorizedModelRun() } finally { (globalThis as any).chrome = offscreen }
    },
  },
}
;(globalThis as any).chrome = offscreen
function consent(allowDownload: boolean) {
  local.modelPreference = { choice: 'enabled', revision: MODEL_REVISION, device: 'webgpu' }
  session.modelRun = { id: 'run', revision: MODEL_REVISION, device: 'webgpu', allowDownload }
}

test('runtime refuses network/model construction without consent even if invoked directly', async () => {
  delete local.modelPreference
  delete session.modelRun
  const before = calls.length
  await assert.rejects(new GemmaEngine().ensureReady(), /Enable local AI/)
  assert.equal(calls.length, before)
})

test('explicit setup pins files and device; restoration forbids remote downloads', async () => {
  consent(true)
  await new GemmaEngine().ensureReady()
  assert.equal(calls.at(-1).options.revision, MODEL_REVISION)
  assert.equal(calls.at(-1).options.dtype, 'q4f16')
  assert.equal(calls.at(-1).options.local_files_only, false)
  assert.equal(calls.at(-1).remote, true)
  consent(false)
  await new GemmaEngine().ensureReady()
  assert.equal(calls.at(-1).options.local_files_only, true)
  assert.equal(calls.at(-1).remote, false)
  // Lookups that omit the revision (tokenizer discovery) must still find the pinned cache.
  assert.equal(env.remotePathTemplate, `{model}/resolve/${MODEL_REVISION}/`)
  setFailure(true)
  const before = calls.length
  const originalError = console.error
  console.error = () => undefined
  try { await assert.rejects(new GemmaEngine().ensureReady()) } finally { console.error = originalError }
  assert.equal(calls.length, before + 1, 'no retry with networking enabled')
  setFailure(false)
})

test('download accounting retains complete files and uses the full model denominator', () => {
  assert.equal(MODEL_ID, manifest.modelId)
  const device = 'webgpu'
  const progress = new ModelDownloadProgress(device)
  const files = Object.entries(modelFiles(device))
  const first = progress.update(files[0]![0], 0, true)
  assert.equal(first.totalBytes, modelDownloadBytes(device))
  assert.equal(first.loadedBytes, files[0]![1])
  assert.ok(first.progress < 0.01, 'a complete small config is not 100% of the model')
  const half = progress.update(files[1]![0], files[1]![1] / 2)
  assert.ok(half.loadedBytes > first.loadedBytes)
  assert.equal(progress.update(files[1]![0], 0).loadedBytes, half.loadedBytes)
  for (const [file] of files) progress.update(file, 0, true)
  assert.equal(progress.update('unknown optional file', 999).progress, 1)
  assert.ok(modelDownloadBytes('wasm') > modelDownloadBytes('webgpu'))
})
