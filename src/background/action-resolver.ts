import type { CognitiveState, ManipulationMechanic, SuggestedAction } from '@shared/types'

/**
 * Resolves the companion action label from cognitive state and page mechanic.
 * The background calls this after AI inference and injects the result into the
 * Intervention, overriding whatever the model suggested.
 *
 * Priority: mechanic-level overrides first, then state-based branching.
 * All returned values are soft, companion-toned — never directive or alarming.
 */
export function resolveAction(
  state:    CognitiveState,
  mechanic: ManipulationMechanic | null,
): SuggestedAction {
  // Social validation mechanics → awareness of internal state
  if (mechanic === 'social_momentum')      return 'notice_how_you_feel'

  // Emotionally escalating feed content → immediate grounding
  if (mechanic === 'emotional_escalation') return 'take_a_breath'

  switch (state) {
    case 'compulsive_loop':
      // Variable reward loops are harder to exit — gentler pull-back
      return mechanic === 'variable_reward' ? 'let_this_rest' : 'pause_for_a_moment'

    case 'emotionally_reactive':
      if (mechanic === 'urgency_amplification') return 'slow_this_down'
      if (mechanic === 'decision_pressure')     return 'come_back_later'
      return 'take_your_time'

    case 'decision_fatigue':
      if (mechanic === 'urgency_amplification') return 'take_your_time'
      return 'come_back_later'

    case 'fragmented_attention':
      return mechanic === 'attention_capture' ? 'reset_attention' : 'one_thing_at_a_time'

    case 'passive_consumption':
      return 'check_in_with_yourself'

    default:
      return 'pause_for_a_moment'
  }
}
