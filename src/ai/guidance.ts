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

function bigrams(s: string): Set<string> {
  const words = s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 1)
  const bg = new Set<string>()
  for (let i = 0; i < words.length - 1; i++) bg.add(`${words[i]} ${words[i + 1]}`)
  return bg
}

/**
 * Returns true if the candidate is too similar to any recent phrase.
 *
 * Three signals:
 *  1. First-3-word prefix match  (catches paraphrase openers)
 *  2. Word-overlap Jaccard ≥ 0.5 (catches semantic near-duplicates)
 *  3. Bigram Jaccard ≥ 0.4       (catches same-structure paraphrases)
 */
export function isTooSimilar(candidate: string, recent: string[]): boolean {
  if (recent.length === 0) return false

  const candTokens  = tokenize(candidate)
  const candBigrams = bigrams(candidate)
  const candPrefix  = candidate.toLowerCase().split(/\s+/).slice(0, 3).join(' ')

  for (const phrase of recent) {
    // Prefix match
    const phrasePrefix = phrase.toLowerCase().split(/\s+/).slice(0, 3).join(' ')
    if (candPrefix === phrasePrefix) return true

    // Unigram Jaccard
    const phraseTokens = tokenize(phrase)
    const uniIntersect = [...candTokens].filter(w => phraseTokens.has(w))
    const uniUnion     = new Set([...candTokens, ...phraseTokens]).size
    if (uniUnion > 0 && uniIntersect.length / uniUnion >= 0.50) return true

    // Bigram Jaccard — catches structurally similar paraphrases
    const phraseBigrams   = bigrams(phrase)
    const biIntersect     = [...candBigrams].filter(b => phraseBigrams.has(b))
    const biUnion         = new Set([...candBigrams, ...phraseBigrams]).size
    if (biUnion > 0 && biIntersect.length / biUnion >= 0.40) return true
  }

  return false
}
