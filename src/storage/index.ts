import type { StorageState } from '@shared/types'
import { COOLDOWN_DEFAULT_MINUTES, PRESENCE_DEFAULT } from '@shared/constants'

const DEFAULTS: StorageState = {
  enabled:           true,
  interventionCount: 0,
  lastIntervention:  null,
  cooldownMinutes:   COOLDOWN_DEFAULT_MINUTES,

  lastFullIntervention:   null,
  lastSubtleIntervention: null,
  recentDismissals:       [],
  suppressionMultiplier:  1.0,

  presenceLevel: PRESENCE_DEFAULT,
}

export async function getState(): Promise<StorageState> {
  const { state } = await chrome.storage.local.get('state')
  return { ...DEFAULTS, ...(state as Partial<StorageState> | undefined) }
}

export async function patchState(patch: Partial<StorageState>): Promise<void> {
  const current = await getState()
  await chrome.storage.local.set({ state: { ...current, ...patch } })
}
