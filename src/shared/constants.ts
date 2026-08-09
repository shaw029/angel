export const HEURISTIC = {
  IDLE_THRESHOLD_S: 60,           // was 120 — 1 min passive reading/watching is enough signal
  TAB_SWITCH_THRESHOLD: 8,        // within the rolling 10-minute window (see SWITCH_WINDOW_MS)
  MIN_PAGE_TIME_S: 30,
  EXCESSIVE_SCROLL_DEPTH: 0.6,
  EXCESSIVE_SCROLL_MAX_TIME_S: 300,
  MEDIA_SESSION_THRESHOLD_S: 1800, // 30+ min of continuous media — worth the Narrator's attention
} as const

// Rolling window for tab-switch counting — prevents long-lived tabs from
// permanently saturating the 'rapid-tab-switching' heuristic.
export const SWITCH_WINDOW_MS = 10 * 60 * 1000

// ─── Narrator cadence ─────────────────────────────────────────────────────────
// The Narrator (on-device Gemma) is consulted sparingly: judgments are cached
// per tab and an 'aligned' verdict buys a long quiet period.

export const NARRATOR = {
  MIN_INTERVAL_MS:    90_000,        // never consult more than once per 90 s per tab
  ALIGNED_BACKOFF_MS: 8 * 60_000,    // confident 'aligned' verdict suppresses re-judging
  ALIGNED_CONFIDENCE: 0.65,          // confidence needed for the aligned backoff
  TITLE_TRAIL:        4,             // previous page titles kept as topic-drift evidence
} as const

export const COOLDOWN_DEFAULT_MINUTES = 20

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
  JUDGMENT:         'JUDGMENT',      // offscreen → background: alignment judgment (+ optional nudge)
  INTERVENTION:     'INTERVENTION',  // background → content: deliver a nudge
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

  // ── Guardian hard limits — no adaptive multiplier can breach these ─────────
  // Absolute floor between any two nudges, regardless of state or presence
  MIN_GAP_MS:          150_000,      // 2.5 min

  // Maximum nudges delivered in any rolling hour
  HOURLY_BUDGET:       5,

  // Bounds on the combined adaptive cooldown multiplier. The old pipeline
  // multiplied six unbounded factors; stacked worst cases collapsed cooldowns
  // to ~30 s. All adaptive scaling is now clamped to this range.
  MULTIPLIER_MIN:      0.5,
  MULTIPLIER_MAX:      6.0,

  // Dismissals faster than this are counted as "quick" (user wasn't engaged)
  QUICK_DISMISS_MS:    3_000,

  // Rolling window for measuring dismissal patterns
  DISMISSAL_WINDOW_MS: 2 * 60 * 60 * 1000,

  // Ordered high-to-low: first matching quickRatio wins.
  // The ratio is outcome-weighted: quick-dismiss = 1, ignored = 0.5, rejected = 1.5.
  MULTIPLIER_LEVELS: [
    { quickRatio: 0.8, multiplier: 5.0 },  // almost all negative → 5× cooldown
    { quickRatio: 0.6, multiplier: 2.5 },  // majority negative  → 2.5× cooldown
    { quickRatio: 0.4, multiplier: 1.5 },  // some negative      → 1.5× cooldown
  ] as const,
} as const

// ─── Deferral ("remind me later") ─────────────────────────────────────────────
// A snooze is user-requested, so re-delivery bypasses the Guardian's veto (see
// snooze.ts). These bounds are what keeps that bypass from becoming a loophole.

export const SNOOZE = {
  // How long "Remind me later" defers the nudge
  DELAY_MS:     5 * 60 * 1000,

  // Deferrals allowed per nudge. Past this the button stops rendering, so an
  // intervention always resolves into a real signal instead of deferring forever.
  MAX:          2,

  // The alarm fired but a nudge was already on screen — retry once after this
  // long rather than dropping the reminder the user explicitly asked for.
  RETRY_MS:     60 * 1000,

  // Give up re-arming after this many collisions with an occupied nudge slot.
  MAX_RETRIES:  3,
} as const
