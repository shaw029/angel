import type { DetectionResult } from '@shared/types'

export const id = 'autoplay-video' as const

export function scan(): DetectionResult {
  const videos = document.querySelectorAll<HTMLVideoElement>('video')
  let mutedCount = 0
  let unmutedCount = 0

  for (const v of videos) {
    if (!v.hasAttribute('autoplay')) continue
    if (v.paused || v.ended) continue

    if (v.muted) mutedCount++
    else unmutedCount++
  }

  const total = mutedCount + unmutedCount
  if (total === 0) return { detector: 'autoplay-video', found: false, confidence: 0, count: 0 }

  // Unmuted autoplay is the stronger dark pattern signal; muted is more ambient
  const confidence = unmutedCount > 0 ? 0.92 : 0.72

  return { detector: 'autoplay-video', found: true, confidence, count: total }
}
