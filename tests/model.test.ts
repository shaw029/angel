import test from 'node:test'
import assert from 'node:assert/strict'
import { GemmaEngine } from '../src/ai/engine'
import manifest from '../src/shared/model-manifest.json'
import { calls, setFailure } from './fixtures/model-runtime'
import { DEFAULT_MODEL_PROFILE, ModelDownloadProgress, modelDefinition, modelFiles, modelDownloadBytes, modelRevision } from '../src/shared/model-plan'
import type { ModelProfile } from '../src/shared/types'
const local: Record<string, any> = {}
const session: Record<string, any> = {}
;(globalThis as any).chrome = {
  runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` },
  storage: {
    local: { async get(key: string) { return { [key]: local[key] } } },
    session: { async get(key: string) { return { [key]: session[key] } } },
  },
}
function consent(model: ModelProfile, allowDownload: boolean) {
  local.modelPreference = { choice: 'enabled', model, revision: modelRevision(model), device: 'webgpu' }
  session.modelRun = { id: 'run', model, revision: modelRevision(model), device: 'webgpu', allowDownload }
}

test('runtime refuses network/model construction without consent even if invoked directly', async () => {
  delete local.modelPreference
  delete session.modelRun
  const before = calls.length
  await assert.rejects(new GemmaEngine().ensureReady(), /Enable local AI/)
  assert.equal(calls.length, before)
})

test('explicit setup pins files and device; restoration forbids remote downloads', async () => {
  consent('full', true)
  await new GemmaEngine().ensureReady()
  assert.equal(calls.at(-1).model, modelDefinition('full').modelId)
  assert.equal(calls.at(-1).options.revision, modelRevision('full'))
  assert.equal(calls.at(-1).options.dtype, 'q4f16')
  assert.equal(calls.at(-1).options.local_files_only, false)
  assert.equal(calls.at(-1).remote, true)
  consent('full', false)
  await new GemmaEngine().ensureReady()
  assert.equal(calls.at(-1).options.local_files_only, true)
  assert.equal(calls.at(-1).remote, false)
  setFailure(true)
  const before = calls.length
  const originalError = console.error
  console.error = () => undefined
  try { await assert.rejects(new GemmaEngine().ensureReady()) } finally { console.error = originalError }
  assert.equal(calls.length, before + 1, 'no retry with networking enabled')
  setFailure(false)
})

test('each profile has a pinned model, and download accounting uses its complete denominator', () => {
  assert.equal(DEFAULT_MODEL_PROFILE, 'full')
  assert.equal(modelDefinition('lite').modelId, manifest.models.lite.modelId)
  assert.equal(modelDefinition('full').modelId, manifest.models.full.modelId)
  const device = 'webgpu'
  const progress = new ModelDownloadProgress('full', device)
  const files = Object.entries(modelFiles('full', device))
  const first = progress.update(files[0]![0], 0, true)
  assert.equal(first.totalBytes, modelDownloadBytes('full', device))
  assert.equal(first.loadedBytes, files[0]![1])
  assert.ok(first.progress < 0.01, 'a complete small config is not 100% of the model')
  const half = progress.update(files[1]![0], files[1]![1] / 2)
  assert.ok(half.loadedBytes > first.loadedBytes)
  assert.equal(progress.update(files[1]![0], 0).loadedBytes, half.loadedBytes)
  for (const [file] of files) progress.update(file, 0, true)
  assert.equal(progress.update('unknown optional file', 999).progress, 1)
  assert.ok(modelDownloadBytes('full', 'wasm') > modelDownloadBytes('full', 'webgpu'))
  assert.ok(modelDownloadBytes('lite', 'webgpu') < modelDownloadBytes('full', 'webgpu') * 0.3)
})

test('Lite setup selects its model and revision, rather than reusing Full cached files', async () => {
  consent('lite', true)
  await new GemmaEngine().ensureReady()
  assert.equal(calls.at(-1).model, modelDefinition('lite').modelId)
  assert.equal(calls.at(-1).options.revision, modelRevision('lite'))
})

test('pre-profile consent and a cached run continue with Full only', async () => {
  local.modelPreference = { choice: 'enabled', revision: modelRevision('full'), device: 'webgpu' }
  session.modelRun = { id: 'legacy-run', revision: modelRevision('full'), device: 'webgpu', allowDownload: false }
  await new GemmaEngine().ensureReady()
  assert.equal(calls.at(-1).model, modelDefinition('full').modelId)
  assert.equal(calls.at(-1).options.local_files_only, true)
})
