import type { TrackingResult } from '@shared/types'

const PAUSE_THRESHOLD_MS      = 2_500
const SESSION_FLAG_THRESHOLD_S = 30
const VELOCITY_WINDOW_MS      = 1_000
const DOOM_SCROLL_PX_S        = 2_500

// ── Zero-allocation velocity ring buffer ──────────────────────────────────────
// Float64Array avoids per-sample object allocation and GC pressure during fast scroll.
const RING_CAP = 64
const ringY    = new Float64Array(RING_CAP)
const ringT    = new Float64Array(RING_CAP)
let   ringHead = 0
let   ringLen  = 0

function ringPush(y: number, t: number): void {
  const slot = (ringHead + ringLen) % RING_CAP
  ringY[slot] = y
  ringT[slot] = t
  if (ringLen < RING_CAP) {
    ringLen++
  } else {
    ringHead = (ringHead + 1) % RING_CAP  // overwrite oldest
  }
}

function ringEvict(now: number): void {
  while (ringLen > 1 && now - ringT[ringHead] > VELOCITY_WINDOW_MS) {
    ringHead = (ringHead + 1) % RING_CAP
    ringLen--
  }
}

function ringVelocity(): number {
  if (ringLen < 2) return 0
  const lastIdx = (ringHead + ringLen - 1) % RING_CAP
  const dt = (ringT[lastIdx]! - ringT[ringHead]!) / 1000
  if (dt <= 0) return 0
  return Math.abs(ringY[lastIdx]! - ringY[ringHead]!) / dt
}

// ─────────────────────────────────────────────────────────────────────────────

export function setup(emit: (r: TrackingResult) => void): () => void {
  let sessionStart:     number | null = null
  let flaggedSession  = false
  let flaggedVelocity = false
  let pauseTimer:       ReturnType<typeof setTimeout> | null = null
  let rafId:            number | null = null

  function processScroll(): void {
    const now = Date.now()
    const y   = window.scrollY

    ringPush(y, now)
    ringEvict(now)

    if (!sessionStart) {
      sessionStart     = now
      flaggedSession   = false
      flaggedVelocity  = false
    }

    // Reset pause timer on every processed frame
    if (pauseTimer) clearTimeout(pauseTimer)
    pauseTimer = setTimeout(() => {
      if (sessionStart !== null) {
        const duration = now - sessionStart
        sessionStart = null
        if (duration >= SESSION_FLAG_THRESHOLD_S * 1000 && !flaggedSession) {
          emit({ tracker: 'scroll-continuity', value: Math.round(duration / 1000), unit: 'seconds' })
        }
      }
    }, PAUSE_THRESHOLD_MS)

    const sessionDuration = sessionStart ? now - sessionStart : 0
    if (sessionDuration >= SESSION_FLAG_THRESHOLD_S * 1000 && !flaggedSession) {
      flaggedSession = true
      emit({ tracker: 'scroll-continuity', value: Math.round(sessionDuration / 1000), unit: 'seconds' })
    }

    if (!flaggedVelocity) {
      const vel = ringVelocity()
      if (vel >= DOOM_SCROLL_PX_S) {
        flaggedVelocity = true
        emit({ tracker: 'scroll-continuity', value: Math.round(vel), unit: 'px-per-second' })
      }
    }
  }

  // RAF throttle: collapses burst scroll events to one calculation per animation frame (~16ms).
  // Eliminates object allocations and velocity math at native scroll-event frequency (100s/sec).
  function onScroll(): void {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      processScroll()
    })
  }

  window.addEventListener('scroll', onScroll, { passive: true })

  return () => {
    window.removeEventListener('scroll', onScroll)
    if (pauseTimer) clearTimeout(pauseTimer)
    if (rafId !== null) cancelAnimationFrame(rafId)
  }
}
