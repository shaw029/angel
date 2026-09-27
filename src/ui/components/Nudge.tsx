import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SNOOZE } from '@shared/constants'
import type { Intervention, InterventionStyle, NudgeOutcome } from '@shared/types'

// ─── Self-contained styles ────────────────────────────────────────────────────
// The nudge renders inside a closed world (shadow root) — every style it needs
// ships in this block. No Tailwind, no page stylesheets: host-page CSS cannot
// bleed in (invisible-text bug) and Angel's CSS cannot leak out.

const STYLES = `
  .ca-root {
    pointer-events: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    color-scheme: light;
  }
  .ca-root * { box-sizing: border-box; }
  .ca-root button:focus-visible { outline: 2px solid #4A7C59; outline-offset: 3px; }
  .ca-detail { margin: 12px 18px 0; font-size: 12px; line-height: 1.55; color: #62625C; }
  .ca-link { border: 0; background: none; font: inherit; font-size: 12px; color: #38614A; cursor: pointer; padding: 4px 0; text-align: left; }
  .ca-pill-body { flex: 1; }
  .ca-pill-controls { display: flex; gap: 16px; margin-top: 5px; }
  @media (prefers-reduced-motion: reduce) {
    .ca-root *, .ca-dot--pulse { animation: none !important; transition: none !important; }
  }

  @keyframes ca-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.35; }
  }

  /* ── Full companion card ── */
  .ca-card {
    width: min(400px, calc(100vw - 40px));
    background: #FFFFFF;
    border: 1px solid #E3E3DF;
    border-radius: 20px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.24), 0 3px 12px rgba(0,0,0,0.10);
    overflow: hidden;
  }
  .ca-card--reflective { background: #F7FAF8; }

  .ca-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 15px 16px 0 18px;
  }
  .ca-brand { display: flex; align-items: center; gap: 8px; }
  .ca-name {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #9C9C96;
  }

  .ca-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #4A7C59;
    flex-shrink: 0;
  }
  .ca-dot--pulse { animation: ca-pulse 2.4s ease-in-out infinite; }
  .ca-dot--soft  { opacity: 0.45; }

  .ca-close {
    background: transparent;
    border: 0;
    margin: 0;
    padding: 0;
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    color: #ADADA7;
    cursor: pointer;
  }
  .ca-close:hover { color: #62625C; background: rgba(0,0,0,0.06); }

  .ca-obs {
    margin: 12px 18px 0;
    font-size: 13px;
    line-height: 1.55;
    color: #85857F;
  }
  .ca-msg {
    margin: 9px 18px 0;
    font-size: 15.5px;
    line-height: 1.6;
    color: #262622;
  }

  .ca-foot { padding: 16px 18px 16px; }
  .ca-action {
    display: block;
    width: 100%;
    text-align: left;
    background: #EBF3ED;
    color: #38614A;
    border: 0;
    border-radius: 12px;
    padding: 11px 14px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .ca-action:hover { background: #DEEBE2; }

  .ca-gotit {
    background: transparent;
    border: 0;
    padding: 0;
    font-family: inherit;
    font-size: 13px;
    color: #9C9C96;
    cursor: pointer;
  }
  .ca-gotit:hover { color: #62625C; }

  .ca-notnow {
    display: block;
    margin-top: 9px;
    background: transparent;
    border: 0;
    padding: 2px 0;
    text-align: left;
    font-family: inherit;
    font-size: 12.5px;
    color: #A8A8A2;
    cursor: pointer;
  }
  .ca-notnow:hover { color: #62625C; }

  /* Deferral sits beside the refusal, same weight — neither is the "right"
     answer, and neither should compete with the action button above them. */
  .ca-choices {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 9px;
  }
  .ca-choices .ca-notnow { margin-top: 0; }

  /* ── Subtle pill ── */
  .ca-pill {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    width: max-content;
    max-width: min(360px, calc(100vw - 40px));
    background: rgba(255,255,255,0.98);
    backdrop-filter: blur(10px);
    border: 1px solid #E3E3DF;
    border-radius: 16px;
    padding: 13px 15px;
    box-shadow: 0 10px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08);
  }
  .ca-pill .ca-dot { margin-top: 6px; }
  .ca-pill-msg {
    flex: 1;
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: #33332F;
  }
  .ca-pill .ca-close { width: 24px; height: 24px; margin-top: -1px; }
`

