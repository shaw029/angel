import { motion } from 'framer-motion'

const GITHUB_URL = 'https://github.com/shaw029/angel'

const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay },
  }),
}

interface HeroProps {
  onInstall: () => void
}

export function Hero({ onInstall }: HeroProps) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-16">

      {/* Ambient background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full bg-sage/8 blur-3xl" />
        <div className="animate-float-slow2 absolute -bottom-24 -right-24 h-[500px] w-[500px] rounded-full bg-sage/6 blur-3xl" />
        <div className="animate-float-slow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px] rounded-full bg-amber-50/40 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-3xl mx-auto text-center">

        <motion.div
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-sage/20 bg-sage-light/60 px-4 py-1.5"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sage animate-pulse" />
          <span className="text-xs font-medium text-sage tracking-wide">On-device · Private by design</span>
        </motion.div>

        <motion.h1
          className="text-balance text-5xl font-semibold leading-[1.08] tracking-tight text-ink-primary sm:text-6xl lg:text-7xl"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0.1}
        >
          Built for your<br />digital resilience.
        </motion.h1>

        <motion.p
          className="mt-5 text-xl font-light text-ink-muted tracking-tight"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0.2}
        >
          The internet is changing faster than you think.
        </motion.p>

        <motion.p
          className="mt-6 text-base leading-relaxed text-ink-muted max-w-2xl mx-auto"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0.3}
        >
          The feeds you scroll, the notifications you open, the videos you stop to watch — increasingly they are being shaped by systems designed to learn what keeps you engaged, even when that engagement comes at the cost of your attention, well-being, or autonomy.
        </motion.p>

        <motion.p
          className="mt-4 text-base leading-relaxed text-ink-secondary max-w-2xl mx-auto"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0.4}
        >
          Most people have very little visibility into how these systems shape their behavior over time. Angel helps you stay aware and intentional while navigating increasingly persuasive digital environments.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0.5}
        >
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-ink-primary px-7 py-3 text-sm font-medium text-surface hover:bg-ink-secondary transition-colors duration-200"
          >
            <GitHubIcon />
            View on GitHub
          </a>
          <a
            href="#"
            className="inline-flex items-center gap-2 rounded-full border border-border px-7 py-3 text-sm font-medium text-ink-secondary hover:border-ink-muted hover:text-ink-primary transition-colors duration-200"
            aria-label="Add to Chrome — coming soon"
          >
            Add to Chrome
            <span className="rounded-sm bg-border px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">Soon</span>
          </a>
          <button
            onClick={onInstall}
            className="inline-flex items-center gap-2 rounded-full border border-border px-7 py-3 text-sm font-medium text-ink-secondary hover:border-ink-muted hover:text-ink-primary transition-colors duration-200"
          >
            <DownloadIcon />
            Install Locally
          </button>
        </motion.div>
      </div>

      {/* Browser popup mockup */}
      <motion.div
        className="relative z-10 mt-20 w-full max-w-xs mx-auto"
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        custom={0.65}
      >
        <PopupMockup />
      </motion.div>

      {/* Scroll hint */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.6 }}
      >
        <div className="h-8 w-px bg-gradient-to-b from-transparent to-border" />
        <span className="text-[10px] tracking-widest uppercase text-ink-faint">Scroll</span>
      </motion.div>
    </section>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function PopupMockup() {
  return (
    <div className="rounded-2xl bg-white/90 backdrop-blur-sm shadow-2xl shadow-ink-primary/8 border border-border/60 overflow-hidden">
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

      {/* Popup interior */}
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
            <MetricRow label="Loop exits after nudge" value="64%" up />
            <MetricRow label="Nudges with reflection" value="48%" up />
            <MetricRow label="Avg loop recovery" value="11 min" />
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border/60">
          <div className="flex items-baseline justify-between mb-2.5">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-ink-muted">Presence</p>
            <p className="text-[10px] text-ink-muted">How present Angel feels.</p>
          </div>
          <div className="h-0.5 w-full rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #4A7C59 45%, #E5E5E5 45%)' }} />
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
