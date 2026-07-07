import type { InferenceInput } from '@shared/types'
import type { ChatMessage } from './engine'
import { INFERENCE_SYSTEM_PROMPT } from './system-prompt'

/**
 * Builds the chat message array for the structured JSON inference path.
 * Returns a [system, user] pair so the retry loop can append
 * [assistant, user] correction turns on validation failure.
 *
 * The user turn carries the session evidence in three compact lines:
 *   1. semantic — page title, title trail, entry provenance, media state
 *   2. witness  — cognitive state, event type, trajectory, session dynamics
 *   3. context  — previous narrative, priors, history, tone, skip phrases
 *
 * Titles and narratives exist only in this prompt and the per-tab in-memory
 * story — they are never persisted and never leave the device.
 */
export function buildInferencePrompt(input: InferenceInput): ChatMessage[] {
  return [
    { role: 'system', content: INFERENCE_SYSTEM_PROMPT },
    { role: 'user',   content: `${encodeEvidence(input)}\n\nRespond with JSON only.` },
  ]
}

// ─── Evidence encoding ────────────────────────────────────────────────────────

function encodeEvidence(input: InferenceInput): string {
  const { event_type, session_context: sc, memory, intensity, recentPhrases, cognitiveState, drift, page, previousNarrative, alignmentPrior } = input

  const lines: string[] = []

  // ── Line 1: semantic page context ──
  if (page) {
    const semantic = [
      `page:"${page.title || 'untitled'}"`,
      page.titleTrail.length > 0
        ? `trail:${page.titleTrail.map(t => `"${t}"`).join(' > ')}`
        : null,
      `entry:${page.entry}`,
      page.mediaPlaying ? 'media' : null,
    ].filter(Boolean).join(' ')
    lines.push(semantic)
  }

  // ── Line 2: witness testimony ──
  const state    = cognitiveState?.state ?? 'intentional_browsing'
  const lowConf  = cognitiveState && cognitiveState.confidence < 0.50 ? '(low)' : ''
  const eventTag = event_type !== 'ambient' ? ` event:${event_type}` : ''

  const hasMeaningfulDrift = drift && drift.direction !== 'stable' && drift.confidence >= 0.45
  const trajTag = hasMeaningfulDrift
    ? ` traj:${drift!.trajectory ?? drift!.direction} depth:${drift!.depth.toFixed(1)}`
    : ''

  const dynamics = [
    `${sc.minutes_active}m`,
    sc.doom_scrolling ? 'doom'  : null,
    sc.rapid_clicking ? 'rapid' : null,
  ].filter(Boolean).join(' ')

  lines.push(`witness: state:${state}${lowConf}${eventTag}${trajTag} ${dynamics}`)

  // ── Line 3: continuity + history + tone ──
  const ctxParts: string[] = []

  if (previousNarrative) ctxParts.push(`story:"${previousNarrative}"`)
  if (alignmentPrior)    ctxParts.push(`prior:${alignmentPrior}`)

  if (memory) {
    const mem = [
      memory.dominant_pattern ? `hist:${memory.dominant_pattern}` : null,
      memory.weeks_active > 0 ? `weeks:${memory.weeks_active}`    : null,
      `acc:${Math.round(memory.acceptance_rate * 100)}%`,
      memory.vulnerable_now   ? 'vuln'                            : null,
      memory.tolerance_level !== undefined && memory.tolerance_level < 0.80
        ? `fatigue:${Math.round((1 - memory.tolerance_level) * 100)}%`
        : null,
      memory.escalates_fast   ? 'escalates_fast'                  : null,
    ].filter(Boolean).join(' ')
    if (mem) ctxParts.push(mem)
  }

  ctxParts.push(`tone:${intensity ?? 'gentle'}`)

  // Skip phrases — last 4 recent phrases only to avoid over-constraining
  const recent = (recentPhrases ?? []).slice(-4)
  if (recent.length > 0) {
    ctxParts.push(`skip:${recent.map(p => `"${p}"`).join(' ')}`)
  }

  lines.push(ctxParts.join(' | '))

  return lines.join('\n')
}
