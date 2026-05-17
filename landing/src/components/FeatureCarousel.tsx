import { useState, useEffect, useCallback, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Slide data ───────────────────────────────────────────────────────────────

const slides: Array<{
  label:  string
  title:  string
  body:   string
  visual: ReactNode
}> = [
  {
    label:  'Privacy',
    title:  'Private by design.',
    body:   'Everything runs locally with Gemma.\nYour browsing data never leaves your device.',
    visual: <PopupMockup />,
  },
  {
    label:  'Adaptivity',
    title:  'Built for different vulnerabilities.',
    body:   'Different people struggle with different kinds of online pressure.\nAngel adapts to the patterns that tend to pull you deeper.',
    visual: <NudgeMockup />,
  },
  {
    label:  'Resilience',
    title:  'Designed for what comes next.',
    body:   'Online influence systems are becoming more adaptive, emotional, and difficult to recognize.\nAngel evolves alongside them.',
    visual: <AwarenessMockup />,
  },
]

// ─── Carousel ─────────────────────────────────────────────────────────────────

const fade = {
  enter:  { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.55, ease: 'easeOut' } },
  exit:   { opacity: 0, transition: { duration: 0.35, ease: 'easeIn'  } },
}

export function FeatureCarousel() {
  const [index,  setIndex]  = useState(0)
  const [paused, setPaused] = useState(false)

  const goTo = useCallback((i: number) => {
    setIndex(((i % slides.length) + slides.length) % slides.length)
  }, [])

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setIndex(i => (i + 1) % slides.length), 3000)
    return () => clearInterval(id)
  }, [paused])

  return (
    <section
      className="py-16 px-6 border-y border-border/60 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* px-12 creates space for the side arrows on desktop */}
      <div className="max-w-4xl mx-auto lg:px-12">
        <div className="relative">

          {/* Prev arrow — desktop only, vertically centered on card */}
          <button
            onClick={() => goTo(index - 1)}
            className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink-muted hover:border-ink-muted hover:text-ink-primary transition-colors shadow-sm z-10"
            aria-label="Previous"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Card */}
          <div className="rounded-2xl border border-border/60 bg-white shadow-[0_2px_20px_rgba(0,0,0,0.05)] overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                variants={fade}
                initial="enter"
                animate="center"
                exit="exit"
                className="grid grid-cols-1 lg:grid-cols-2 lg:min-h-[420px]"
              >
                {/* Text side */}
                <div className="p-8 lg:p-10 flex flex-col border-b border-border/60 lg:border-b-0 lg:border-r">
                  <div className="flex-1">
                    <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-sage/70 mb-5">
                      {slides[index].label}
                    </span>
                    <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl leading-tight">
                      {slides[index].title}
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-ink-muted whitespace-pre-line">
                      {slides[index].body}
                    </p>
                  </div>

                  {/* Dots + progress (mobile also gets arrows here) */}
                  <div className="mt-8 flex items-center gap-4">
                    {/* Mobile-only prev arrow */}
                    <button
                      onClick={() => goTo(index - 1)}
                      className="lg:hidden flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-ink-muted hover:text-ink-primary transition-colors"
                      aria-label="Previous"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>

                    <div className="flex items-center gap-2">
                      {slides.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => goTo(i)}
                          aria-label={`Slide ${i + 1}`}
                          className={`rounded-full transition-all duration-500 ${
                            i === index
                              ? 'h-1.5 w-8 bg-sage'
                              : 'h-1.5 w-1.5 bg-border hover:bg-ink-faint'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Mobile-only next arrow */}
                    <button
                      onClick={() => goTo(index + 1)}
                      className="lg:hidden flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-ink-muted hover:text-ink-primary transition-colors"
                      aria-label="Next"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>

                    {!paused && (
                      <div className="flex-1 overflow-hidden">
                        <motion.div
                          key={`p-${index}`}
                          className="h-px bg-sage/30 origin-left"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 3, ease: 'linear' }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Visual side */}
                <div className="p-8 lg:p-10 flex items-center justify-center bg-neutral-50/60">
                  {slides[index].visual}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Next arrow — desktop only, vertically centered on card */}
          <button
            onClick={() => goTo(index + 1)}
            className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-full h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink-muted hover:border-ink-muted hover:text-ink-primary transition-colors shadow-sm z-10"
            aria-label="Next"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

        </div>
      </div>
    </section>
  )
}

// ─── Mockup: Extension popup ──────────────────────────────────────────────────
// Matches the real Angel popup: toggle, insight metrics, presence slider, model badge.

function PopupMockup() {
  return (
    <div className="rounded-2xl bg-white shadow-xl shadow-ink-primary/6 border border-border/60 overflow-hidden w-[260px]">
      {/* Browser toolbar */}
      <div className="bg-neutral-100 px-3 py-2 flex items-center gap-2 border-b border-border/50">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-neutral-300" />
          <div className="h-2 w-2 rounded-full bg-neutral-300" />
          <div className="h-2 w-2 rounded-full bg-neutral-300" />
        </div>
        <div className="flex-1 mx-2 h-4 rounded bg-neutral-200/80" />
        <div className="h-5 w-5 rounded bg-sage/20 flex items-center justify-center">
          <span className="text-[8px] font-bold text-sage">A</span>
        </div>
      </div>

      {/* Popup body */}
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-sage animate-pulse" />
            <span className="text-[13px] font-medium text-ink-primary">Angel</span>
          </div>
          <div className="relative inline-flex h-5 w-9 rounded-full bg-sage items-center">
            <span className="absolute right-0.5 h-4 w-4 rounded-full bg-white shadow-sm" />
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-ink-muted mb-3">
          Quietly watching for moments worth pausing on.
        </p>

        {/* Insights */}
        <div className="pt-3 border-t border-border/60">
          <p className="text-[10px] text-ink-muted mb-2">2 weeks of awareness data</p>
          <div className="space-y-1.5">
            <MetricRow label="Loop exits after nudge"  value="64%" up />
            <MetricRow label="Nudges with reflection"  value="48%" up />
            <MetricRow label="Avg loop recovery"       value="11 min" />
          </div>
        </div>

        {/* Presence slider */}
        <div className="mt-3 pt-3 border-t border-border/60">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-ink-muted">Presence</p>
            <p className="text-[10px] text-ink-muted">How present Angel feels.</p>
          </div>
          <div
            className="h-0.5 w-full rounded-full overflow-hidden"
            style={{ background: 'linear-gradient(to right, #4A7C59 45%, #E5E5E5 45%)' }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-ink-muted">Quiet</span>
            <span className="text-[9px] text-ink-muted">Attentive</span>
          </div>
        </div>

        {/* Model badge */}
        <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          <span className="text-[10px] text-ink-muted">AI ready · GPU</span>
        </div>
      </div>
    </div>
  )
}

// ─── Mockup: In-page nudge card ───────────────────────────────────────────────
// Matches the real FullCard in Nudge.tsx — same structure, dimensions, styling.

function NudgeMockup() {
  return (
    <div className="flex flex-col items-center w-[268px]">
      {/* Simulated page content in the background */}
      <div className="w-full mb-3 rounded-xl bg-neutral-50 border border-border/40 px-4 py-3 space-y-1.5 opacity-50">
        <div className="h-1.5 w-3/4 rounded-full bg-neutral-200" />
        <div className="h-1.5 w-full rounded-full bg-neutral-200" />
        <div className="h-1.5 w-5/6 rounded-full bg-neutral-200" />
        <div className="h-1.5 w-2/3 rounded-full bg-neutral-200" />
      </div>

      {/* Actual nudge card — pixel-matched to FullCard */}
      <div className="w-full rounded-2xl border border-neutral-100 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.07),0_1px_4px_rgba(0,0,0,0.04)] select-none">
        {/* Header: tone dot + dismiss */}
        <div className="flex items-center justify-between px-4 pt-3.5">
          <span className="h-[5px] w-[5px] rounded-full bg-sage animate-pulse" />
          <button className="h-[18px] w-[18px] flex items-center justify-center rounded-full text-neutral-300" tabIndex={-1}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Observation */}
        <p className="px-4 pt-2.5 text-[11px] leading-[1.5] text-neutral-400">
          You've been on this feed for 18 minutes.
        </p>

        {/* Message */}
        <p className="px-4 pt-1.5 text-[13px] leading-[1.6] text-neutral-600">
          You can take a moment before deciding.
        </p>

        {/* Action */}
        <div className="px-4 pt-3 pb-3.5">
          <button className="w-full text-left text-[12px] font-medium text-sage px-3 py-1.5 rounded-lg bg-sage/10" tabIndex={-1}>
            Take a short break
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mockup: Awareness building over time ─────────────────────────────────────
// Popup view showing the insight panel's week-over-week pattern data.

function AwarenessMockup() {
  const weeks = [
    { label: 'Wk 1', recovery: 28, resistance: 15 },
    { label: 'Wk 2', recovery: 20, resistance: 38 },
    { label: 'Wk 3', recovery: 13, resistance: 60 },
    { label: 'Wk 4', recovery:  7, resistance: 82 },
  ]
  const maxRecovery   = 28
  const maxResistance = 82

  return (
    <div className="rounded-2xl bg-white shadow-xl shadow-ink-primary/6 border border-border/60 overflow-hidden w-[260px]">
      {/* Browser toolbar */}
      <div className="bg-neutral-100 px-3 py-2 flex items-center gap-2 border-b border-border/50">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-neutral-300" />
          <div className="h-2 w-2 rounded-full bg-neutral-300" />
          <div className="h-2 w-2 rounded-full bg-neutral-300" />
        </div>
        <div className="flex-1 mx-2 h-4 rounded bg-neutral-200/80" />
        <div className="h-5 w-5 rounded bg-sage/20 flex items-center justify-center">
          <span className="text-[8px] font-bold text-sage">A</span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          <span className="text-[11px] font-medium text-ink-primary">Angel</span>
        </div>
        <p className="text-[10px] text-ink-muted mb-4">4-week awareness summary</p>

        <div className="space-y-3.5">
          {weeks.map((w) => (
            <div key={w.label} className="space-y-1">
              <span className="text-[10px] font-medium text-ink-muted">{w.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] w-[62px] text-ink-muted/70 shrink-0">Avg recovery</span>
                <div className="flex-1 h-1 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sage/35 transition-all duration-700"
                    style={{ width: `${(w.recovery / maxRecovery) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-ink-muted w-7 text-right shrink-0">{w.recovery}m</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] w-[62px] text-ink-muted/70 shrink-0">Resistance</span>
                <div className="flex-1 h-1 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sage transition-all duration-700"
                    style={{ width: `${(w.resistance / maxResistance) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-ink-muted w-7 text-right shrink-0">{w.resistance}%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
          <span className="text-[9px] text-ink-muted">Recovery time ↓ · Resistance ↑</span>
          <span className="text-[9px] font-semibold text-sage">Improving ↑</span>
        </div>
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function MetricRow({ label, value, up }: { label: string; value: string; up?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-ink-muted">{label}</span>
      <span className="flex items-center gap-1">
        <span className="text-[11px] font-medium text-ink-secondary">{value}</span>
        {up && <span className="text-[10px] font-medium text-sage">↑</span>}
      </span>
    </div>
  )
}
