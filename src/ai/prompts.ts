import type { InferenceInput } from '@shared/types'
import type { ChatMessage } from './engine'
import { INFERENCE_SYSTEM_PROMPT } from './system-prompt'
import { buildContextBlock } from './guidance'

/**
 * Builds the chat message array for the structured JSON inference path.
 * Returns a [system, user] pair so the retry loop can append
 * [assistant, user] correction turns on validation failure.
 */
export function buildInferencePrompt(input: InferenceInput): ChatMessage[] {
  const { event_type, signals, session_context: sc, memory, intensity, recentPhrases } = input

  const ctx = [
    `pattern:${event_type}`,
    `time:${sc.minutes_active}min`,
    `tabs:${sc.tab_activity}`,
    sc.doom_scrolling ? 'doom_scroll:yes' : null,
    sc.rapid_clicking ? 'rapid_click:yes' : null,
    signals.length > 0 ? `signals:${signals.join(',')}` : null,
  ].filter(Boolean).join(' ')

  const memLine      = memory ? formatMemoryLine(memory) : null
  const guidanceLine = buildContextBlock(event_type, intensity ?? 'gentle')
  const avoidLine    = recentPhrases && recentPhrases.length > 0
    ? recentPhrases.map(p => `"${p}"`).join(' ')
    : null

  const userContent = [
    `[context] ${ctx}`,
    memLine      ? `[memory] ${memLine}` : null,
    `[guidance] ${guidanceLine}`,
    avoidLine    ? `[avoid] ${avoidLine}` : null,
    '',
    'Respond with JSON only.',
  ].filter((l) => l !== null).join('\n')

  return [
    { role: 'system', content: INFERENCE_SYSTEM_PROMPT },
    { role: 'user',   content: userContent },
  ]
}

function formatMemoryLine(m: import('@shared/types').MemorySummary): string {
  return [
    m.dominant_pattern ? `pattern:${m.dominant_pattern}` : null,
    `acceptance:${Math.round(m.acceptance_rate * 100)}%`,
    m.weeks_active > 0 ? `weeks:${m.weeks_active}` : null,
  ].filter(Boolean).join(' ')
}
