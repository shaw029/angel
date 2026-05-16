import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const slides = [
  {
    label: 'Privacy',
    title: 'Private by design.',
    body: 'Everything runs locally with Gemma.\nYour browsing data never leaves your device.',
    note: 'No server. No account. No data leaving your browser — ever.',
  },
  {
    label: 'Adaptivity',
    title: 'Built for different vulnerabilities.',
    body: 'Different people struggle with different kinds of online pressure.\nAngel adapts to the patterns that tend to pull you deeper.',
    note: 'Your profile exists only on your device, evolving quietly over weeks.',
  },
  {
    label: 'Resilience',
    title: 'Designed for what comes next.',
    body: 'Online influence systems are becoming more adaptive, emotional, and difficult to recognize.\nAngel evolves alongside them.',
    note: 'Built on research — not productivity metrics or screen time quotas.',
  },
]

// Pure cross-fade — no lateral movement
const variants = {
  enter:  { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.6, ease: 'easeOut' } },
  exit:   { opacity: 0, transition: { duration: 0.4, ease: 'easeIn' } },
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
      className="py-24 px-6 border-y border-border/60"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-2xl mx-auto">

        {/* Slide area — fixed height prevents layout shift */}
        <div className="relative min-h-[200px] sm:min-h-[180px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              className="text-center"
            >
              {/* Eyebrow */}
              <span className="inline-block text-[11px] font-semibold tracking-widest uppercase text-sage/70 mb-6">
                {slides[index].label}
              </span>

              {/* Title */}
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl leading-tight">
                {slides[index].title}
              </h2>

              {/* Body — preserve newlines */}
              <p className="mt-6 text-lg leading-relaxed text-ink-muted max-w-lg mx-auto whitespace-pre-line">
                {slides[index].body}
              </p>

              {/* Supporting note */}
              <p className="mt-5 text-sm text-ink-secondary/60 italic">
                {slides[index].note}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="mt-12 flex items-center justify-center gap-5">
          <button
            onClick={() => goTo(index - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-ink-muted hover:text-ink-primary transition-colors"
            aria-label="Previous principle"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
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
            aria-label="Next principle"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Subtle auto-progress line */}
        {!paused && (
          <div className="mt-6 mx-auto max-w-xs overflow-hidden">
            <motion.div
              key={`progress-${index}`}
              className="h-px bg-sage/30 origin-left"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 7, ease: 'linear' }}
            />
          </div>
        )}
      </div>
    </section>
  )
}
