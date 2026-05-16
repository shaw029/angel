import { motion } from 'framer-motion'

const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.25, 0.1, 0.25, 1] } },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
}

export function PrivacySection() {
  return (
    <section className="bg-dark-bg text-white py-28 px-6 overflow-hidden">
      <div className="max-w-5xl mx-auto">

        <motion.div
          className="grid gap-16 lg:grid-cols-2 lg:gap-24 items-center"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {/* Left: Copy */}
          <div>
            <motion.div
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1.5"
              variants={fadeUp}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-sage" />
              <span className="text-xs font-medium text-sage/90 tracking-wide">Gemma · On-device inference</span>
            </motion.div>

            <motion.h2
              className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl"
              variants={fadeUp}
            >
              Your data never leaves your device.
            </motion.h2>

            <motion.p
              className="mt-5 text-base leading-relaxed text-white/60"
              variants={fadeUp}
            >
              Running fully on-device with Gemma, Angel detects when scrolling turns into reactive or emotionally draining patterns, then responds with personalized support designed to help you reset and build healthier digital habits over time — while keeping your data fully private.
            </motion.p>

            <motion.div className="mt-8 flex flex-col gap-3" variants={stagger}>
              {[
                { label: 'No data transmission', detail: 'Inference runs entirely in your browser' },
                { label: 'No server, no account', detail: 'No API keys. No cloud. No sync.' },
                { label: 'Fully auditable', detail: 'Open source — every line is readable' },
              ].map(({ label, detail }) => (
                <motion.div
                  key={label}
                  className="flex items-start gap-3"
                  variants={fadeUp}
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
                  <div>
                    <span className="text-sm font-medium text-white/90">{label}</span>
                    <span className="text-sm text-white/40"> — {detail}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Right: Local processing diagram */}
          <motion.div
            className="flex flex-col items-center gap-0"
            variants={fadeUp}
          >
            <LocalFlowDiagram />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

function LocalFlowDiagram() {
  const nodes = [
    { icon: <EyeIcon />,    label: 'Behavioral signals',  sub: 'Scroll · session · patterns' },
    { icon: <GemmaIcon />,  label: 'Gemma 4 2B',          sub: 'Local inference · WebGPU/WASM' },
    { icon: <NudgeIcon />,  label: 'Reflective nudge',    sub: 'Personalized · in-browser' },
  ]

  return (
    <div className="w-full max-w-xs mx-auto">
      {nodes.map((node, i) => (
        <div key={node.label} className="flex flex-col items-center">
          <motion.div
            className="w-full rounded-xl border border-white/8 bg-dark-card px-5 py-4 flex items-center gap-4"
            whileHover={{ borderColor: 'rgba(74,124,89,0.4)' }}
            transition={{ duration: 0.2 }}
          >
            <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center text-sage shrink-0">
              {node.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-white/90">{node.label}</p>
              <p className="text-xs text-white/35 mt-0.5">{node.sub}</p>
            </div>
          </motion.div>

          {i < nodes.length - 1 && (
            <div className="flex flex-col items-center gap-0.5 py-2">
              <div className="h-5 w-px bg-white/10" />
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
      ))}

      {/* Everything stays on-device badge */}
      <div className="mt-6 flex items-center justify-center gap-2 rounded-full border border-sage/20 bg-sage/5 px-5 py-2.5">
        <LockIcon />
        <span className="text-xs font-medium text-sage/80">Everything stays on-device</span>
      </div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function GemmaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function NudgeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sage">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
