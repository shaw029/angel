import type { CompressedContext, Intervention } from '@shared/types'
import { infer } from './infer'
import { generateInterpretation } from './interpretation'

export { infer } from './infer'

/**
 * Legacy entry point used by the offscreen document.
 * Delegates to infer() and maps the result to the Intervention shape
 * consumed by the content script nudge UI.
 * Returns null if inference is unavailable or decision_state is not 'intervene'.
 */
export async function generateIntervention(ctx: CompressedContext): Promise<Intervention | null> {
  const interpretation = generateInterpretation(ctx, ctx.recentPhrases ?? [])

  const output = await infer({
    event_type:      ctx.event_type,
    signals:         ctx.signals,
    session_context: ctx.session_context,
    memory:          ctx.memory,
    intensity:       ctx.intensity,
    recentPhrases:   ctx.recentPhrases,
    cognitiveState:  ctx.cognitiveState,
    drift:           ctx.drift,
    interpretation:  interpretation.mechanic
      ? { explanation: interpretation.explanation, mechanic: interpretation.mechanic }
      : undefined,
  })

  // decision_state and confidence together determine tier — gate happens in background.
  // We only suppress here for 'skip'/'observe' (model's own judgment) and low confidence.
  if (!output || output.decision_state !== 'intervene' || output.confidence < 0.5) return null

  return {
    id:          crypto.randomUUID(),
    message:     output.intervention_message,
    tone:        output.intervention_style,
    action:      output.suggested_action,
    confidence:  output.confidence,
    tier:        'subtle',  // placeholder — background gate overwrites this before forwarding
    observation: interpretation.observation || undefined,
    mechanic:    interpretation.mechanic,
  }
}
