import { OFFSCREEN_URL } from '@shared/constants'

let creating: Promise<void> | null = null

export async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return

  if (creating) {
    await creating
    return
  }

  creating = chrome.offscreen.createDocument({
    url: chrome.runtime.getURL(OFFSCREEN_URL),
    // DOM_SCRAPING is the closest available reason for WebGPU inference context
    reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
    justification: 'Local AI inference via WebGPU (Gemma)',
  })

  try { await creating } finally { creating = null }
}

export async function closeOffscreenDocument(): Promise<void> {
  if (creating) await creating.catch(() => undefined)
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
}
