import { MODEL_REVISION, modelDownloadBytes } from '../../src/shared/model-plan'
import type { ModelDevice } from '../../src/shared/types'
import type { CompanionSession } from '../../src/shared/types'

const companion: CompanionSession = {
  episodeId: 'preview', origin: 'https://shop.example', contextKey: 'preview:0',
  revision: 0, lastSeenAt: Date.now(), intent: null, quiet: false, evidenceSignature: '',
  lastExplanation: 'Limited-stock language was detected on this page. That does not tell me your intent.',
}

/**
 * Minimal chrome.* shim so the real popup component can render outside the
 * extension. Only the surface App.tsx touches is implemented.
 */
const STATE = {
  enabled:                true,
  interventionCount:      41,
  lastIntervention:       Date.now() - 1000 * 60 * 22,
  cooldownMinutes:        20,
  lastFullIntervention:   Date.now() - 1000 * 60 * 22,
  lastSubtleIntervention: Date.now() - 1000 * 60 * 8,
  recentDismissals:       [],
  suppressionMultiplier:  1.0,
  recentNudges:           [],
  presenceLevel:          0.45,
}

const noopEvent = { addListener() {}, removeListener() {} }
const setupPreview = new URLSearchParams(location.search).has('setup')
if (setupPreview) STATE.interventionCount = 0
const localValues: Record<string, any> = { state: STATE, modelPreference: setupPreview
  ? { choice: 'pending' } : { choice: 'enabled', device: 'webgpu', revision: MODEL_REVISION } }
const sessionValues: Record<string, any> = { modelStatus: setupPreview ? { phase: 'idle' } : { phase: 'ready', device: 'webgpu' } }
let previewTimer: ReturnType<typeof setInterval> | undefined
function previewView() { return { preference: localValues.modelPreference, status: sessionValues.modelStatus } }
function event() {
  const listeners = new Set<(...args: any[]) => void>()
  return { addListener(fn: (...args: any[]) => void) { listeners.add(fn) }, removeListener(fn: (...args: any[]) => void) { listeners.delete(fn) }, emit(changes: any) { listeners.forEach(fn => fn(changes)) } }
}

function area(values: Record<string, unknown>) {
  const onChanged = event()
  return {
    get(key: string | string[] | null, cb?: (r: Record<string, unknown>) => void) {
      const out: Record<string, unknown> = {}
      const keys = key == null ? Object.keys(values) : Array.isArray(key) ? key : [key]
      for (const k of keys) if (k in values) out[k] = values[k]
      cb?.(out)
      return Promise.resolve(out)
    },
    set(items: Record<string, unknown>, cb?: () => void) {
      Object.assign(values, items); onChanged.emit(Object.fromEntries(Object.entries(items).map(([key, newValue]) => [key, { newValue }]))); cb?.(); return Promise.resolve()
    },
    onChanged,
  }
}

;(globalThis as Record<string, unknown>).chrome = {
  storage: {
    local: area(localValues),
    session: area(sessionValues),
  },
  runtime: {
    onMessage: noopEvent,
    async sendMessage(message: { type: string; payload?: { action?: string; intent?: string; device?: ModelDevice } }) {
      if (message.type === 'GET_MODEL_SETUP') return previewView()
      if (message.type === 'SET_MODEL_SETUP') {
        clearInterval(previewTimer)
        if (message.payload?.action === 'enable') {
          const device = message.payload.device ?? 'webgpu'
          await chrome.storage.local.set({ modelPreference: { choice: 'enabled', device, revision: MODEL_REVISION } })
          await chrome.storage.session.set({ modelStatus: { phase: 'checking' } })
          let step = 0
          previewTimer = setInterval(() => {
            step++
            const total = modelDownloadBytes(device)
            void chrome.storage.session.set({ modelStatus: step <= 4
              ? { phase: 'downloading', progress: step / 4, file: 'preview', loadedBytes: total * step / 4, totalBytes: total }
              : step === 5 ? { phase: 'loading', file: 'preview', filesLoaded: 8 } : { phase: 'ready', device } })
            if (step >= 6) clearInterval(previewTimer)
          }, 1000)
        } else {
          await chrome.storage.local.set({ modelPreference: { choice: 'deferred' } })
          await chrome.storage.session.set({ modelStatus: { phase: 'idle' } })
        }
        return previewView()
      }
      if (message.type === 'GET_COMPANION') return { available: true, session: { ...companion } }
      if (message.type === 'COMPANION_ACTION') {
        const p = message.payload
        if (p?.action === 'intent') { companion.intent = p.intent?.trim() || null; companion.quiet = false }
        if (p?.action === 'quiet') companion.quiet = true
        if (p?.action === 'resume') companion.quiet = false
        if (p?.action === 'save') companion.returnPoint = { url: 'https://shop.example/headphones', title: 'Headphone comparison' }
        if (p?.action === 'forget') companion.returnPoint = undefined
        return { available: true, session: { ...companion } }
      }
      return null
    },
    getURL: (p: string) => p,
  },
}
