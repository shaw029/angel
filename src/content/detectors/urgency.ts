import type { DetectionResult } from '@shared/types'
import { textWalker } from './utils'

// Each entry is a distinct urgency category; index = category key
const PATTERNS = [
  /\blimited[\s-]?(?:time|offer|stock|availability|supply)\b/i,
  /\b(?:act\s+now|don[''t]+\s+(?:wait|miss\s+out)|last\s+chance|today\s+only)\b/i,
  /\bhurry\b|\bends?\s+(?:tonight|today|soon)\b|\bone[\s-]day\s+(?:only|sale)\b/i,
  /\bonly\s+\d+\s+(?:left|remaining|available|in\s+stock)\b/i,
  /\b\d+\s+(?:other\s+)?(?:people|shoppers?|visitors?)\s+(?:are?\s+)?(?:viewing|watching|considering|looking)\b/i,
  /\bflash\s+sale\b|\blightning\s+deal\b|\bdoorbuster\b|\bblack\s+friday\b/i,
  /\b(?:expires?|offer\s+expires?|deal\s+expires?)\s+in\s+\d+/i,
] as const

export const id = 'urgency-language' as const

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
  if (count === 0) return { detector: 'urgency-language', found: false, confidence: 0, count: 0 }

  // Social-proof patterns (index 4) boost confidence — they're highly specific
  const hasSocialProof = hitCategories.has(4)
  const base = Math.min(0.45 + count * 0.10, 0.90)
  const confidence = hasSocialProof ? Math.min(base + 0.08, 0.95) : base

  return {
    detector: 'urgency-language',
    found: true,
    confidence,
    count,
    categories: [...hitCategories],
  }
}
