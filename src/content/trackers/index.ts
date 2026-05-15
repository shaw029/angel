import type { BehavioralEvent, TrackingResult } from '@shared/types'
import { setup as setupSession } from './session'
import { setup as setupScrollContinuity } from './scroll-continuity'
import { setup as setupInteractionLoop } from './interaction-loop'

export function setup(emit: (e: BehavioralEvent) => void): () => void {
  const domain = location.hostname

  function wrap(data: TrackingResult): BehavioralEvent {
    return { id: crypto.randomUUID(), timestamp: Date.now(), domain, kind: 'tracking', data }
  }

  const teardowns = [
    setupSession((r) => emit(wrap(r))),
    setupScrollContinuity((r) => emit(wrap(r))),
    setupInteractionLoop((r) => emit(wrap(r))),
  ]

  return () => teardowns.forEach(fn => fn())
}
