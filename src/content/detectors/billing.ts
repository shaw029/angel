import type { DetectionResult } from '@shared/types'
import { textWalker } from './utils'

// Each entry targets a distinct billing-language category.
// The index is the category key used by the compression pipeline.
const PATTERNS = [
  /\b(?:auto[\s-]?renew(?:al|s)?|recurring\s+(?:charge|payment|billing))\b/i,  // 0: auto-renew
  /\bsubscription\b/i,                                                           // 1: subscription
  /\bbilled?\s+(?:monthly|annually|yearly|weekly|every)\b/i,                    // 2: billing cadence
  /\bper\s+(?:month|mo\.?|year|yr\.?|week)\b/i,                                // 3: price-per-period
  /\$\s*\d+(?:\.\d{1,2})?\s*\/\s*(?:mo|month|yr|year)\b/i,                    // 4: price format
  /\bcontinues?\s+at\b|\brenews?\s+at\b|\brenewal\s+(?:price|rate)\b/i,        // 5: renewal terms
  /\bfree\s+trial\b|\btry\s+(?:free|for\s+free)\b|\b\d+[\s-]day\s+(?:free\s+)?trial\b/i, // 6: trial language
] as const

export const id = 'recurring-billing' as const

export function scan(): DetectionResult {
  const hitCategories = new Set<number>()

  const walker = textWalker()
  let node: Node | null

  while ((node = walker.nextNode())) {
    const text = (node as Text).nodeValue ?? ''
    if (text.length < 4) continue

    for (let i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i]!.test(text)) hitCategories.add(i)
    }

    if (hitCategories.size === PATTERNS.length) break
  }

  const count = hitCategories.size
  if (count === 0) return { detector: 'recurring-billing', found: false, confidence: 0, count: 0 }

  const confidence = Math.min(0.40 + count * 0.12, 0.95)
  return {
    detector: 'recurring-billing',
    found: true,
    confidence,
    count,
    categories: [...hitCategories],
  }
}
