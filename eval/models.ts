import manifest from '@shared/model-manifest.json'
import type { ModelDevice } from '@shared/types'
import candidates from './candidates.json'

export interface EvalModel {
  label: string
  description?: string
  modelId: string
  revision: string
  files: Record<ModelDevice, Record<string, number>>
}

// 'full' is always the model the extension ships. Candidates are pinned in
// candidates.json so trying a model never requires changing the extension.
export const PRODUCTION = 'full'
export const MODELS: Record<string, EvalModel> = {
  [PRODUCTION]: { label: 'Full', modelId: manifest.modelId, revision: manifest.revision, files: manifest.files },
  ...candidates,
}

export const downloadBytes = (model: EvalModel, device: ModelDevice): number =>
  Object.values(model.files[device]).reduce((sum, bytes) => sum + bytes, 0)
