import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Intervention, InterventionStyle, SuggestedAction } from '@shared/types'

// ─── Style maps (full tier) ───────────────────────────────────────────────────

const CARD_STYLES: Record<InterventionStyle, string> = {
  gentle:     'bg-white border-neutral-100',
  curious:    'bg-white border-neutral-100',
  reflective: 'bg-sage-light border-sage/20',
}

const DOT_STYLES: Record<InterventionStyle, string> = {
  gentle:     'bg-sage animate-pulse',  // slow pulse = breathing, alive
  curious:    'bg-sage',                // steady = present but not urgent
  reflective: 'bg-sage/40',            // muted = quiet observation
}

const TEXT_STYLES: Record<InterventionStyle, string> = {
  gentle:     'text-neutral-600',
  curious:    'text-neutral-700',
  reflective: 'text-neutral-600',
}

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

// ─── Component ───────────────────────────────────────────────────────────────

interface NudgeProps {
  intervention: Intervention
  onDismiss:    (outcome: 'accepted' | 'dismissed') => void
}

export function Nudge({ intervention, onDismiss }: NudgeProps) {
  const [visible, setVisible] = useState(true)
  const { message, tone, action, tier, observation } = intervention

  function dismiss(outcome: 'accepted' | 'dismissed' = 'dismissed') {
    setVisible(false)
    setTimeout(() => onDismiss(outcome), 260)
  }

  // Auto-dismiss: subtle after 7 s, full after 20 s so it never permanently blocks future nudges
  useEffect(() => {
    const ms = tier === 'subtle' ? 7_000 : 20_000
    const t = setTimeout(dismiss, ms)
    return () => clearTimeout(t)
  }, [tier])

  return (
    <AnimatePresence>
      {visible && (tier === 'full'
        ? <FullCard key="full" message={message} tone={tone} action={action} observation={observation} onDismiss={dismiss} />
        : <SubtlePill key="subtle" message={message} tone={tone} onDismiss={() => dismiss('dismissed')} />
      )}
    </AnimatePresence>
  )
}

// ─── Full companion card (confidence ≥ 0.8) ──────────────────────────────────

interface FullCardProps {
  message:      string
  tone:         InterventionStyle
  action:       SuggestedAction
  observation?: string
  onDismiss:    (outcome: 'accepted' | 'dismissed') => void
}

function FullCard({ message, tone, action, observation, onDismiss }: FullCardProps) {
  const actionLabel = ACTION_LABELS[action]

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: 6,  scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className={`
        w-[268px] rounded-2xl border pointer-events-auto
        shadow-[0_2px_16px_rgba(0,0,0,0.07),0_1px_4px_rgba(0,0,0,0.04)]
        antialiased select-none
        ${CARD_STYLES[tone]}
      `}
    >
      {/* Header: tone indicator + close */}
      <div className="flex items-center justify-between px-4 pt-3.5">
        <span className={`h-[5px] w-[5px] rounded-full ${DOT_STYLES[tone]}`} aria-hidden="true" />
        <button
          onClick={() => onDismiss('dismissed')}
          aria-label="Dismiss"
          className="
            h-[18px] w-[18px] flex items-center justify-center rounded-full
            text-neutral-300 hover:text-neutral-500 hover:bg-black/[0.05]
            transition-colors duration-150
          "
        >
          <CloseIcon />
        </button>
      </div>

      {/* Observation — mechanic context, lighter than main message */}
      {observation && (
        <p className="px-4 pt-2.5 text-[11px] leading-[1.5] font-normal text-neutral-400">
          {observation}
        </p>
      )}

      {/* Message */}
      <p className={`px-4 ${observation ? 'pt-1.5' : 'pt-2.5'} text-[13px] leading-[1.6] font-normal ${TEXT_STYLES[tone]}`}>
        {message}
      </p>

      {/* Footer */}
      <div className="px-4 pt-3 pb-3.5">
        {actionLabel ? (
          <button
            onClick={() => onDismiss('accepted')}
            className="
              w-full text-left text-[12px] font-medium text-sage
              px-3 py-1.5 rounded-lg bg-sage/10 hover:bg-sage/15
              transition-colors duration-150
            "
          >
            {actionLabel}
          </button>
        ) : (
          <button
            onClick={() => onDismiss('dismissed')}
            className="text-[12px] text-neutral-400 hover:text-neutral-500 transition-colors duration-150"
          >
            Got it
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── Subtle pill (0.5 ≤ confidence < 0.8, or full downgraded by cooldown) ─────
// Ambient, non-demanding. Auto-dismisses after 7s. No action button — just presence.

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
      initial={{ opacity: 0, y: 8  }}
      animate={{ opacity: 1, y: 0  }}
      exit={{    opacity: 0, y: 4  }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="
        flex items-start gap-2.5 px-3 py-2.5 pointer-events-auto
        rounded-xl border border-neutral-100
        bg-white/88 backdrop-blur-[6px]
        shadow-[0_1px_8px_rgba(0,0,0,0.06)]
        max-w-[224px] antialiased select-none
      "
    >
      <span
        className={`mt-[3px] h-[5px] w-[5px] flex-shrink-0 rounded-full ${DOT_STYLES[tone]}`}
        aria-hidden="true"
      />
      <p className="flex-1 text-[12px] leading-[1.5] text-neutral-500 line-clamp-2">
        {message}
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="
          mt-[1px] flex-shrink-0 h-[16px] w-[16px] flex items-center justify-center
          rounded-full text-neutral-300 hover:text-neutral-500 hover:bg-black/[0.05]
          transition-colors duration-150
        "
      >
        <CloseIcon />
      </button>
    </motion.div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
