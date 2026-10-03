import { useCallback, useEffect, useRef, useState } from 'react'
import { MSG } from '@shared/constants'
import { detectModelDevice, formatGB, getModelPreference, modelDownloadBytes } from '@shared/model-plan'
import type { ModelSetupView } from '@shared/types'

const button = 'rounded-lg px-3 py-2 text-xs font-medium focus-visible:outline-sage disabled:opacity-50'

// The model runs only with WebGPU: the bundled CPU runtime cannot run it.
// `gpu` is null while the popup is still checking for a WebGPU adapter.
export function ModelSetupCard({ view, gpu, busy = false, notice = '', onAction }: {
  view: ModelSetupView; gpu: boolean | null; busy?: boolean; notice?: string
  onAction: (action: 'enable' | 'defer' | 'cancel') => void
}) {
  const [example, setExample] = useState(false)
  const status = view.status
  const active = ['checking', 'downloading', 'loading'].includes(status.phase)
  const ready = view.preference.choice === 'enabled' && (status.phase === 'ready' || status.phase === 'standby')
  const deferred = view.preference.choice === 'deferred'
  const [expanded, setExpanded] = useState(false)
  const full = !deferred || expanded
  const size = formatGB(modelDownloadBytes('webgpu'))

  return <section className="mt-4 rounded-xl border border-sage/20 bg-sage/5 p-3" aria-label="Local AI setup">
    {ready ? <>
      <h2 className="text-sm font-medium text-sage">Angel is ready</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-secondary">AI runs on this device. Your nudge switch and quiet preferences still apply.</p>
      {status.phase === 'standby' && <p className="mt-1 text-xs leading-relaxed text-ink-secondary">Resting to save memory. It loads again when a page needs a judgment.</p>}
      {status.phase === 'ready' && status.storageWarning && <p className="mt-2 text-xs text-ink-secondary">{status.storageWarning}</p>}
      <button className={`${button} mt-2 border border-neutral-200`} disabled={busy} onClick={() => onAction('cancel')}>Turn off local AI</button>
    </> : active ? <div role="status" aria-live="polite">
      <h2 className="text-sm font-medium text-ink-primary">{status.phase === 'downloading' ? 'Downloading local AI' : status.phase === 'checking' ? 'Checking saved model files…' : 'Preparing AI on this device…'}</h2>
      {status.phase === 'downloading' && <>
        <p className="mt-2 text-xs tabular-nums text-ink-secondary">{formatGB(status.loadedBytes ?? 0)} / approximately {formatGB(status.totalBytes ?? modelDownloadBytes('webgpu'))}</p>
        <progress className="mt-2 h-2 w-full accent-sage" max={1} value={Math.min(status.progress, 1)} aria-label="Model files available" />
        <p className="mt-1 text-[10px] text-ink-muted">Includes complete files already saved on this device.</p>
      </>}
      <p className="mt-2 text-xs leading-relaxed text-ink-secondary">You can close this popup and keep browsing. Setup continues while Chrome is open.</p>
      <button className={`${button} mt-2 border border-neutral-200 bg-white`} disabled={busy} onClick={() => onAction('cancel')}>Cancel setup</button>
    </div> : gpu === false && status.phase !== 'error' ? <>
      <h2 className="text-sm font-medium text-ink-primary">Local AI is not available in this browser</h2>
      <p className="mt-2 text-xs leading-relaxed text-ink-secondary">Angel's AI needs WebGPU, which this browser or device does not provide. Nothing will be downloaded.</p>
    </> : full ? <>
      <h2 className="text-sm font-medium text-ink-primary">A companion that considers the context</h2>
      <p className="mt-2 text-xs leading-relaxed text-ink-secondary">A long session might be studying, relaxing, or drifting from what you intended. Local AI considers that context before offering a gentle nudge. It can be wrong; your choice comes first.</p>
      <p className="mt-2 text-xs font-medium text-sage">Your browsing context stays on this device. No account or cloud inference.</p>
      <p className="mt-3 text-xs leading-relaxed text-ink-secondary"><strong>Initial download: about {size}.</strong> Cached for future use. Use an unmetered connection and allow extra space for setup. Speed and support depend on your device.</p>
      <p className="mt-1 text-[10px] leading-relaxed text-ink-muted">Downloads model files from Hugging Face. Cleared files or a new model version may need another download; Angel will ask first. Existing complete files may be reused.</p>
      {status.phase === 'error' && <p role="alert" className="mt-2 text-xs leading-relaxed text-ink-secondary">{status.reason}</p>}
      <div className="mt-3 flex flex-col gap-2">
        <button className={`${button} bg-sage text-white`} disabled={busy || gpu !== true} onClick={() => onAction('enable')}>{status.phase === 'error' ? 'Retry AI setup' : 'Download and enable Angel'}</button>
        <button className={`${button} border border-neutral-200 bg-white text-ink-secondary`} disabled={busy} onClick={() => { setExpanded(false); onAction('defer') }}>Not now</button>
      </div>
    </> : <>
      <p className="text-xs leading-relaxed text-ink-secondary">Local AI is off. Your controls and saved return points are available.</p>
      <button className={`${button} mt-2 border border-neutral-200 bg-white text-sage`} onClick={() => setExpanded(true)}>Review AI setup</button>
    </>}
    {!ready && <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">{gpu === false ? 'Proactive nudges need local AI.' : 'Proactive nudges stay paused until AI is ready.'} Ask Angel and saved return points remain available.</p>}
    <button className="mt-3 text-xs text-sage underline underline-offset-2" aria-expanded={example} onClick={() => setExample(!example)}>{example ? 'Hide example' : 'See an example'}</button>
    {example && <div className="mt-2 space-y-2 rounded-lg bg-white p-3 text-xs leading-relaxed text-ink-secondary">
      <p className="font-medium">Illustration — not an AI result about this page</p>
      <p><strong>Studying a lecture:</strong> a long session may be intentional. Angel is designed to stay quiet.</p>
      <p><strong>Browsing moves away from your stated task:</strong> Angel may offer a gentle check-in. You can dismiss it or say “I chose this.”</p>
      <p className="rounded-lg border border-neutral-200 p-2">“This page keeps adding content. Still how you want to spend this moment?”</p>
      <p>No blocking or enforced breaks. These examples describe intended behavior, not guaranteed accuracy.</p>
    </div>}
    {notice && <p role="alert" className="mt-2 text-xs text-ink-secondary">{notice}</p>}
  </section>
}

export function ModelSetup({ onReady }: { onReady: (ready: boolean) => void }) {
  const [view, setView] = useState<ModelSetupView | null>(null)
  const [gpu, setGpu] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const live = useRef(true)
  const refreshId = useRef(0)
  const refresh = useCallback(async () => {
      const id = ++refreshId.current
      const preference = await getModelPreference()
      const { modelStatus } = await chrome.storage.session.get('modelStatus')
      if (live.current && id === refreshId.current) setView({ preference, status: preference.choice === 'enabled' ? modelStatus ?? { phase: 'idle' } : { phase: 'idle' } })
  }, [])
  useEffect(() => {
    live.current = true
    const changed = () => { void refresh().catch(() => undefined) }
    chrome.storage.local.onChanged.addListener(changed)
    chrome.storage.session.onChanged.addListener(changed)
    void Promise.all([chrome.runtime.sendMessage({ type: MSG.GET_MODEL_SETUP }), detectModelDevice()]).then(async ([result, device]) => {
      if (!live.current) return
      if (!result || result.error) throw new Error()
      setGpu(device === 'webgpu')
      await refresh()
    }).catch(() => { if (live.current) setNotice('Could not reach Angel. Close and reopen this popup to retry.') })
    return () => {
      live.current = false
      chrome.storage.local.onChanged.removeListener(changed)
      chrome.storage.session.onChanged.removeListener(changed)
    }
  }, [refresh])
  useEffect(() => { onReady(view?.preference.choice === 'enabled' && (view.status.phase === 'ready' || view.status.phase === 'standby')) }, [view, onReady])
  async function act(action: 'enable' | 'defer' | 'cancel') {
    setBusy(true); setNotice('')
    try {
      const result = await chrome.runtime.sendMessage({ type: MSG.SET_MODEL_SETUP, payload: { action, device: 'webgpu' } })
      if (!result || result.error) throw new Error()
      await refresh()
    } catch { setNotice('Could not update AI setup. Please try again.') }
    finally { setBusy(false) }
  }
  return view ? <ModelSetupCard view={view} gpu={gpu} busy={busy} notice={notice} onAction={action => void act(action)} />
    : <p role="status" className="mt-4 text-xs text-ink-muted">{notice || 'Checking AI setup…'}</p>
}
