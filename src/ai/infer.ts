import type { InferenceInput, InferenceOutput } from '@shared/types'
import type { ChatMessage } from './engine'
import { engine } from './engine'
import { buildInferencePrompt } from './prompts'
import { parseAndValidate, SchemaError } from './schema'
import { isTooSimilar } from './guidance'

const MAX_RETRIES    = 3
const MAX_NEW_TOKENS = 120  // compact JSON output is ~70–80 tokens; 120 gives safe headroom

/**
 * Runs structured JSON inference against the local Gemma model.
 *
 * On schema or parse failures, appends a correction turn and retries. If the
 * output is valid but too similar to a recent phrase, appends a variation
 * prompt and retries within the same budget. Confidence is normalized to
 * [0, 1] by the schema validator regardless of model output.
 *
 * Returns null if the model is unavailable or all retries are exhausted.
 */
export async function infer(input: InferenceInput): Promise<InferenceOutput | null> {
  try {
    await engine.ensureReady()
  } catch {
    return null  // graceful degradation — model unavailable
  }

  const recentPhrases = input.recentPhrases ?? []
  const baseMessages  = buildInferencePrompt(input)
  let   messages: ChatMessage[] = baseMessages

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const text = await engine.generate(messages, { maxNewTokens: MAX_NEW_TOKENS })
    if (!text) return null

    try {
      const output = parseAndValidate(text)

      // If the message is too similar to recent nudges, prompt for variation
      if (
        output.decision_state === 'intervene' &&
        isTooSimilar(output.intervention_message, recentPhrases) &&
        attempt < MAX_RETRIES - 1
      ) {
        messages = [
          ...messages,
          { role: 'assistant', content: text },
          { role: 'user',      content: 'That phrasing is too similar to a recent message. Write a different sentence with fresh wording — same JSON schema, different words.' },
        ]
        continue
      }

      return output
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) return null

      const hint = err instanceof SchemaError
        ? `Your response failed validation — ${err.message}. Fix only that field.`
        : 'Your response was not valid JSON. Respond with a JSON object only.'

      messages = [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user',      content: `${hint} Match the schema exactly, no markdown.` },
      ]
    }
  }

  return null
}
