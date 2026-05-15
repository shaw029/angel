import type { DomainCategory } from '@shared/types'

// Ordered by specificity — first match wins.
// Patterns test against the full hostname string, not just TLD.
const RULES: Array<[DomainCategory, RegExp]> = [
  ['ecommerce',    /\b(?:amazon|ebay|etsy|walmart|target|bestbuy|shopify|shop\.|store\.|checkout|cart\.)\b/i],
  ['social',       /\b(?:twitter|x\.com|reddit|facebook|instagram|tiktok|linkedin|mastodon|threads|pinterest|tumblr)\b/i],
  ['streaming',    /\b(?:youtube|netflix|twitch|hulu|disney(?:plus)?|spotify|soundcloud|vimeo|primevideo|hbomax|peacock|crunchyroll)\b/i],
  ['news',         /\b(?:nytimes|bbc\.|cnn\.|theguardian|reuters|apnews|bloomberg|wsj\.|techcrunch|wired|medium\.com|substack)\b/i],
  ['finance',      /\b(?:paypal|venmo|coinbase|robinhood|fidelity|schwab|vanguard|stripe|plaid|binance|kraken)\b/i],
  ['productivity', /\b(?:github|notion|docs\.google|sheets\.google|figma|jira|linear\.app|slack|asana|trello|confluence|gitlab|bitbucket)\b/i],
]

export function classifyDomain(domain: string): DomainCategory {
  for (const [category, pattern] of RULES) {
    if (pattern.test(domain)) return category
  }
  return 'other'
}
