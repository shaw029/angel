import { motion } from 'framer-motion'

const STORE_URL = 'https://chromewebstore.google.com/detail/geemggebjlbjnkhgbgloldmnfefoghip'

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
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 pt-20 pb-12">

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
          Angel watches the one thing that matters — whether your session still serves the intent you arrived with. It judges the trajectory, never the content: a lecture, a PDF, a chosen film are yours. When the environment starts steering instead, Angel quietly says so.
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
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-ink-primary px-7 py-3 text-sm font-medium text-surface hover:bg-ink-secondary transition-colors duration-200"
          >
            Add to Chrome
          </a>
          <button
            onClick={onInstall}
            className="inline-flex items-center gap-2 rounded-full border border-border px-7 py-3 text-sm font-medium text-ink-secondary hover:border-ink-muted hover:text-ink-primary transition-colors duration-200"
          >
            <DownloadIcon />
            Install from source
          </button>
        </motion.div>

        {/* Demo video */}
        <motion.div
          className="mt-12 w-full max-w-3xl mx-auto rounded-2xl overflow-hidden border border-border shadow-2xl"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0.7}
        >
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/eG2AQLBvVYY?si=wahFTc-Uq7IG8CYY"
              title="Angel demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </motion.div>
      </div>

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
