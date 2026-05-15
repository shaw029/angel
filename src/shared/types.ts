export type Timestamp = number

export interface BrowsingSignal {
  url: string
  domain: string
  timestamp: Timestamp
  timeOnPage: number    // seconds on current page
  scrollDepth: number   // 0–1, max reached
  idleTime: number      // seconds since last interaction
  switchCount: number   // tab focus events in last window
}

export interface HeuristicResult {
  flagged: boolean
  confidence: number          // 0–1
  reasons: HeuristicReason[]
  signal: BrowsingSignal
}

export type HeuristicReason =
  | 'extended-idle'
  | 'rapid-tab-switching'
  | 'excessive-scroll'

export type DecisionState      = 'intervene' | 'observe' | 'skip'
export type InterventionStyle  = 'gentle' | 'curious' | 'reflective'
export type SuggestedAction    = 'take_a_break' | 'review_cart' | 'set_a_timer' | 'close_tab' | 'none'

// 'full'   → confidence ≥ 0.8, full companion card
// 'subtle' → 0.5 ≤ confidence < 0.8 (or full downgraded by cooldown), compact pill
// 'none'   → gated out, nothing shown
export type InterventionTier   = 'full' | 'subtle' | 'none'

export interface DismissalRecord {
  timestamp: Timestamp
  dwellMs:   number  // ms the nudge was visible before the user dismissed it
}

export interface InferenceInput {
  event_type:      EventType
  signals:         SignalLabel[]
  session_context: SessionContext
  memory?:         MemorySummary
  intensity?:      InterventionStyle  // resolved from memory by background before inference
  recentPhrases?:  string[]           // recent nudge text for variety enforcement
}

export interface InferenceOutput {
  decision_state:       DecisionState
  confidence:           number          // 0–1, normalized
  intervention_style:   InterventionStyle
  intervention_message: string
  suggested_action:     SuggestedAction
}

export interface Intervention {
  id:         string
  message:    string
  tone:       InterventionStyle
  action:     SuggestedAction
  confidence: number                          // 0–1 from InferenceOutput
  tier:       Exclude<InterventionTier, 'none'>  // resolved by background gate
}

export interface StorageState {
  enabled:           boolean
  interventionCount: number
  lastIntervention:  Timestamp | null
  cooldownMinutes:   number

  // ─── Gating state ───────────────────────────────────────────────────────
  lastFullIntervention:   Timestamp | null   // for full-card cooldown
  lastSubtleIntervention: Timestamp | null   // for subtle-pill cooldown
  recentDismissals:       DismissalRecord[]  // ring buffer (last 20) for adaptive suppression
  suppressionMultiplier:  number             // 1.0 baseline — raised by quick dismissals

  // Injected by background at query time — not persisted to chrome.storage
  modelStatus?: ModelLoadStatus
}

// ─── AI runtime status (offscreen → background → popup) ──────────────────────

export type ModelLoadStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'downloading'; progress: number; file: string }
  | { phase: 'loading'; file: string; filesLoaded: number }
  | { phase: 'ready'; device: 'webgpu' | 'wasm' }
  | { phase: 'error'; reason: string }

// ─── Behavioral events (content script → background) ─────────────────────────

export type DetectorId =
  | 'countdown-timer'
  | 'autoplay-video'
  | 'infinite-scroll'
  | 'recurring-billing'
  | 'urgency-language'

export type TrackerId =
  | 'session-duration'
  | 'scroll-continuity'
  | 'interaction-loop'

export interface DetectionResult {
  detector: DetectorId
  found: boolean
  confidence: number           // 0–1
  count: number                // distinct instances; no DOM refs stored
  categories?: readonly number[] // sub-pattern indices that fired (detector-specific)
}

export interface TrackingResult {
  tracker: TrackerId
  value: number
  unit: 'seconds' | 'px-per-second' | 'count'
}

export type BehavioralEvent =
  | { id: string; timestamp: Timestamp; domain: string; kind: 'detection'; data: DetectionResult }
  | { id: string; timestamp: Timestamp; domain: string; kind: 'tracking'; data: TrackingResult }

// ─── Compression pipeline output (background → offscreen → Gemma) ────────────
// All fields are categorical/numeric — no raw text, no URLs, no identifiers.

export type EventType =
  | 'checkout_pressure'    // countdown + urgency + price pressure
  | 'subscription_funnel'  // recurring billing emphasis
  | 'engagement_hook'      // autoplay + infinite scroll mechanics
  | 'attention_capture'    // urgency language without clear checkout context
  | 'passive_consumption'  // extended low-engagement session
  | 'distracted_browsing'  // rapid switching or interaction loops
  | 'ambient'              // nothing notable detected

export type SignalLabel =
  | 'countdown_timer'
  | 'limited_stock'
  | 'social_proof_live'
  | 'trial_language'
  | 'urgency_language'
  | 'autoplay_media'
  | 'infinite_feed'
  | 'recurring_billing'
  | 'session_long'
  | 'doom_scrolling'
  | 'rapid_interaction'

export type DomainCategory =
  | 'ecommerce'
  | 'social'
  | 'news'
  | 'streaming'
  | 'productivity'
  | 'finance'
  | 'other'

export type ScrollDepth  = 'shallow' | 'medium' | 'deep'
export type TimeBucket   = 'brief' | 'moderate' | 'extended' | 'long'
export type TabActivity  = 'focused' | 'moderate' | 'restless'

export interface SessionContext {
  minutes_active: number
  doom_scrolling: boolean
  rapid_clicking: boolean
  tab_activity: TabActivity
}

export interface PageContext {
  category: DomainCategory
  scroll_depth: ScrollDepth
  duration: TimeBucket
}

// ─── Memory summary (background → offscreen → inference prompt) ───────────────
// All fields are aggregated counts or ratios — no raw events, no identifiers.

export interface MemorySummary {
  dominant_pattern:  string | null  // highest-count behavioral PatternKey, or null
  acceptance_rate:   number         // interventions_accepted / interventions_shown (0–1)
  weeks_active:      number         // how many distinct ISO weeks have been recorded
}

export interface CompressedContext {
  event_type:      EventType
  signals:         SignalLabel[]
  session_context: SessionContext
  page_context:    PageContext
  memory?:         MemorySummary    // injected by background when available
  intensity?:      InterventionStyle  // resolved from memory by background
  recentPhrases?:  string[]           // last N nudge phrases for variety enforcement
}
