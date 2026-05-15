import type { BrowsingSignal, HeuristicResult, HeuristicReason } from '@shared/types'
import { HEURISTIC } from '@shared/constants'

export function evaluate(signal: BrowsingSignal): HeuristicResult {
  if (signal.timeOnPage < HEURISTIC.MIN_PAGE_TIME_S) {
    return { flagged: false, confidence: 0, reasons: [], signal }
  }

  const reasons: HeuristicReason[] = []

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

  const confidence = Math.min(reasons.length / 2, 1)

  return {
    flagged: reasons.length > 0,
    confidence,
    reasons,
    signal,
  }
}
