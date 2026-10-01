import { ensureOffscreenDocument, closeOffscreenDocument } from './offscreen'
import { getModelPreference, getAuthorizedModelRun, hasModelConsent, isModelProfile, MODEL_PREFERENCE_KEY, MODEL_RUN_KEY, modelRevision } from '@shared/model-plan'
import type { ModelDevice, ModelLoadStatus, ModelProfile, ModelRun, ModelSetupView } from '@shared/types'

export async function modelSetupView(): Promise<ModelSetupView> {
  const preference = await getModelPreference()
  const { modelStatus } = await chrome.storage.session.get('modelStatus')
  return { preference, status: hasModelConsent(preference) ? modelStatus ?? { phase: 'idle' } : { phase: 'idle' } }
}

// Caller serializes lifecycle operations, but never waits for model downloads.
export async function startModel(model: ModelProfile, device: ModelDevice, allowDownload: boolean): Promise<void> {
  await closeOffscreenDocument()
  const run: ModelRun = { id: crypto.randomUUID(), model, revision: modelRevision(model), device, allowDownload }
  await chrome.storage.session.set({ [MODEL_RUN_KEY]: run, modelStatus: { phase: 'checking' } })
  try { await ensureOffscreenDocument() }
  catch {
    await chrome.storage.session.remove(MODEL_RUN_KEY)
    await chrome.storage.session.set({ modelStatus: { phase: 'error', reason: 'Could not start local AI. Please try again.' } })
  }
}

export async function enableModel(model: ModelProfile, device: ModelDevice): Promise<void> {
  const current = await getAuthorizedModelRun()
  const { status } = await modelSetupView()
  if (current?.model === model && current.device === device && status.phase !== 'error' && status.phase !== 'idle' && await chrome.offscreen.hasDocument()) return
  await chrome.storage.local.set({ [MODEL_PREFERENCE_KEY]: { choice: 'enabled', model, device, revision: modelRevision(model) } })
  await startModel(model, device, true)
}

export async function stopModel(model?: ModelProfile, device?: ModelDevice): Promise<void> {
  // Revoke first, so queued progress/results cannot revive a cancelled download.
  const previous = await getModelPreference()
  await chrome.storage.local.set({ [MODEL_PREFERENCE_KEY]: {
    choice: 'deferred',
    ...(isModelProfile(model) ? { model } : isModelProfile(previous.model) ? { model: previous.model } : {}),
    ...(device === 'webgpu' || device === 'wasm' ? { device } : previous.device ? { device: previous.device } : {}),
  } })
  await chrome.storage.session.remove(MODEL_RUN_KEY)
  await chrome.storage.session.set({ modelStatus: { phase: 'idle' } })
  // Destroying the owner document aborts its fetches, queue and runtime.
  await closeOffscreenDocument()
}

export async function restoreModel(): Promise<void> {
  const preference = await getModelPreference()
  if (!hasModelConsent(preference)) {
    const { modelStatus } = await chrome.storage.session.get('modelStatus')
    const storedRun = (await chrome.storage.session.get(MODEL_RUN_KEY))[MODEL_RUN_KEY]
    if (storedRun) await chrome.storage.session.remove(MODEL_RUN_KEY)
    if (modelStatus?.phase !== 'idle') await chrome.storage.session.set({ modelStatus: { phase: 'idle' } })
    await closeOffscreenDocument()
    return
  }
  if (await chrome.offscreen.hasDocument()) return
  const { status } = await modelSetupView()
  if (status.phase === 'error') return // retry is an explicit user action
  // Restart may use cached files only. Missing/evicted files require another click.
  await startModel(preference.model!, preference.device!, false)
}

export async function acceptModelProgress(runId: string, status: ModelLoadStatus): Promise<void> {
  const run = await getAuthorizedModelRun()
  if (!run || run.id !== runId) return
  if (status.phase === 'ready' || status.phase === 'error') {
    await chrome.storage.session.set({ [MODEL_RUN_KEY]: { ...run, allowDownload: false } })
  }
  await chrome.storage.session.set({ modelStatus: status })
}
