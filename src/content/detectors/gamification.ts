import type { DetectionResult } from '@shared/types'
import { textWalker } from './utils'

// Sub-pattern categories — index is the category key used downstream
const PATTERNS = [
  /\bspin(?:\s+(?:the\s+)?wheel|\s+to\s+win|\s+for\s+(?:a\s+)?(?:prize|discount|offer))?\b/i,  // 0: spin-wheel language
  /\b(?:you'?ve?\s+won|you\s+win|prize|jackpot|lucky|winner|winning)\b/i,                        // 1: win/prize language
  /\bclaim(?:\s+(?:your|my|the)\s+(?:prize|reward|offer|discount|gift))?\b/i,                    // 2: claim language
  /\bguaranteed\s+(?:prize|win|reward|discount|offer)\b|\bunlock\s+(?:your|my|this)\b/i,         // 3: guaranteed/unlock
  /\benter\s+(?:your\s+)?email|\bsign\s+up\s+to\s+(?:win|spin|claim)\b/i,                       // 4: email-gate framing
] as const

// Returns true when a modal/overlay structure containing a canvas or SVG is present.
// Spin wheels are almost always rendered in canvas or SVG inside an overlay.
function hasWheelStructure(): boolean {
  // Semantic modal first
  if (document.querySelector('[role="dialog"][open], [aria-modal="true"], dialog[open]')) return true

  // Canvas or SVG inside a class-named overlay (non-semantic popups)
  const spinEl = document.querySelector('canvas, svg')
  if (!spinEl) return false
  return spinEl.closest('[class*="modal"],[class*="popup"],[class*="overlay"],[class*="wheel"],[class*="spin"]') !== null
}

export const id = 'gamification-popup' as const

export function scan(): DetectionResult {
  const hitCategories = new Set<number>()

  const walker = textWalker()
  let node: Node | null

  while ((node = walker.nextNode())) {
    const text = (node as Text).nodeValue ?? ''
    if (text.length < 3) continue

    for (let i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i]!.test(text)) hitCategories.add(i)
    }

    if (hitCategories.size === PATTERNS.length) break
  }

  const count = hitCategories.size
  if (count === 0) return { detector: 'gamification-popup', found: false, confidence: 0, count: 0 }

  const hasWheelEl = hasWheelStructure()

  // Spin language (0) is highly specific
  const hasSpinLanguage = hitCategories.has(0)
  let confidence = hasSpinLanguage
    ? Math.min(0.55 + count * 0.08, 0.90)
    : Math.min(0.30 + count * 0.10, 0.80)

  if (hasWheelEl) confidence = Math.min(confidence + 0.10, 0.95)

  return {
    detector: 'gamification-popup',
    found: true,
    confidence,
    count,
    categories: [...hitCategories],
  }
}
