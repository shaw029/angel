import type { EventType, InterventionStyle, MemorySummary } from '@shared/types'

// ─── Intensity resolution ─────────────────────────────────────────────────────

/**
 * Maps behavioral history to an appropriate intervention intensity.
 *
 * - No memory / new user    → gentle     (non-presumptuous, warm)
 * - Emerging pattern (1–3w) → curious    (exploratory, question-first)
 * - Established (4w+) OR high acceptance → reflective (deeper, more personal)
 */
export function resolveIntensity(
  _eventType: EventType,
  memory:     MemorySummary | undefined,
): InterventionStyle {
  if (!memory || memory.weeks_active === 0) return 'gentle'

  // Empirical best style from profile takes precedence once there's enough data
  if (memory.optimal_style) return memory.optimal_style

  // Fallback: time-and-acceptance heuristic
  if (memory.acceptance_rate >= 0.5 && memory.weeks_active >= 2) return 'reflective'
  if (memory.weeks_active >= 4) return 'reflective'
  if (memory.weeks_active >= 1) return 'curious'
  return 'gentle'
}

// ─── Per-event-type context blocks ───────────────────────────────────────────

interface EventGuidance {
  directive: string
  seeds:     readonly string[]
}

const EVENT_GUIDANCE: Record<EventType, EventGuidance> = {
  checkout_pressure: {
    directive: 'User is under purchase pressure. Invite a pause before deciding — do not imply the decision is wrong.',
    seeds: [
      'There\'s no urgency that requires your decision right now.',
      'You can always come back to this.',
      'How does this feel, separate from the countdown?',
      'What would you decide if you slept on it first?',
    ],
  },
  subscription_funnel: {
    directive: 'User is in a recurring-billing flow. Invite awareness of long-term commitment without implying they shouldn\'t subscribe.',
    seeds: [
      'This will recur — does that feel right for you?',
      'What would using this look like a month from now?',
      'Is this a want or a need right now?',
      'Worth a moment to think about what you\'re signing up for.',
    ],
  },
  engagement_hook: {
    directive: 'User is in a designed engagement loop. Invite a natural stopping point — no judgment about the content.',
    seeds: [
      'There\'s always more — you get to choose when enough is enough.',
      'What brought you here originally?',
      'A pause might feel refreshing right now.',
      'It\'s okay to stop whenever you\'re ready.',
    ],
  },
  attention_capture: {
    directive: 'Urgency language is present. Invite the user to notice how the page feels, not to distrust it.',
    seeds: [
      'Notice how this page is designed to feel urgent.',
      'How do you feel right now, separate from the page?',
      'You can take a breath before deciding.',
      'The urgency here may not reflect your actual deadline.',
    ],
  },
  passive_consumption: {
    directive: 'User has been passively browsing for a while. Invite a mindful pause — not a productivity nudge.',
    seeds: [
      'You\'ve been here for a while — how are you doing?',
      'Is this still enjoyable, or are you on autopilot?',
      'A short break might feel good.',
      'How does your body feel right now?',
    ],
  },
  distracted_browsing: {
    directive: 'User is switching rapidly between tabs. Gently invite focus — don\'t imply disorganization.',
    seeds: [
      'What matters most to you right now?',
      'It\'s okay to close a few tabs.',
      'One thing at a time might feel calmer.',
      'What were you originally trying to do?',
    ],
  },
  ambient: {
    directive: 'No notable pattern detected. If intervening, keep it warm and brief.',
    seeds: [
      'Just a quiet moment, whenever you\'d like it.',
      'How are you doing right now?',
    ],
  },
}

/**
 * Builds the compact [guidance] line injected into the model's user turn.
 *
 * Omits the verbose directive string — the system prompt already encodes behavioral
 * rules per event type. Only the style and a seed phrase are needed here (~10 tokens
 * vs ~30 with the directive). Seed is randomised to discourage repetitive phrasing.
 */
export function buildContextBlock(eventType: EventType, style: InterventionStyle): string {
  const { seeds } = EVENT_GUIDANCE[eventType]
  const seed = seeds[Math.floor(Math.random() * seeds.length)]
  return `style:${style} hint:"${seed}"`
}

// ─── Similarity detection ─────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'be', 'are', 'was', 'you', 'your', 'this', 'that', 'with',
  'can', 'do', 'not', 'but', 'how', 'what', 'just', 'now', 'right', 'feel',
])

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  )
}

/**
 * Returns true if the candidate is too similar to any recent phrase.
 *
 * Two signals:
 *  1. Word-overlap Jaccard ≥ 0.5 (catches semantic near-duplicates)
 *  2. First-3-word prefix match  (catches paraphrase openers)
 */
export function isTooSimilar(candidate: string, recent: string[]): boolean {
  if (recent.length === 0) return false

  const candTokens = tokenize(candidate)
  const candPrefix = candidate.toLowerCase().split(/\s+/).slice(0, 3).join(' ')

  for (const phrase of recent) {
    const phraseTokens = tokenize(phrase)
    const phrasePrefix = phrase.toLowerCase().split(/\s+/).slice(0, 3).join(' ')

    if (candPrefix === phrasePrefix) return true

    const intersection = [...candTokens].filter(w => phraseTokens.has(w))
    const unionSize    = new Set([...candTokens, ...phraseTokens]).size
    if (unionSize > 0 && intersection.length / unionSize >= 0.5) return true
  }

  return false
}
