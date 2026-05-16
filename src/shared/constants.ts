export const HEURISTIC = {
  IDLE_THRESHOLD_S: 60,           // was 120 — 1 min passive reading/watching is enough signal
  TAB_SWITCH_THRESHOLD: 8,
  MIN_PAGE_TIME_S: 30,
  EXCESSIVE_SCROLL_DEPTH: 0.6,
  EXCESSIVE_SCROLL_MAX_TIME_S: 300,
} as const

export const COOLDOWN_DEFAULT_MINUTES = 20

// Update this path after first build if dist layout differs
export const OFFSCREEN_URL = 'src/offscreen/index.html'

export const SIGNAL_INTERVAL_MS = 30_000

// ─── AI runtime ──────────────────────────────────────────────────────────────
export const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX'
export const MODEL_DTYPE_WEBGPU  = 'q4f16' as const  // 4-bit weights, fp16 activations
export const MODEL_DTYPE_WASM    = 'q4'    as const  // 4-bit weights, no fp16 in WASM

export const PRESENCE_DEFAULT = 0.45

export const MSG = {
  BROWSING_SIGNAL:  'BROWSING_SIGNAL',
  BEHAVIORAL_EVENTS:'BEHAVIORAL_EVENTS',
  AI_CONTEXT:       'AI_CONTEXT',
  INTERVENTION:     'INTERVENTION',
  DISMISSED:        'DISMISSED',
  GET_STATE:        'GET_STATE',
  SET_ENABLED:      'SET_ENABLED',
  SET_PRESENCE:     'SET_PRESENCE',
  MODEL_PROGRESS:   'MODEL_PROGRESS',
  KEEPALIVE:        'KEEPALIVE',
} as const

// ─── Intervention gating ──────────────────────────────────────────────────────

export const GATE = {
  // Minimum gap between full companion cards (scaled by suppressionMultiplier)
  FULL_COOLDOWN_MS:    20 * 60 * 1000,

  // Minimum gap between any intervention of any tier
  SUBTLE_COOLDOWN_MS:  5 * 60 * 1000,

  // Dismissals faster than this are counted as "quick" (user wasn't engaged)
  QUICK_DISMISS_MS:    3_000,

  // Rolling window for measuring dismissal patterns
  DISMISSAL_WINDOW_MS: 2 * 60 * 60 * 1000,

  // Ordered high-to-low: first matching quickRatio wins
  MULTIPLIER_LEVELS: [
    { quickRatio: 0.8, multiplier: 5.0 },  // almost all quick → 5× cooldown
    { quickRatio: 0.6, multiplier: 2.5 },  // majority quick  → 2.5× cooldown
    { quickRatio: 0.4, multiplier: 1.5 },  // some quick      → 1.5× cooldown
  ] as const,
} as const
