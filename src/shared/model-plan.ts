import manifest from './model-manifest.json'
import { MSG } from './constants'
import type { ModelDevice, ModelPreference, ModelRun } from './types'

export const MODEL_REVISION = manifest.revision
export const MODEL_PREFERENCE_KEY = 'modelPreference'
export const MODEL_RUN_KEY = 'modelRun'
export const modelDownloadBytes = (device: ModelDevice): number =>
  Object.values(manifest.files[device]).reduce((sum, bytes) => sum + bytes, 0)
export const formatGB = (bytes: number): string => `${(bytes / 1e9).toFixed(1)} GB`
export const modelFiles = (device: ModelDevice): Record<string, number> => manifest.files[device]

export function hasModelConsent(preference: ModelPreference): boolean {
  return preference.choice === 'enabled' && preference.revision === MODEL_REVISION &&
    preference.device === 'webgpu'  // the bundled CPU runtime cannot run this model
}

export async function getModelPreference(): Promise<ModelPreference> {
  const stored = (await chrome.storage.local.get(MODEL_PREFERENCE_KEY))[MODEL_PREFERENCE_KEY] as ModelPreference | undefined
  if (!stored || (stored.choice === 'enabled' && !hasModelConsent(stored))) return { choice: 'pending' }
  return stored
}

export async function getAuthorizedModelRun(): Promise<ModelRun | null> {
  const preference = await getModelPreference()
  const run = (await chrome.storage.session.get(MODEL_RUN_KEY))[MODEL_RUN_KEY] as ModelRun | undefined
  return run && hasModelConsent(preference) && run.revision === preference.revision && run.device === preference.device ? run : null
}

// Offscreen documents get chrome.runtime but not chrome.storage, so the model
// document asks the background, which owns consent, for the authorized run.
export async function requestModelRun(): Promise<ModelRun | null> {
  try { return (await chrome.runtime.sendMessage({ type: MSG.GET_MODEL_RUN })) ?? null }
  catch { return null }
}

export async function detectModelDevice(): Promise<ModelDevice> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return 'wasm'
  try {
    const gpu = (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu
    return await gpu.requestAdapter() ? 'webgpu' : 'wasm'
  } catch { return 'wasm' }
}

// One progress ledger spans all files, including completed/cache-hit resources.
// The denominator comes from the pinned manifest, not just currently active files.
export class ModelDownloadProgress {
  private loaded = new Map<string, number>()
  constructor(private device: ModelDevice) {}
  update(file: string, loaded: number, done = false) {
    const files = modelFiles(this.device)
    const key = Object.keys(files).find(path => path === file || path.endsWith(`/${file}`))
    if (key) this.loaded.set(key, done ? files[key]! : Math.max(this.loaded.get(key) ?? 0, Math.min(files[key]!, loaded)))
    const loadedBytes = [...this.loaded.values()].reduce((sum, n) => sum + n, 0)
    const totalBytes = modelDownloadBytes(this.device)
    return { loadedBytes, totalBytes, progress: loadedBytes / totalBytes }
  }
}