// ─── Component ───────────────────────────────────────────────────────────────

const DOT_CLASS: Record<InterventionStyle, string> = {
  gentle:     'ca-dot ca-dot--pulse',  // slow pulse = breathing, alive
  curious:    'ca-dot',                // steady = present but not urgent
  reflective: 'ca-dot ca-dot--soft',   // muted = quiet observation
}

interface NudgeProps {
  intervention: Intervention
  onDismiss: (outcome: NudgeOutcome) => void
  onSave?: () => Promise<boolean>
}

export function Nudge({ intervention, onDismiss, onSave }: NudgeProps) {
  const [visible, setVisible] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const dismissing = useRef(false)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { message, tone, tier, explanation, snoozeCount } = intervention

  function dismiss(outcome: NudgeOutcome = 'dismissed') {
    if (dismissing.current) return
    dismissing.current = true
    setVisible(false)
    dismissTimer.current = setTimeout(() => onDismiss(outcome), 260)
  }

  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current) }, [])
  useEffect(() => {
    if (hovered || focused || expanded || saving) return
    const timer = setTimeout(() => dismiss('ignored'), tier === 'subtle' ? 10_000 : 20_000)
    return () => clearTimeout(timer)
  }, [tier, hovered, focused, expanded, saving])

  async function save() {
    if (!onSave || saving) return
    setSaving(true)
    try { setSaveStatus(await onSave() ? 'Saved for this tab session. Find it in Ask Angel.' : 'Could not save. Please try again.') }
    catch { setSaveStatus('Could not save. Please try again.') }
    finally { setSaving(false) }
  }

  const showCard = tier === 'full' || expanded
  return (
    <div className="ca-root" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false) }}>
      <style>{STYLES}</style>
      <AnimatePresence>
        {visible && <motion.div key={showCard ? 'card' : 'pill'}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }} className={showCard ? 'ca-card' : 'ca-pill'}>
          {showCard ? <>
            <div className="ca-head">
              <div className="ca-brand"><span className={DOT_CLASS[tone]} aria-hidden="true" /><span className="ca-name">Angel</span></div>
              <button onClick={() => dismiss()} aria-label="Dismiss" className="ca-close"><CloseIcon /></button>
            </div>
            <p className="ca-msg" role="status">{message}</p>
            <div className="ca-detail">
              <button className="ca-link" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>Why this?</button>
              {expanded && <p>{explanation ?? 'I noticed a change in browsing activity, but I may have misunderstood your intent.'}</p>}
            </div>
            <div className="ca-foot">
              {onSave && <button className="ca-action" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save this page for later'}</button>}
              {saveStatus && <p role="status" className="ca-detail">{saveStatus}</p>}
              <div className="ca-choices">
                <button className="ca-link" onClick={() => dismiss('accepted')}>Helpful</button>
                <button className="ca-link" onClick={() => dismiss('rejected')}>I chose this — quiet for now</button>
                {(snoozeCount ?? 0) < SNOOZE.MAX && <button className="ca-link" onClick={() => dismiss('snoozed')}>Remind me in 5 minutes</button>}
              </div>
            </div>
          </> : <>
            <span className={DOT_CLASS[tone]} aria-hidden="true" />
            <div className="ca-pill-body">
              <p className="ca-pill-msg" role="status">{message}</p>
              <div className="ca-pill-controls">
                <button className="ca-link" onClick={() => setExpanded(true)} aria-expanded={false}>Why this?</button>
                <button className="ca-link" onClick={() => dismiss('rejected')}>I chose this</button>
              </div>
            </div>
            <button onClick={() => dismiss()} aria-label="Dismiss" className="ca-close"><CloseIcon /></button>
          </>}
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
