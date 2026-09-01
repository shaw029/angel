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

function area(values: Record<string, unknown>) {
  return {
    get(key: string | string[] | null, cb?: (r: Record<string, unknown>) => void) {
      const out: Record<string, unknown> = {}
      const keys = key == null ? Object.keys(values) : Array.isArray(key) ? key : [key]
      for (const k of keys) if (k in values) out[k] = values[k]
      cb?.(out)
      return Promise.resolve(out)
    },
    set(items: Record<string, unknown>, cb?: () => void) {
      Object.assign(values, items); cb?.(); return Promise.resolve()
    },
    onChanged: noopEvent,
  }
}

;(globalThis as Record<string, unknown>).chrome = {
  storage: {
    local:   area({ state: STATE }),
    session: area({ modelStatus: { phase: 'ready', device: 'webgpu' } }),
  },
  runtime: {
    onMessage: noopEvent,
    sendMessage() { return Promise.resolve() },
    getURL: (p: string) => p,
  },
}
