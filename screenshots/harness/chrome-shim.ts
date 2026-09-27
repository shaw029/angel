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
    async sendMessage(message: { type: string; payload?: { action?: string; intent?: string } }) {
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
