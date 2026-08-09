import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SNOOZE } from '@shared/constants'
import type { Intervention, InterventionStyle, NudgeOutcome, SuggestedAction } from '@shared/types'

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

const ACTION_LABELS: Partial<Record<SuggestedAction, string>> = {
  pause_for_a_moment:    'Pause for a moment',
  let_this_rest:         'Let this rest for now',
  slow_this_down:        'Slow this down',
  take_your_time:        'Take your time',
  come_back_later:       'Come back to this later',
  one_thing_at_a_time:   'One thing at a time',
  take_a_breath:         'Take a breath',
  reset_attention:       'Reset your attention',
  check_in_with_yourself:'Check in with yourself',
  notice_how_you_feel:   'Notice how you feel',
}

const DOT_CLASS: Record<InterventionStyle, string> = {
  gentle:     'ca-dot ca-dot--pulse',  // slow pulse = breathing, alive
  curious:    'ca-dot',                // steady = present but not urgent
  reflective: 'ca-dot ca-dot--soft',   // muted = quiet observation
}

interface NudgeProps {
  intervention: Intervention
  onDismiss:    (outcome: NudgeOutcome) => void
}

export function Nudge({ intervention, onDismiss }: NudgeProps) {
  const [visible, setVisible] = useState(true)
  const [hovered, setHovered] = useState(false)
  const { message, tone, action, tier, observation, snoozeCount } = intervention

  function dismiss(outcome: NudgeOutcome = 'dismissed') {
    setVisible(false)
    setTimeout(() => onDismiss(outcome), 260)
  }

  // Auto-dismiss so a nudge never permanently blocks future ones. Reported as
  // 'ignored' — an unattended nudge must never be mistaken for an engaged one.
  // Hovering pauses the clock: someone reading is not ignoring.
  useEffect(() => {
    if (hovered) return
    const ms = tier === 'subtle' ? 10_000 : 20_000
    const t = setTimeout(() => dismiss('ignored'), ms)
    return () => clearTimeout(t)
  }, [tier, hovered])

  return (
    <div
      className="ca-root"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <style>{STYLES}</style>
      <AnimatePresence>
        {visible && (tier === 'full'
          ? <FullCard key="full" message={message} tone={tone} action={action} observation={observation} snoozeCount={snoozeCount} onDismiss={dismiss} />
          : <SubtlePill key="subtle" message={message} tone={tone} onDismiss={() => dismiss('dismissed')} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Full companion card ──────────────────────────────────────────────────────

interface FullCardProps {
  message:      string
  tone:         InterventionStyle
  action:       SuggestedAction
  observation?: string
  snoozeCount?: number
  onDismiss:    (outcome: NudgeOutcome) => void
}

function FullCard({ message, tone, action, observation, snoozeCount, onDismiss }: FullCardProps) {
  const actionLabel = ACTION_LABELS[action]

  // Deferral is offered a bounded number of times. Past the cap the button stops
  // rendering, so a nudge always resolves into a real signal instead of being
  // pushed forward indefinitely.
  const canSnooze = (snoozeCount ?? 0) < SNOOZE.MAX

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      initial={{ opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,   scale: 1    }}
      exit={{    opacity: 0, y: -8,  scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className={`ca-card${tone === 'reflective' ? ' ca-card--reflective' : ''}`}
    >
      {/* Header: identity + tone indicator + close */}
      <div className="ca-head">
        <div className="ca-brand">
          <span className={DOT_CLASS[tone]} aria-hidden="true" />
          <span className="ca-name">Angel</span>
        </div>
        <button onClick={() => onDismiss('dismissed')} aria-label="Dismiss" className="ca-close">
          <CloseIcon />
        </button>
      </div>

      {/* Observation — mechanic context, lighter than main message */}
      {observation && <p className="ca-obs">{observation}</p>}

      {/* Message */}
      <p className="ca-msg">{message}</p>

      {/* Footer */}
      <div className="ca-foot">
        {actionLabel ? (
          <button onClick={() => onDismiss('accepted')} className="ca-action">
            {actionLabel}
          </button>
        ) : (
          <button onClick={() => onDismiss('dismissed')} className="ca-gotit">
            Got it
          </button>
        )}

        {/* Two ways to decline, and they mean different things.
            "Not now" is the correction channel: one tap teaches Angel it read
            this moment wrong — backs off for the session and updates priors.
            "Remind me later" accepts the read and declines only the timing —
            the same nudge returns in five minutes. */}
        <div className="ca-choices">
          <button onClick={() => onDismiss('rejected')} className="ca-notnow">
            Not now — I chose to be here
          </button>
          {canSnooze && (
            <button onClick={() => onDismiss('snoozed')} className="ca-notnow">
              Remind me later
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Subtle pill ──────────────────────────────────────────────────────────────
// Ambient, non-demanding. Auto-dismisses after 10s. No action button — just presence.

interface SubtlePillProps {
  message:   string
  tone:      InterventionStyle
  onDismiss: () => void
}

function SubtlePill({ message, tone, onDismiss }: SubtlePillProps) {
  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0   }}
      exit={{    opacity: 0, y: -5  }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="ca-pill"
    >
      <span className={DOT_CLASS[tone]} aria-hidden="true" />
      <p className="ca-pill-msg">{message}</p>
      <button onClick={onDismiss} aria-label="Dismiss" className="ca-close">
        <CloseIcon />
      </button>
    </motion.div>
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
