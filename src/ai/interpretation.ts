import type {
  CompressedContext,
  CognitiveState,
  ManipulationMechanic,
} from '@shared/types'
import { isTooSimilar } from './guidance'

// ─── Mechanic classification ──────────────────────────────────────────────────
// Maps existing detector signals and event types to a named behavioral mechanic.
// Returns null when no mechanic is clearly identifiable.

export function classifyMechanic(ctx: CompressedContext): ManipulationMechanic | null {
  const s  = new Set(ctx.signals)
  const et = ctx.event_type

  // Most specific patterns first (compound signals take priority)
  if (
    (s.has('countdown_timer') || s.has('limited_stock')) &&
    (s.has('urgency_language') || s.has('social_proof_live'))
  ) return 'decision_pressure'

  if (s.has('social_proof_live'))                           return 'social_momentum'
  if (et === 'checkout_pressure')                           return 'urgency_amplification'
  if (et === 'subscription_funnel')                         return 'commitment_escalation'
  if (s.has('autoplay_media') && s.has('infinite_feed'))    return 'variable_reward'
  if (s.has('infinite_feed')  || s.has('doom_scrolling'))   return 'engagement_loop'
  if (s.has('autoplay_media'))                              return 'engagement_loop'
  if (et === 'engagement_hook')                             return 'engagement_loop'
  if (s.has('urgency_language') || s.has('countdown_timer')) return 'attention_capture'

  return null
}

// ─── Template library ─────────────────────────────────────────────────────────
// 5 variants per mechanic. All phrases must pass the tone guard.
// Ordered from most contextual to most general — selection rotates deterministically.

const MECHANIC_TEMPLATES: Record<ManipulationMechanic, readonly string[]> = {
  urgency_amplification: [
    'This page repeatedly emphasizes a sense of time pressure.',
    'Urgency signals appear with regularity across this page.',
    'This page is designed to make time feel more limited than it may be.',
    'Multiple elements here emphasize the cost of waiting.',
    'The framing on this page tends to compress decision-making time.',
  ],

  engagement_loop: [
    'This feed is designed to continue without a natural stopping point.',
    'Content here appears structured to extend the session gradually.',
    'There is no designed end to this type of feed — it continues as long as you scroll.',
    'This format removes the natural moments where a session would ordinarily pause.',
    'The content delivery here makes it easy to lose track of time.',
  ],

  commitment_escalation: [
    'This interaction is building toward a longer-term commitment.',
    'The flow here is designed to make a recurring arrangement feel natural.',
    'Patterns like this are often built so the ongoing nature is easy to overlook at first.',
    'What begins as a trial here typically transitions into a recurring relationship.',
    'This page is oriented toward establishing an ongoing arrangement.',
  ],

  social_momentum: [
    'Live activity here creates a sense of shared momentum.',
    'Real-time signals on this page can make waiting feel conspicuous.',
    'Seeing others engage in real time can subtly increase the sense of pressure.',
    'Social presence indicators like these can change how a decision feels.',
    'This page uses the visible activity of others to create a sense of movement.',
  ],

  variable_reward: [
    'Content variety in feeds like this can make it harder to find a natural stopping point.',
    'The unpredictability of what comes next is part of what keeps this type of feed engaging.',
    'Feeds built on varied content keep anticipation active in a way that regular content does not.',
    'The mix of content types here is calibrated to maintain interest across the session.',
    'This format is designed so the next item always feels worth checking.',
  ],

  attention_capture: [
    'This page uses several attention-directing patterns simultaneously.',
    'Multiple elements here appear designed to hold focus.',
    'The layout and language here work together to maintain engagement.',
    'Attention on this page is being actively shaped by its design.',
    'Several elements here combine to create a particular kind of pull.',
  ],

  decision_pressure: [
    'Multiple signals here appear designed to compress decision-making time.',
    'This page combines time pressure with scarcity signals.',
    'The combination of urgency and limited availability here is a common way decisions get accelerated.',
    'Decisions made under this kind of combined pressure often feel more final than they are.',
    'Time limits and scarcity cues here work together to create a sense of urgency.',
  ],
}

// ─── Cognitive state notes ────────────────────────────────────────────────────
// Added to the UI observation (not the prompt line) when a relevant state is active.
// These connect the page mechanic to the user's present experience — lightly, not clinically.

const COGNITIVE_NOTES: Partial<Record<CognitiveState, string>> = {
  compulsive_loop:      'In this moment, disengaging may feel harder than usual.',
  emotionally_reactive: 'Right now, decisions may feel more pressing than they actually are.',
  fragmented_attention: 'The rapid pace of this session may make it harder to find a pause.',
  decision_fatigue:     'After extended browsing, choices can feel heavier than they need to.',
  passive_consumption:  'Passive browsing can make time feel different than it is.',
}

// ─── Tone guard ───────────────────────────────────────────────────────────────
// Ensures no template phrase contains language that is moralizing, clinical, or alarmist.
// All built-in templates pass this guard — it exists as a safety net for future additions.

const FORBIDDEN: readonly string[] = [
  'manipulat',      // manipulation, manipulative, manipulated
  'addict',         // addicted, addictive, addiction
  'dangerous',
  'harmful',
  'you are being',
  'you should',
  "you shouldn't",
  'warning',
  'this is wrong',
  'this is bad',
  'toxic',
  'predatory',
  'exploit',
]

export function passesToneGuard(phrase: string): boolean {
  const lower = phrase.toLowerCase()
  return !FORBIDDEN.some(p => lower.includes(p))
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface InterpretationResult {
  mechanic:    ManipulationMechanic | null

  // One sentence. Used in the [mechanic] prompt line only.
  // Describes the page mechanic without cognitive context.
  explanation: string

  // One or two sentences. Used in the FullCard observation UI.
  // May append a cognitive note when state is relevant.
  observation: string
}

// ─── Generation ───────────────────────────────────────────────────────────────

/**
 * Classifies the active manipulation mechanic and selects a calm, observational
 * explanation. Rotates through templates deterministically to avoid repetition —
 * different across sessions, stable within one.
 *
 * Returns empty strings when no mechanic is identifiable.
 */
export function generateInterpretation(
  ctx:           CompressedContext,
  recentPhrases: string[] = [],
): InterpretationResult {
  const mechanic = classifyMechanic(ctx)

  if (!mechanic) {
    return { mechanic: null, explanation: '', observation: '' }
  }

  const templates = MECHANIC_TEMPLATES[mechanic]

  // Prefer templates not recently seen; fall back to full pool if all were used
  const eligible  = templates.filter(t => passesToneGuard(t) && !isTooSimilar(t, recentPhrases))
  const pool      = eligible.length > 0 ? eligible : [...templates]

  // Rotate deterministically: hour-of-day + phrase cache size → stable within session,
  // different across sessions without randomness
  const slot        = (new Date().getHours() + recentPhrases.length) % pool.length
  const explanation = pool[slot]!

  // Cognitive note — only when state adds meaningful context to this mechanic
  const cogState     = ctx.cognitiveState?.state
  const cogNote      = (cogState && passesToneGuard(COGNITIVE_NOTES[cogState] ?? ''))
    ? (COGNITIVE_NOTES[cogState] ?? null)
    : null

  const observation = cogNote
    ? `${explanation} ${cogNote}`
    : explanation

  return { mechanic, explanation, observation }
}
