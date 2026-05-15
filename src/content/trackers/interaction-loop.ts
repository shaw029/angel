import type { TrackingResult } from '@shared/types'

const WINDOW_MS       = 3_000
const RAPID_THRESHOLD = 8
const EMIT_COOLDOWN_MS = 15_000

export function setup(emit: (r: TrackingResult) => void): () => void {
  // Pre-allocated fixed-size ring buffer — no per-event array allocation.
  // RAPID_THRESHOLD + 1 slots is always enough: we only care if count >= threshold.
  const MAX = RAPID_THRESHOLD + 4
  const buf  = new Float64Array(MAX)
  let head   = 0  // index of oldest entry
  let tail   = 0  // index of next write slot (not yet written)
  let lastEmit = 0

  function record(): void {
    const now = Date.now()

    // Write new timestamp
    buf[tail % MAX] = now
    tail++

    // Evict entries outside the sliding window from the front
    while (head < tail && now - buf[head % MAX] > WINDOW_MS) head++

    const count = tail - head
    if (count >= RAPID_THRESHOLD && now - lastEmit > EMIT_COOLDOWN_MS) {
      lastEmit = now
      emit({ tracker: 'interaction-loop', value: count, unit: 'count' })
    }
  }

  window.addEventListener('click',   record)
  window.addEventListener('keydown', record)

  return () => {
    window.removeEventListener('click',   record)
    window.removeEventListener('keydown', record)
  }
}
