import type {
  InferenceOutput,
  DecisionState,
  IntentAlignment,
  InterventionStyle,
  SuggestedAction,
} from '@shared/types'

// ─── Enum tables ─────────────────────────────────────────────────────────────

const ALIGNMENTS: readonly IntentAlignment[]        = ['aligned', 'drifting', 'captured']
const DECISION_STATES: readonly DecisionState[]     = ['intervene', 'observe', 'skip']
const TIER_HINTS: readonly ('subtle' | 'full')[]    = ['subtle', 'full']
const INTERVENTION_STYLES: readonly InterventionStyle[] = ['gentle', 'curious', 'reflective']
const SUGGESTED_ACTIONS: readonly SuggestedAction[] = [
  'pause_for_a_moment', 'let_this_rest', 'slow_this_down', 'take_your_time',
  'come_back_later', 'one_thing_at_a_time', 'take_a_breath', 'reset_attention',
  'check_in_with_yourself', 'notice_how_you_feel', 'none',
]

// ─── Error ───────────────────────────────────────────────────────────────────

export class SchemaError extends Error {
  constructor(public readonly field: string, detail: string) {
    super(`${field}: ${detail}`)
    this.name = 'SchemaError'
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function oneOf<T extends string>(
  field: string,
  value: unknown,
  options: readonly T[],
): T {
  if (typeof value === 'string' && (options as readonly string[]).includes(value)) {
    return value as T
  }
  throw new SchemaError(field, `must be one of: ${options.join(', ')}`)
}

/** Like oneOf, but tolerates a missing/invalid value — critical fields stay strict,
 *  secondary fields degrade gracefully so a 2B model isn't retried over trivia. */
function oneOfOr<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/** Coerces to a trimmed string, '' when absent, truncated to maxLen. */
function softString(value: unknown, maxLen: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : ''
}

/** Clamps any finite number to [0, 1]; rejects non-numeric values. */
function normalizeConfidence(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new SchemaError('confidence', 'must be a finite number')
  return Math.max(0, Math.min(1, n))
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates a parsed JSON value against the InferenceOutput schema.
 * Throws SchemaError with the offending field name on any violation.
 *
 * Strict fields (retried on failure): alignment, decision_state, confidence,
 * and — only when intervening — intervention_message. Everything else degrades
 * to a sensible default so trivia never burns a retry.
 */
export function validate(raw: unknown): InferenceOutput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SchemaError('root', 'expected a JSON object')
  }

  const o = raw as Record<string, unknown>

  const alignment          = oneOf('alignment',      o.alignment,      ALIGNMENTS)
  const decision_state     = oneOf('decision_state', o.decision_state, DECISION_STATES)
  const confidence         = normalizeConfidence(o.confidence)

  const tier_hint          = oneOfOr(o.tier_hint,          TIER_HINTS,          'subtle')
  const intervention_style = oneOfOr(o.intervention_style, INTERVENTION_STYLES, 'gentle')
  const suggested_action   = oneOfOr(o.suggested_action,   SUGGESTED_ACTIONS,   'none')

  const narrative = softString(o.narrative, 240)
  const intent    = softString(o.intent, 60)
  const message   = softString(o.intervention_message, 160)

  if (decision_state === 'intervene' && !message) {
    throw new SchemaError('intervention_message', 'must be non-empty when decision_state is intervene')
  }

  return {
    alignment,
    narrative,
    intent,
    decision_state,
    confidence,
    tier_hint,
    intervention_style,
    intervention_message: message,
    suggested_action,
  }
}

/**
 * Extracts the first JSON object from model output (strips markdown fences
 * if present), then validates it against the schema.
 */
export function parseAndValidate(text: string): InferenceOutput {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new SchemaError('root', 'no JSON object found in response')

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch (err) {
    throw new SchemaError('root', `JSON parse error: ${(err as Error).message}`)
  }

  return validate(parsed)
}
