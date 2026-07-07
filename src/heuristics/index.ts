import type { BrowsingSignal, HeuristicResult, HeuristicReason } from '@shared/types'
import { HEURISTIC } from '@shared/constants'

// The heuristics are an attention trigger, not a verdict: a flag means "worth
// consulting the Narrator", never "intervene". Judgment belongs to the AI layer.
export function evaluate(signal: BrowsingSignal): HeuristicResult {
  if (signal.timeOnPage < HEURISTIC.MIN_PAGE_TIME_S) {
    return { flagged: false, confidence: 0, reasons: [], signal }
  }

  const reasons: HeuristicReason[] = []

  // idleTime is already 0 while media plays (observer), so a lecture or film
  // never trips this — but genuinely stalled pages still do.
  if (signal.idleTime >= HEURISTIC.IDLE_THRESHOLD_S) {
    reasons.push('extended-idle')
  }

  if (signal.switchCount >= HEURISTIC.TAB_SWITCH_THRESHOLD) {
    reasons.push('rapid-tab-switching')
  }

  if (
    signal.scrollDepth >= HEURISTIC.EXCESSIVE_SCROLL_DEPTH &&
    signal.timeOnPage <= HEURISTIC.EXCESSIVE_SCROLL_MAX_TIME_S
  ) {
    reasons.push('excessive-scroll')
  }

  // Long continuous media sessions (autoplay chains) are invisible to the
  // idle/scroll heuristics — surface them so the Narrator can judge whether
  // it's a chosen film or an autoplay rabbit hole.
  if (signal.mediaPlaying && signal.timeOnPage >= HEURISTIC.MEDIA_SESSION_THRESHOLD_S) {
    reasons.push('extended-media-session')
  }

  const confidence = Math.min(reasons.length / 2, 1)

  return {
    flagged: reasons.length > 0,
    confidence,
    reasons,
    signal,
  }
}
