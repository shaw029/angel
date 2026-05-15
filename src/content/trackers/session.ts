import type { TrackingResult } from '@shared/types'

// Emit at these page-time milestones (seconds)
const MILESTONES = [120, 300, 600, 1200, 1800, 3600] as const

export function setup(emit: (r: TrackingResult) => void): () => void {
  const start = Date.now()
  let idx = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function scheduleNext(): void {
    if (idx >= MILESTONES.length) return
    const targetMs = MILESTONES[idx]! * 1000
    const remaining = targetMs - (Date.now() - start)

    timer = setTimeout(() => {
      emit({ tracker: 'session-duration', value: MILESTONES[idx]!, unit: 'seconds' })
      idx++
      scheduleNext()
    }, Math.max(remaining, 0))
  }

  scheduleNext()

  return () => { if (timer) clearTimeout(timer) }
}
