import type { InferenceInput } from '@shared/types'
import type { ChatMessage } from './engine'
import { INFERENCE_SYSTEM_PROMPT } from './system-prompt'

/**
 * Builds the chat message array for the structured JSON inference path.
 * Returns a [system, user] pair so the retry loop can append
 * [assistant, user] correction turns on validation failure.
 *
 * User turn is a single compact line (~50 tokens vs ~150 previously).
 * All context is pre-synthesized into cognitive state + trajectory —
 * the model reasons holistically rather than parsing isolated signals.
 */
export function buildInferencePrompt(input: InferenceInput): ChatMessage[] {
  return [
    { role: 'system', content: INFERENCE_SYSTEM_PROMPT },
    { role: 'user',   content: `${encodeStateVector(input)}\n\nRespond with JSON only.` },
  ]
}

// ─── State vector encoding ────────────────────────────────────────────────────
// Single-line format:
//   state:X [event:Y] [traj:Z depth:D] | Tm [doom] [rapid] | [hist:P weeks:N acc:A% [vuln] [fatigue:F%] [escalates_fast]] | tone:T [| skip:"p1" "p2"]

function encodeStateVector(input: InferenceInput): string {
  const { event_type, session_context: sc, memory, intensity, recentPhrases, cognitiveState, drift } = input

  const parts: string[] = []

  // ── Cognitive state + event type + trajectory ──
  const state     = cognitiveState?.state ?? 'intentional_browsing'
  const lowConf   = cognitiveState && cognitiveState.confidence < 0.50 ? '(low)' : ''
  const eventTag  = event_type !== 'ambient' ? ` event:${event_type}` : ''

  const hasMeaningfulDrift = drift && drift.direction !== 'stable' && drift.confidence >= 0.45
  const trajTag   = hasMeaningfulDrift
    ? ` traj:${drift!.trajectory ?? drift!.direction} depth:${drift!.depth.toFixed(1)}`
    : ''

  parts.push(`state:${state}${lowConf}${eventTag}${trajTag}`)

  // ── Session context ──
  const ctxParts = [
    `${sc.minutes_active}m`,
    sc.doom_scrolling ? 'doom'  : null,
    sc.rapid_clicking ? 'rapid' : null,
  ].filter(Boolean).join(' ')
  parts.push(ctxParts)

  // ── Memory / longitudinal history ──
  if (memory) {
    const mem = [
      memory.dominant_pattern                                          ? `hist:${memory.dominant_pattern}` : null,
      memory.weeks_active > 0                                          ? `weeks:${memory.weeks_active}`    : null,
      `acc:${Math.round(memory.acceptance_rate * 100)}%`,
      memory.vulnerable_now                                            ? 'vuln'                            : null,
      memory.tolerance_level !== undefined && memory.tolerance_level < 0.80
        ? `fatigue:${Math.round((1 - memory.tolerance_level) * 100)}%`                                    : null,
      memory.escalates_fast                                            ? 'escalates_fast'                  : null,
    ].filter(Boolean).join(' ')
    if (mem) parts.push(mem)
  }

  // ── Tone ──
  parts.push(`tone:${intensity ?? 'gentle'}`)

  // ── Skip phrases — last 4 recent phrases only to avoid over-constraining ──
  const recent = (recentPhrases ?? []).slice(-4)
  if (recent.length > 0) {
    parts.push(`skip:${recent.map(p => `"${p}"`).join(' ')}`)
  }

  return parts.join(' | ')
}
