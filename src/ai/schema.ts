import type {
  InferenceOutput,
  DecisionState,
  InterventionStyle,
  SuggestedAction,
} from '@shared/types'

// ─── Enum tables ─────────────────────────────────────────────────────────────

const DECISION_STATES: readonly DecisionState[]     = ['intervene', 'observe', 'skip']
const INTERVENTION_STYLES: readonly InterventionStyle[] = ['gentle', 'curious', 'reflective']
const SUGGESTED_ACTIONS: readonly SuggestedAction[] = [
  'take_a_break', 'review_cart', 'set_a_timer', 'close_tab', 'none',
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
 */
export function validate(raw: unknown): InferenceOutput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SchemaError('root', 'expected a JSON object')
  }

  const o = raw as Record<string, unknown>

  const decision_state     = oneOf('decision_state',     o.decision_state,     DECISION_STATES)
  const intervention_style = oneOf('intervention_style', o.intervention_style, INTERVENTION_STYLES)
  const suggested_action   = oneOf('suggested_action',   o.suggested_action,   SUGGESTED_ACTIONS)
  const confidence         = normalizeConfidence(o.confidence)

  const rawMessage = typeof o.intervention_message === 'string'
    ? o.intervention_message.trim()
    : ''
  if (!rawMessage) {
    throw new SchemaError('intervention_message', 'must be a non-empty string')
  }

  return {
    decision_state,
    confidence,
    intervention_style,
    intervention_message: rawMessage,
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
