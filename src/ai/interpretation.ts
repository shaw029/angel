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
  if (et === 'subscription_funnel')                         return 'emotional_escalation'
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
  engagement_loop: [
    'This feed is designed to keep you scrolling.',
    'The next thing is always meant to feel worth checking.',
    'Some feeds are built to make time disappear.',
    'One more scroll is exactly what this feed is designed for.',
    'This kind of feed rarely gives you a natural place to stop.',
  ],

  urgency_amplification: [
    'This page is trying to speed up your decision.',
    'You probably have more time than this countdown suggests.',
    'Some pages are designed to make waiting feel risky.',
    'This offer may feel more urgent than it actually is.',
    'Pressure changes how decisions feel.',
  ],

  emotional_escalation: [
    'Feeds like this can make everything feel more intense.',
    'The more emotional the feed gets, the harder it is to look away.',
    'This kind of feed can make it hard for your mind to settle.',
    'Some feeds become harder to leave the deeper you get into them.',
    'This kind of feed keeps finding new ways to pull you in.',
  ],

  attention_capture: [
    'Several things on this page are competing for your attention at once.',
    'This page is working hard to keep your focus moving.',
    'Pages like this are built to keep your mind busy.',
    'Feeds like this make it easy to stay longer than you planned.',
    'Some pages are designed so your mind never really gets a break.',
  ],

  social_momentum: [
    'Some feeds are designed to keep you coming back to check reactions.',
    'Some platforms are designed to make attention feel personal.',
    'Social metrics can quietly shape how you feel.',
    'This kind of feed makes it hard not to check one more time.',
    'A few likes or comments can quickly start feeling bigger than they are.',
  ],

  variable_reward: [
    'The next thing always feels like it might be worth checking.',
    'The surprise of what comes next is part of what keeps this engaging.',
    'Feeds like this are built around anticipation.',
    'This experience is designed so the next thing always feels interesting.',
    'Feeds like this keep giving your mind something new to chase.',
  ],

  decision_pressure: [
    'This page is trying to make the decision feel urgent.',
    'Limited-time offers can make waiting feel harder than it is.',
    'When everything feels urgent, it gets harder to think clearly.',
    'This page really wants a quick decision.',
    'The pressure here may feel bigger than the actual decision.',
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

// ─── Diversity slot ───────────────────────────────────────────────────────────
// Deterministic but varied: different per mechanic, different each day,
// offset by session phrase count for within-session spread.

function hashSlot(mechanic: string, poolSize: number, offset: number): number {
  const day = Math.floor(Date.now() / 86_400_000)  // calendar day index since epoch
  let h = day
  for (const c of mechanic) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  return Math.abs(h + offset) % poolSize
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

  // Rotate deterministically: hash of (mechanic + day-index) + phrase cache size.
  // Different phrase per mechanic per day; offset by recentPhrases.length for
  // within-session variety. Avoids hour-based periodicity (same phrase same time daily).
  const slot        = hashSlot(mechanic, pool.length, recentPhrases.length)
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
