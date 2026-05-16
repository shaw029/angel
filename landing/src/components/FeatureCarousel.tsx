import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const slides = [
  {
    number: '01',
    title: 'Private by design.',
    body: 'Everything runs locally on-device with Gemma. What you do online stays with you.',
    accent: 'No server. No account. No data leaving your browser — ever.',
  },
  {
    number: '02',
    title: 'Built for different vulnerabilities.',
    body: 'Different people struggle with different kinds of online pressure. Angel learns what tends to pull you deeper.',
    accent: 'Your profile exists only on your device, adapting to your patterns over weeks.',
  },
  {
    number: '03',
    title: 'Designed for what comes next.',
    body: 'Online manipulation is becoming more personal, emotional, and difficult to recognize. As AI systems evolve, Angel evolves with them.',
    accent: 'Built on research — not productivity metrics or screen time quotas.',
  },
]

const variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

export function FeatureCarousel() {
  const [index, setIndex]   = useState(0)
  const [dir,   setDir]     = useState(1)
  const [paused, setPaused] = useState(false)

  const advance = useCallback((step: number) => {
    setDir(step)
    setIndex(i => (i + step + slides.length) % slides.length)
  }, [])

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => advance(1), 5500)
    return () => clearInterval(id)
  }, [paused, advance])

  return (
    <section
      className="py-28 px-6 bg-sage-light/30"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold tracking-widest uppercase text-ink-muted mb-4">Features</p>
        </div>

        {/* Slide */}
        <div className="relative overflow-hidden min-h-[200px]">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={index}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              className="text-center"
            >
              <span className="text-xs font-semibold tracking-widest text-ink-muted/50 select-none">
                {slides[index].number} / {String(slides.length).padStart(2, '0')}
              </span>

              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                {slides[index].title}
              </h2>

              <p className="mt-5 text-lg leading-relaxed text-ink-muted max-w-xl mx-auto">
                {slides[index].body}
              </p>

              <p className="mt-4 text-sm text-ink-secondary/70 max-w-md mx-auto italic">
                {slides[index].accent}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="mt-10 flex items-center justify-center gap-6">
          <button
            onClick={() => advance(-1)}
            className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-ink-muted hover:border-ink-muted hover:text-ink-primary transition-colors"
            aria-label="Previous"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div className="flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => { setDir(i > index ? 1 : -1); setIndex(i) }}
                className={`rounded-full transition-all duration-300 ${
                  i === index
                    ? 'h-2 w-6 bg-sage'
                    : 'h-2 w-2 bg-border hover:bg-ink-faint'
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={() => advance(1)}
            className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-ink-muted hover:border-ink-muted hover:text-ink-primary transition-colors"
            aria-label="Next"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
