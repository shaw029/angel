import { useEffect, useState } from 'react'
import type { StorageState, ModelLoadStatus } from '@shared/types'
import { MSG, COOLDOWN_DEFAULT_MINUTES } from '@shared/constants'

const STATE_DEFAULTS: Omit<StorageState, 'modelStatus'> = {
  enabled:                true,
  interventionCount:      0,
  lastIntervention:       null,
  cooldownMinutes:        COOLDOWN_DEFAULT_MINUTES,
  lastFullIntervention:   null,
  lastSubtleIntervention: null,
  recentDismissals:       [],
  suppressionMultiplier:  1.0,
}

function friendlyFileName(file: string): string {
  if (!file) return ''
  if (file.includes('decoder') || file.includes('model_merged') || file.endsWith('.onnx')) {
    return 'loading model weights (large file, may take a few minutes)…'
  }
  if (file.includes('tokenizer')) return 'loading tokenizer…'
  if (file.includes('config'))    return 'loading config…'
  const base = file.split('/').pop() ?? file
  return base.length > 40 ? base.slice(0, 40) + '…' : base
}

function ModelStatusBadge({ status }: { status: ModelLoadStatus }) {
  if (status.phase === 'idle' || status.phase === 'checking') return null

  if (status.phase === 'downloading') {
    const pct = Math.round(status.progress * 100)
    return (
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-muted">Downloading model…</span>
          <span className="text-xs text-ink-muted">{pct}%</span>
        </div>
        <div className="h-1 w-full rounded-full bg-neutral-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-sage transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-ink-muted truncate">{status.file}</p>
      </div>
    )
  }

  if (status.phase === 'loading') {
    const label = friendlyFileName(status.file)
    return (
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-muted">Downloading model…</span>
          {(status.filesLoaded ?? 0) > 0 && (
            <span className="text-xs text-ink-muted">{status.filesLoaded} files</span>
          )}
        </div>
        <div className="h-1 w-full rounded-full bg-neutral-200 overflow-hidden relative">
          <div className="absolute h-full w-1/3 rounded-full bg-sage animate-slide" />
        </div>
        {label && (
          <p className="mt-1 text-[10px] text-ink-muted truncate">{label}</p>
        )}
      </div>
    )
  }

  if (status.phase === 'ready') {
    return (
      <div className="mt-3 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-sage" />
        <span className="text-xs text-ink-muted">
          AI ready · {status.device === 'webgpu' ? 'GPU' : 'CPU'}
        </span>
      </div>
    )
  }

  if (status.phase === 'error') {
    return (
      <div className="mt-3">
        <span className="text-xs text-amber-500">Model unavailable — nudges paused</span>
        {status.reason && (
          <p className="mt-1 text-[10px] text-amber-400 break-all">{status.reason}</p>
        )}
      </div>
    )
  }

  return null
}

export function App() {
  const [state,       setState      ] = useState<Omit<StorageState, 'modelStatus'> | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelLoadStatus>({ phase: 'idle' })

  // Read state directly from storage — no service worker round-trip needed
  useEffect(() => {
    chrome.storage.local.get('state', (result) => {
      setState({ ...STATE_DEFAULTS, ...(result.state ?? {}) })
    })
    chrome.storage.session.get('modelStatus', (result) => {
      if (result.modelStatus) setModelStatus(result.modelStatus as ModelLoadStatus)
    })
  }, [])

  // Live model progress — two sources so we never miss an update:
  // 1. Direct runtime messages (popup is open when event fires)
  // 2. Storage changes (popup opened after event fired, reads latest from session)
  useEffect(() => {
    function onMessage(message: { type: string; payload?: unknown }) {
      if (message.type === MSG.MODEL_PROGRESS) {
        setModelStatus(message.payload as ModelLoadStatus)
      }
    }
    function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>) {
      if (changes.modelStatus?.newValue) {
        setModelStatus(changes.modelStatus.newValue as ModelLoadStatus)
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    chrome.storage.session.onChanged.addListener(onStorageChanged)
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      chrome.storage.session.onChanged.removeListener(onStorageChanged)
    }
  }, [])

  async function toggle() {
    if (!state) return
    const next = !state.enabled
    setState((s) => (s ? { ...s, enabled: next } : s))
    // Write directly to storage and notify background (for any in-flight logic)
    const current = await new Promise<Record<string, unknown>>(
      (resolve) => chrome.storage.local.get('state', resolve)
    )
    chrome.storage.local.set({ state: { ...STATE_DEFAULTS, ...(current.state as object), enabled: next } })
    chrome.runtime.sendMessage({ type: MSG.SET_ENABLED, payload: next })
  }

  if (!state) {
    return (
      <div className="w-60 p-4 flex items-center justify-center bg-surface">
        <div className="h-4 w-4 rounded-full border-2 border-sage border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="w-60 p-5 bg-surface font-sans">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-primary">Cognitive Assistant</span>
        <button
          onClick={toggle}
          role="switch"
          aria-checked={state.enabled}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
            state.enabled ? 'bg-sage' : 'bg-neutral-200'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              state.enabled ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        {state.enabled
          ? 'Quietly watching for moments worth pausing on.'
          : 'Paused — no nudges will appear.'}
      </p>

      {state.interventionCount > 0 && (
        <p className="mt-3 text-xs text-ink-secondary">
          {state.interventionCount} nudge{state.interventionCount !== 1 ? 's' : ''} offered
        </p>
      )}

      <ModelStatusBadge status={modelStatus} />
    </div>
  )
}
