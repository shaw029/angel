import { useState } from 'react'
import { MSG } from '@shared/constants'
import type { CompanionAction, CompanionView } from '@shared/types'

export function CompanionPanel() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<CompanionView | null>(null)
  const [intent, setIntent] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const buttonClass = 'rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-sage hover:bg-sage/10 focus-visible:outline-sage disabled:opacity-50'

  async function load() {
    setOpen(true)
    setBusy(true)
    try {
      const result = await chrome.runtime.sendMessage({ type: MSG.GET_COMPANION }) as CompanionView
      if (!result || result.error) throw new Error(result?.error)
      setView(result)
      setIntent(result.session?.intent ?? '')
      setNotice('')
    } catch { setNotice('Could not reach this tab. Try again on a web page.') }
    finally { setBusy(false) }
  }

  async function act(action: CompanionAction, value?: string) {
    setBusy(true)
    try {
      const result = await chrome.runtime.sendMessage({
        type: MSG.COMPANION_ACTION, payload: { action, intent: value },
      }) as CompanionView
      if (!result || result.error || !result.available) throw new Error(result?.error)
      setView(result)
      setIntent(result.session?.intent ?? '')
      const messages: Partial<Record<CompanionAction, string>> = {
        intent: value?.trim() ? 'I’ll use your stated intent for this activity.' : 'Intent cleared. Exploring is fine too.',
        quiet: 'I’ll leave this activity alone.', resume: 'Gentle observations are welcome again.',
        save: 'Page saved temporarily for this tab.', forget: 'Saved page removed.',
      }
      setNotice(messages[action] ?? '')
    } catch { setNotice('Could not update this tab. Please try again.') }
    finally { setBusy(false) }
  }

  return <section className="mt-4 border-t border-neutral-100 pt-3">
    <button className="flex w-full items-center justify-between text-sm font-medium text-sage"
      aria-expanded={open} onClick={() => open ? setOpen(false) : void load()}>
      Ask Angel <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-xs leading-relaxed text-ink-muted">Tell me what you want from this moment, or correct something I noticed.</p>
      {!view && !busy && <button className={buttonClass} onClick={() => void load()}>Try again</button>}
      {view && !view.available && <p className="text-xs text-ink-muted">Open a web page to use these controls.</p>}
      {view?.available && <>
        <form onSubmit={event => { event.preventDefault(); void act('intent', intent) }}>
          <label htmlFor="companion-intent" className="block text-xs text-ink-secondary mb-1.5">What are you here for? <span className="text-ink-muted">Optional</span></label>
          <input id="companion-intent" value={intent} onChange={event => setIntent(event.target.value)} maxLength={160}
            placeholder="e.g. comparing headphones" disabled={busy}
            className="w-full rounded-lg border border-neutral-200 bg-white p-2 text-xs text-ink-primary focus:outline-sage" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['Learning', 'Relaxing', 'Just exploring'].map(choice => <button key={choice} type="button" className={buttonClass}
              disabled={busy} onClick={() => void act('intent', choice)}>{choice}</button>)}
          </div>
          <div className="mt-2 flex gap-2">
            <button type="submit" className={buttonClass} disabled={busy}>{view.session?.intent ? 'My goal changed' : 'Set intent'}</button>
            {view.session?.intent && <button type="button" className={buttonClass} disabled={busy} onClick={() => void act('intent', '')}>Clear intent</button>}
          </div>
        </form>
        {view.session?.lastExplanation && <details className="text-xs text-ink-secondary">
          <summary className="cursor-pointer text-sage">Why the last nudge?</summary>
          <p className="mt-2 leading-relaxed">{view.session.lastExplanation}</p>
        </details>}
        <button className={buttonClass} disabled={busy} onClick={() => void act(view.session?.quiet ? 'resume' : 'quiet')}>
          {view.session?.quiet ? 'Welcome nudges again' : 'I chose this — quiet for now'}
        </button>
        <p className="text-[10px] leading-relaxed text-ink-muted">Intent and quiet mode apply to this tab on this site. They reset after 30 minutes away or when you leave the site.</p>
        <div className="border-t border-neutral-100 pt-3">
          <button className={buttonClass} disabled={busy} onClick={() => void act('save')}>Save this page for later</button>
          {view.session?.returnPoint && <div className="mt-2">
            <p className="text-xs break-words text-ink-secondary">{view.session.returnPoint.title}</p>
            <div className="mt-2 flex gap-2">
              <button className={buttonClass} disabled={busy} onClick={() => void act('open')}>Open saved page</button>
              <button className={buttonClass} disabled={busy} onClick={() => void act('forget')}>Forget</button>
            </div>
          </div>}
          <p className="mt-2 text-[10px] text-ink-muted">Saved pages stay on this device until this tab or browser session closes.</p>
        </div>
      </>}
      <p role="status" className="text-xs leading-relaxed text-ink-secondary">{busy ? 'Updating…' : notice}</p>
    </div>}
  </section>
}
