const CACHE_KEY        = 'ca_recent_phrases'
const MAX_PHRASES      = 8   // ring buffer size — enough to avoid repetition without bloating
const EXPORT_TO_PROMPT = 3   // how many phrases to inject into the [avoid] line

/** Fetches recently used intervention phrases from session storage. */
export async function getRecentPhrases(): Promise<string[]> {
  try {
    const result = await chrome.storage.session.get(CACHE_KEY)
    const stored = result[CACHE_KEY] as string[] | undefined
    return (stored ?? []).slice(-EXPORT_TO_PROMPT)
  } catch {
    return []
  }
}

/** Appends a phrase to the session ring buffer; drops oldest when full. */
export async function recordPhrase(phrase: string): Promise<void> {
  try {
    const result  = await chrome.storage.session.get(CACHE_KEY)
    const stored  = (result[CACHE_KEY] as string[] | undefined) ?? []
    const updated = [...stored, phrase].slice(-MAX_PHRASES)
    await chrome.storage.session.set({ [CACHE_KEY]: updated })
  } catch {
    // Session storage failure is non-critical
  }
}
