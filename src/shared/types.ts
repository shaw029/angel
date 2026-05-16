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

export type ManipulationMechanic =
  | 'urgency_amplification'
  | 'engagement_loop'
  | 'commitment_escalation'
  | 'social_momentum'
  | 'variable_reward'
  | 'attention_capture'
  | 'decision_pressure'

export interface InferenceInput {
  event_type:      EventType
  signals:         SignalLabel[]
  session_context: SessionContext
  memory?:         MemorySummary
  intensity?:      InterventionStyle    // resolved from memory by background before inference
  recentPhrases?:  string[]             // recent nudge text for variety enforcement
  cognitiveState?: CognitiveStateEstimate
  drift?:          DriftEstimate
  interpretation?: { explanation: string; mechanic: ManipulationMechanic | null }
}

export interface InferenceOutput {
  decision_state:       DecisionState
  confidence:           number          // 0–1, normalized
  intervention_style:   InterventionStyle
  intervention_message: string
  suggested_action:     SuggestedAction
}

export interface Intervention {
  id:          string
  message:     string
  tone:        InterventionStyle
  action:      SuggestedAction
  confidence:  number                          // 0–1 from InferenceOutput
  tier:        Exclude<InterventionTier, 'none'>  // resolved by background gate
  observation?: string                         // mechanic + cognitive note, shown in FullCard
  mechanic?:   ManipulationMechanic | null
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

  // User preference: how actively Angel offers reflective support (0–1, default 0.45)
  presenceLevel: number

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

  // Profile-derived — present once enough observations have accumulated
  optimal_style?:     InterventionStyle  // empirically best tone for this user
  vulnerable_now?:    boolean            // current hour matches established vulnerability window
  tolerance_level?:   number             // 0-1: persistent fatigue (1 = fully tolerant)
  escalates_fast?:    boolean            // typically enters compulsive state within 10 min
  recovery_minutes?:  number             // avg minutes to leave compulsive_loop (EMA)
}

// ─── Cognitive drift tracking ────────────────────────────────────────────────

export type DriftDirection =
  | 'escalating'    // health scores worsening over the window
  | 'recovering'    // health scores improving
  | 'stable'        // no meaningful directional change
  | 'fluctuating'   // alternating escalation and recovery

export type DriftTrajectory =
  | 'gradual_escalation'       // slow multi-step drift toward compulsive states
  | 'rapid_escalation'         // fast drop into compulsive/reactive
  | 'recovery_in_progress'     // trending back toward intentional browsing
  | 'urgency_spiral'           // emotionally_reactive escalation pattern
  | 'attention_fragmentation'  // fragmented_attention becoming dominant
  | 'decision_overload'        // decision_fatigue persisting under pressure

export interface DriftEstimate {
  direction:   DriftDirection
  confidence:  number             // 0–1: strength of the directional signal
  depth:       number             // 0–1: health score of current state (higher = worse)
  velocity:    number             // health-score change per minute (positive = worsening)
  windowMs:    number             // ms of transition history analyzed
  trajectory:  DriftTrajectory | null
  escalatingTransitions: number   // worsening transitions in window
  recoveringTransitions: number   // improving transitions in window
}

// ─── Cognitive state estimation ──────────────────────────────────────────────
// Inferred by background CognitiveStateEngine from rolling behavioral context.

export type CognitiveState =
  | 'intentional_browsing'    // purposeful, goal-directed, reading
  | 'exploratory_browsing'    // curious, moving between tabs/topics
  | 'passive_consumption'     // drifting, low engagement, time passing
  | 'compulsive_loop'         // doom-scroll / interaction loop, can't stop
  | 'emotionally_reactive'    // triggered by urgency / purchase pressure
  | 'fragmented_attention'    // unable to settle, rapid switching
  | 'decision_fatigue'        // overwhelmed by choices, extended purchase context

export interface CognitiveStateTransition {
  from: CognitiveState
  to:   CognitiveState
  at:   number  // epoch ms
}

export interface CognitiveStateEstimate {
  state:      CognitiveState
  confidence: number                                    // 0–1
  scores:     Partial<Record<CognitiveState, number>>  // all scores for explainability
  transition: CognitiveStateTransition | null           // populated if state changed this cycle
  durationMs: number                                    // ms in current state
}

// ─── Evaluation framework ────────────────────────────────────────────────────
// All metrics are local-only, aggregated, and privacy-preserving.
// No URLs, content, or raw event streams — only derived behavioral statistics.

export type TrendDirection =
  | 'improving'          // metric is trending better over last 2 weekly periods
  | 'stable'             // metric is roughly flat
  | 'needs_attention'    // metric trending worse — not alarming, just informational
  | 'insufficient_data'  // fewer than 2 comparable periods

export interface WeeklyTrendSnapshot {
  week:                  string   // ISO 8601: '2025-W18'
  compulsiveEntries:     number   // transitions into compulsive_loop
  reactiveEntries:       number   // transitions into emotionally_reactive
  recoveryTransitions:   number   // exiting compulsive/reactive → healthier state
  postNudgeRecoveries:   number   // subset: recovery within 15 min of a nudge
  reflectiveEngagements: number   // accepted interventions with dwell ≥ 8 s
  interventionsShown:    number
}

export interface EvaluationMetrics {
  // ── Raw availability ──
  weeksActive:        number
  totalInterventions: number
  acceptanceRate:     number   // 0–1, always available

  // ── Engagement quality ──────────────────────────────────────────────────
  // % accepted interventions where dwell ≥ 8 s (genuine read + reflection)
  reflectiveEngagementRate: number | null

  // ── Loop interruption ────────────────────────────────────────────────────
  // % compulsive-state interventions followed by recovery within 15 min
  postNudgeRecoveryRate: number | null

  // ── Recovery speed (EMA) — lower = faster, better ───────────────────────
  recoveryDurationMinutes: number | null

  // ── Escalation awareness (EMA) — higher = catching loops earlier, better ─
  escalationDepthMinutes: number | null

  // ── Persistent engagement health ─────────────────────────────────────────
  // 1.0 = never fatigued; drops on quick-dismiss bursts
  toleranceLevel: number

  // ── Computed trend directions (for UI and demo) ───────────────────────────
  recoveryTrend:   TrendDirection   // based on recovery_transitions weekly delta
  engagementTrend: TrendDirection   // based on reflective_engagements weekly delta

  // True if escalationDepthMinutes EMA is trending upward (later in session)
  awarenessBuilding: boolean

  // ── Longitudinal data (last 8 weeks, oldest first) ────────────────────────
  weeklyTrends: WeeklyTrendSnapshot[]
}

export interface CompressedContext {
  event_type:      EventType
  signals:         SignalLabel[]
  session_context: SessionContext
  page_context:    PageContext
  memory?:         MemorySummary      // injected by background when available
  intensity?:      InterventionStyle  // resolved from memory by background
  recentPhrases?:  string[]           // last N nudge phrases for variety enforcement
  cognitiveState?: CognitiveStateEstimate
  drift?:          DriftEstimate
}
