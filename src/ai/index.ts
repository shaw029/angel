import type { AlignmentJudgment, CompressedContext, Intervention } from '@shared/types'
import { infer } from './infer'
import { generateInterpretation } from './interpretation'

export { infer } from './infer'

export interface SessionVerdict {
  judgment:     AlignmentJudgment | null  // null only when inference itself failed
  intervention: Intervention | null       // present only when the Narrator proposes a nudge
}

/**
 * The Narrator's entry point, called from the offscreen document.
 *
 * Runs one structured inference over the session evidence and returns both the
 * alignment judgment (always, so the background can update the tab story and
 * priors even when no nudge fires) and an optional intervention proposal.
 *
 * Enforcement, not trust: a nudge is only proposed when the model both decided
 * 'intervene' AND judged the session misaligned. 'aligned' is a hard veto
 * regardless of what the decision field says — an aligned user is never nudged.
 */
export async function judgeSession(ctx: CompressedContext): Promise<SessionVerdict> {
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
    page:              ctx.page,
    previousNarrative: ctx.previousNarrative,
    alignmentPrior:    ctx.alignmentPrior,
    interpretation:  interpretation.mechanic
      ? { explanation: interpretation.explanation, mechanic: interpretation.mechanic }
      : undefined,
  })

  if (!output) return { judgment: null, intervention: null }

  const judgment: AlignmentJudgment = {
    alignment:  output.alignment,
    confidence: output.confidence,
    narrative:  output.narrative,
    intent:     output.intent || null,
    at:         Date.now(),
  }

  const wantsNudge =
    output.decision_state === 'intervene' &&
    output.alignment !== 'aligned' &&
    output.confidence >= 0.5 &&
    output.intervention_message.length > 0

  if (!wantsNudge) return { judgment, intervention: null }

  return {
    judgment,
    intervention: {
      id:          crypto.randomUUID(),
      message:     output.intervention_message,
      tone:        output.intervention_style,
      action:      output.suggested_action,
      confidence:  output.confidence,
      tier:        output.tier_hint,  // proposal — the Guardian may clamp full → subtle
      observation: interpretation.observation || undefined,
      mechanic:    interpretation.mechanic,
      category:    ctx.page_context.category,
    },
  }
}
