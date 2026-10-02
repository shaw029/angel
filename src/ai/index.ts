import { explainEvidence, groundedMessage } from '@shared/evidence-copy'
import type { AlignmentJudgment, CompressedContext, Intervention } from '@shared/types'
import { infer } from './infer'
import { checkIntent } from './intent-check'
import { classifyMechanic } from './interpretation'

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
 * A misaligned label must also be backed by the evidence its definition needs,
 * and with a stated intent, a separate check must find the page diverges from it.
 */
export async function judgeSession(ctx: CompressedContext): Promise<SessionVerdict> {
  const interpretation = { mechanic: classifyMechanic(ctx), explanation: explainEvidence(ctx.signals) }

  const output = await infer({
    explicitIntent: ctx.explicitIntent,
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

  // The contract's evidence requirements, enforced outside the model so page
  // text cannot argue past them: drifting is divergence from an intent the user
  // stated, and capture needs several fresh mechanics, never duration alone.
  const mechanics = new Set(ctx.signals.filter(s => s !== 'session_long')).size
  const supported =
    (output.alignment === 'drifting' && !!ctx.explicitIntent) ||
    (output.alignment === 'captured' && mechanics >= 2)

  const wantsNudge =
    output.decision_state === 'intervene' &&
    supported &&
    output.confidence >= 0.5

  const message = groundedMessage(ctx.signals)
  if (!wantsNudge || !message) return { judgment, intervention: null }
  // A stated intent outranks everything else: only a page that clearly
  // diverges from it may be nudged, judged without the page's mechanics.
  if (ctx.explicitIntent && await checkIntent(ctx) !== 'diverges') return { judgment, intervention: null }

  return {
    judgment,
    intervention: {
      id:          crypto.randomUUID(),
      message,
      explanation: explainEvidence(ctx.signals),
      reasonKey: [...ctx.signals].filter(s => s !== 'session_long').sort().join(','),
      tone:        output.intervention_style,
      action:      output.suggested_action,
      confidence:  output.confidence,
      tier:        output.tier_hint,  // proposal — the Guardian may clamp full → subtle
      observation: undefined,
      mechanic:    interpretation.mechanic,
      category:    ctx.page_context.category,
    },
  }
}
