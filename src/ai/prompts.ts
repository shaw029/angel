import type { InferenceInput, CognitiveStateEstimate, DriftEstimate } from '@shared/types'
import type { ChatMessage } from './engine'
import { INFERENCE_SYSTEM_PROMPT } from './system-prompt'
import { buildContextBlock } from './guidance'

/**
 * Builds the chat message array for the structured JSON inference path.
 * Returns a [system, user] pair so the retry loop can append
 * [assistant, user] correction turns on validation failure.
 */
export function buildInferencePrompt(input: InferenceInput): ChatMessage[] {
  const { event_type, signals, session_context: sc, memory, intensity, recentPhrases, cognitiveState, drift } = input
  // `input.interpretation` accessed directly below — no need to destructure

  const ctx = [
    `pattern:${event_type}`,
    `time:${sc.minutes_active}min`,
    `tabs:${sc.tab_activity}`,
    sc.doom_scrolling ? 'doom_scroll:yes' : null,
    sc.rapid_clicking ? 'rapid_click:yes' : null,
    signals.length > 0 ? `signals:${signals.join(',')}` : null,
  ].filter(Boolean).join(' ')

  const memLine       = memory ? formatMemoryLine(memory)  : null
  const guidanceLine  = buildContextBlock(event_type, intensity ?? 'gentle')
  const avoidLine     = recentPhrases && recentPhrases.length > 0
    ? recentPhrases.map(p => `"${p}"`).join(' ')
    : null
  const cogLine       = cognitiveState
    ? formatCognitiveLine(cognitiveState)
    : null
  const mechanicLine  = input.interpretation?.mechanic
    ? `${input.interpretation.mechanic}: ${input.interpretation.explanation}`
    : null
  // Only include drift line when direction is meaningful and confidence is sufficient
  const driftLine    = drift && drift.direction !== 'stable' && drift.confidence >= 0.45
    ? formatDriftLine(drift)
    : null

  const userContent = [
    `[context] ${ctx}`,
    cogLine       ? `[mind] ${cogLine}` : null,
    driftLine     ? `[drift] ${driftLine}` : null,
    memLine       ? `[memory] ${memLine}` : null,
    mechanicLine  ? `[mechanic] ${mechanicLine}` : null,
    `[guidance] ${guidanceLine}`,
    avoidLine     ? `[avoid] ${avoidLine}` : null,
    '',
    'Respond with JSON only.',
  ].filter((l) => l !== null).join('\n')

  return [
    { role: 'system', content: INFERENCE_SYSTEM_PROMPT },
    { role: 'user',   content: userContent },
  ]
}

function formatDriftLine(d: DriftEstimate): string {
  const parts: string[] = [
    `${d.direction}(${Math.round(d.confidence * 100)}%)`,
    d.trajectory ?? '',
    `depth:${d.depth.toFixed(1)}`,
  ]
  // Include velocity only when it's meaningfully fast (≥ 0.02/min = 20% per hour)
  if (Math.abs(d.velocity) >= 0.02) {
    parts.push(d.velocity > 0 ? 'fast' : 'slow_recovery')
  }
  return parts.filter(Boolean).join(' ')
}

function formatCognitiveLine(cs: CognitiveStateEstimate): string {
  const base = `${cs.state}(${Math.round(cs.confidence * 100)}%)`
  const transition = cs.transition ? ` ←${cs.transition.from}` : ''
  return base + transition
}

function formatMemoryLine(m: import('@shared/types').MemorySummary): string {
  return [
    m.dominant_pattern ? `pattern:${m.dominant_pattern}` : null,
    `acceptance:${Math.round(m.acceptance_rate * 100)}%`,
    m.weeks_active > 0           ? `weeks:${m.weeks_active}`                          : null,
    m.vulnerable_now             ? 'vulnerable_window:yes'                             : null,
    m.tolerance_level !== undefined && m.tolerance_level < 0.7
      ? `fatigue:${Math.round((1 - m.tolerance_level) * 100)}%`                       : null,
    m.escalates_fast             ? 'escalates_fast:yes'                                : null,
  ].filter(Boolean).join(' ')
}
