import { useState, useEffect, useCallback, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Slide data ───────────────────────────────────────────────────────────────

const slides: Array<{
  label:  string
  title:  string
  body:   string
  note:   string
  visual: ReactNode
}> = [
  {
    label: 'Privacy',
    title: 'Private by design.',
    body:  'Everything runs locally with Gemma.\nYour browsing data never leaves your device.',
    note:  'No server. No account. No data leaving your browser — ever.',
    visual: <PopupMockup />,
  },
  {
    label: 'Adaptivity',
    title: 'Built for different vulnerabilities.',
    body:  'Different people struggle with different kinds of online pressure.\nAngel adapts to the patterns that tend to pull you deeper.',
    note:  'Your profile exists only on your device, evolving quietly over weeks.',
    visual: <NudgeMockup />,
  },
  {
    label: 'Resilience',
    title: 'Designed for what comes next.',
    body:  'Online influence systems are becoming more adaptive, emotional, and difficult to recognize.\nAngel evolves alongside them.',
    note:  'Built on research — not productivity metrics or screen time quotas.',
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
      className="py-20 px-6 border-y border-border/60 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-5xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            variants={fade}
            initial="enter"
            animate="center"
            exit="exit"
            className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16 items-center"
          >
            {/* Text side */}
            <div>
              <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-sage/70 mb-5">
                {slides[index].label}
              </span>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl leading-tight">
                {slides[index].title}
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-muted whitespace-pre-line">
                {slides[index].body}
              </p>
              <p className="mt-4 text-sm text-ink-secondary/60 italic">
                {slides[index].note}
              </p>

              {/* Navigation */}
              <div className="mt-10 flex items-center gap-5">
                <button
                  onClick={() => goTo(index - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-ink-muted hover:text-ink-primary transition-colors"
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

                <button
                  onClick={() => goTo(index + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-ink-muted hover:text-ink-primary transition-colors"
                  aria-label="Next"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                {/* Progress line */}
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
            <div className="w-full">
              {slides[index].visual}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

// ─── Mockup: Extension popup ──────────────────────────────────────────────────

function PopupMockup() {
  return (
    <div className="rounded-2xl bg-white shadow-xl shadow-ink-primary/6 border border-border/60 overflow-hidden max-w-xs mx-auto lg:mx-0 lg:ml-auto">
      {/* Browser chrome */}
      <div className="bg-neutral-100 px-4 py-2.5 flex items-center gap-2 border-b border-border/50">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <div className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <div className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        </div>
        <div className="flex-1 mx-3 h-5 rounded-md bg-neutral-200/80 flex items-center px-2">
          <div className="h-1.5 w-20 rounded-full bg-neutral-300" />
        </div>
        <div className="h-5 w-5 rounded bg-sage/20 flex items-center justify-center">
          <span className="text-[8px] font-medium text-sage">A</span>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
            <span className="text-sm font-medium text-ink-primary">Angel</span>
          </div>
          <div className="relative inline-flex h-5 w-9 rounded-full bg-sage">
            <span className="absolute right-1 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-white shadow" />
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          Quietly watching for moments worth pausing on.
        </p>

        <div className="mt-3 pt-3 border-t border-border/60">
          <p className="text-[10px] text-ink-muted mb-2">2 weeks of awareness data</p>
          <div className="space-y-1.5">
            <MetricRow label="Stepped away after nudge" value="64%" up />
            <MetricRow label="Paused to reflect"        value="48%" up />
            <MetricRow label="Avg time to recover"      value="11 min" />
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border/60">
          <div className="flex items-baseline justify-between mb-2.5">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-ink-muted">Presence</p>
            <p className="text-[10px] text-ink-muted">How present Angel feels.</p>
          </div>
          <div className="h-0.5 w-full rounded-full overflow-hidden"
            style={{ background: 'linear-gradient(to right, #4A7C59 45%, #E5E5E5 45%)' }} />
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-ink-muted">Quiet</span>
            <span className="text-[10px] text-ink-muted">Attentive</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          <span className="text-[10px] text-ink-muted">AI ready · GPU</span>
        </div>
      </div>
    </div>
  )
}

// ─── Mockup: In-page nudge card ───────────────────────────────────────────────

function NudgeMockup() {
  return (
    <div className="rounded-2xl bg-white shadow-xl shadow-ink-primary/6 border border-border/60 overflow-hidden max-w-xs mx-auto lg:mx-0 lg:ml-auto">
      {/* Simulated page content */}
      <div className="bg-neutral-50 px-5 py-5 border-b border-border/40 space-y-2">
        <div className="h-2 w-3/4 rounded-full bg-neutral-200" />
        <div className="h-2 w-full rounded-full bg-neutral-200" />
        <div className="h-2 w-5/6 rounded-full bg-neutral-200" />
        <div className="h-2 w-2/3 rounded-full bg-neutral-200" />
      </div>

      {/* Nudge card */}
      <div className="p-5">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          <span className="text-[10px] font-medium tracking-wide text-ink-muted">Angel</span>
        </div>

        <p className="text-[11px] leading-relaxed text-ink-muted italic mb-3">
          "This feed is designed to feel like it never ends."
        </p>

        <div className="h-px bg-border/60 mb-3" />

        <p className="text-sm font-medium leading-relaxed text-ink-primary mb-4">
          You've been scrolling for a while. What were you actually looking for?
        </p>

        <div className="flex items-center gap-2">
          <button className="flex-1 rounded-full bg-sage px-4 py-2 text-xs font-medium text-white">
            Take a moment
          </button>
          <button className="h-8 w-8 rounded-full border border-border flex items-center justify-center text-ink-muted">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mockup: Awareness building over time ─────────────────────────────────────

function AwarenessMockup() {
  const weeks = [
    { label: 'Wk 1', recovery: 28, depth: 4  },
    { label: 'Wk 2', recovery: 22, depth: 7  },
    { label: 'Wk 3', recovery: 17, depth: 11 },
    { label: 'Wk 4', recovery: 11, depth: 16 },
  ]
  const maxRecovery = 28
  const maxDepth    = 16

  return (
    <div className="rounded-2xl bg-white shadow-xl shadow-ink-primary/6 border border-border/60 overflow-hidden max-w-xs mx-auto lg:mx-0 lg:ml-auto">
      <div className="p-5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          <span className="text-[10px] font-medium tracking-wide text-ink-muted">Angel · Awareness over time</span>
        </div>
        <p className="text-xs text-ink-muted mb-5">Patterns building across 4 weeks</p>

        {/* Chart rows */}
        <div className="space-y-4">
          {weeks.map((w) => (
            <div key={w.label} className="space-y-1.5">
              <span className="text-[10px] text-ink-muted">{w.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-20 text-ink-muted shrink-0">Recovery time</span>
                <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sage/40 transition-all duration-700"
                    style={{ width: `${(w.recovery / maxRecovery) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-ink-muted w-8 text-right shrink-0">{w.recovery}m</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-20 text-ink-muted shrink-0">Loop depth</span>
                <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sage transition-all duration-700"
                    style={{ width: `${(w.depth / maxDepth) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-ink-muted w-8 text-right shrink-0">{w.depth}m</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-between">
          <span className="text-[10px] text-ink-muted">Recovery time ↓ · Loop resistance ↑</span>
          <span className="text-[10px] font-medium text-sage">Improving ↑</span>
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
