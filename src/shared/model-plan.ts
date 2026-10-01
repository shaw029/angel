import manifest from './model-manifest.json'
import type { ModelDevice, ModelPreference, ModelProfile, ModelRun } from './types'

export const DEFAULT_MODEL_PROFILE: ModelProfile = 'full'
export const MODEL_PREFERENCE_KEY = 'modelPreference'
export const MODEL_RUN_KEY = 'modelRun'
const MODELS = manifest.models

export function isModelProfile(value: unknown): value is ModelProfile {
  return value === 'lite' || value === 'full'
}

export function modelProfile(value: unknown): ModelProfile {
  return isModelProfile(value) ? value : DEFAULT_MODEL_PROFILE
}

function storedModelProfile(value: unknown): ModelProfile | null {
  // Pre-profile preferences and runs were the existing Full model. Any other
  // unknown value is invalid rather than permission to use a default model.
  return value === undefined ? DEFAULT_MODEL_PROFILE : isModelProfile(value) ? value : null
}

export function modelDefinition(model: ModelProfile) {
  return MODELS[model]
}

export function modelId(model: ModelProfile): string {
  return modelDefinition(model).modelId
}

export function modelRevision(model: ModelProfile): string {
  return modelDefinition(model).revision
}

export const modelDownloadBytes = (model: ModelProfile, device: ModelDevice): number =>
  Object.values(modelDefinition(model).files[device]).reduce((sum, bytes) => sum + bytes, 0)
export const formatGB = (bytes: number): string => `${(bytes / 1e9).toFixed(1)} GB`
export const modelFiles = (model: ModelProfile, device: ModelDevice): Record<string, number> => modelDefinition(model).files[device]

export function hasModelConsent(preference: ModelPreference): boolean {
  const model = storedModelProfile(preference.model)
  return !!model && preference.choice === 'enabled' && preference.revision === modelRevision(model) &&
    (preference.device === 'webgpu' || preference.device === 'wasm')
}

export async function getModelPreference(): Promise<ModelPreference> {
  const stored = (await chrome.storage.local.get(MODEL_PREFERENCE_KEY))[MODEL_PREFERENCE_KEY] as ModelPreference | undefined
  if (!stored || (stored.choice === 'enabled' && !hasModelConsent(stored))) return { choice: 'pending' }
  // Preferences written before profiles existed refer to the existing Full model.
  return stored.choice === 'enabled' ? { ...stored, model: storedModelProfile(stored.model)! } : stored
}

export async function getAuthorizedModelRun(): Promise<ModelRun | null> {
  const preference = await getModelPreference()
  const run = (await chrome.storage.session.get(MODEL_RUN_KEY))[MODEL_RUN_KEY] as ModelRun | undefined
  const selected = storedModelProfile(preference.model)
  const active = run && storedModelProfile(run.model)
  if (!run || !selected || !active || !hasModelConsent(preference) || active !== selected ||
    run.revision !== preference.revision || run.device !== preference.device) return null
  return { ...run, model: active }
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
  constructor(private model: ModelProfile, private device: ModelDevice) {}
  update(file: string, loaded: number, done = false) {
    const files = modelFiles(this.model, this.device)
    const key = Object.keys(files).find(path => path === file || path.endsWith(`/${file}`))
    if (key) this.loaded.set(key, done ? files[key]! : Math.max(this.loaded.get(key) ?? 0, Math.min(files[key]!, loaded)))
    const loadedBytes = [...this.loaded.values()].reduce((sum, n) => sum + n, 0)
    const totalBytes = modelDownloadBytes(this.model, this.device)
    return { loadedBytes, totalBytes, progress: loadedBytes / totalBytes }
  }
}
