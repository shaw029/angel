import type { DetectionResult } from '@shared/types'

const NEAR_BOTTOM_RATIO = 0.82  // within 18% of bottom
const SAMPLE_GAP_MS = 600       // min ms between height samples

const heightSamples: number[] = []
let growthEvents = 0            // times height grew while near bottom
let lastSampleAt = 0

export const id = 'infinite-scroll' as const

// Called by the orchestrator's scroll listener
export function onScroll(): void {
  const now = Date.now()
  if (now - lastSampleAt < SAMPLE_GAP_MS) return
  lastSampleAt = now

  const h = document.body.scrollHeight
  const pos = window.scrollY + window.innerHeight

  if (heightSamples.length > 8) heightSamples.shift()
  const prev = heightSamples[heightSamples.length - 1] ?? h
  heightSamples.push(h)

  const grew = h > prev
  const nearBottom = h > 0 && pos / h > NEAR_BOTTOM_RATIO
  if (grew && nearBottom) growthEvents++
}

export function scan(): DetectionResult {
  if (growthEvents > 0) {
    const confidence = growthEvents >= 3 ? 0.92 : 0.75
    return { detector: 'infinite-scroll', found: true, confidence, count: growthEvents }
  }

  // Structural fallback: look for common infinite-scroll DOM indicators
  if (hasSentinelElement()) {
    return { detector: 'infinite-scroll', found: true, confidence: 0.50, count: 1 }
  }

  return { detector: 'infinite-scroll', found: false, confidence: 0, count: 0 }
}

function hasSentinelElement(): boolean {
  // Aria-busy on list containers indicates async loading
  if (document.querySelector('[aria-busy="true"] li, [aria-busy="true"] article')) return true
  // Common class/attribute patterns used by infinite scroll libraries
  if (document.querySelector('[data-next-page], [data-infinite], [data-page]')) return true
  // Loading spinner or skeleton at the very bottom of the document
  const last = document.body.lastElementChild
  if (!last) return false
  const cls = last.className.toLowerCase()
  return cls.includes('loading') || cls.includes('spinner') || cls.includes('skeleton')
}
