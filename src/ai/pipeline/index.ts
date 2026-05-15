import type {
  BrowsingSignal,
  HeuristicReason,
  DetectionResult,
  BehavioralEvent,
  TrackingResult,
  CompressedContext,
} from '@shared/types'
import { extractSignals } from './signals'
import { classifyEventType } from './classify'
import { buildSessionContext, buildPageContext } from './session'

/**
 * Converts raw browser observations into a compact structured context for Gemma.
 *
 * Guarantees:
 *   - No raw HTML, no full text, no URLs
 *   - All fields are categorical or small integers
 *   - Domain is replaced with a category label (privacy-preserving)
 */
export function compress(
  _reasons: HeuristicReason[],    // from heuristic evaluation (reserved for future weighting)
  browsingSignal: BrowsingSignal,
  detections: DetectionResult[],
  allEvents: BehavioralEvent[],
): CompressedContext {
  const tracking = allEvents
    .filter((e): e is Extract<BehavioralEvent, { kind: 'tracking' }> => e.kind === 'tracking')
    .map((e): TrackingResult => e.data)

  const signals = extractSignals(detections, tracking)
  const eventType = classifyEventType(signals)

  return {
    event_type:      eventType,
    signals,
    session_context: buildSessionContext(browsingSignal, tracking, signals),
    page_context:    buildPageContext(browsingSignal),
  }
}
