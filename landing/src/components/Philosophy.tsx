import { motion } from 'framer-motion'

const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.25, 0.1, 0.25, 1] } },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
}

const existing = [
  { verb: 'Block',    detail: 'access and restrict choice' },
  { verb: 'Restrict', detail: 'usage with hard limits' },
  { verb: 'Shame',    detail: 'behavior through metrics' },
  { verb: 'Optimize', detail: 'for productivity goals' },
]

const angel = [
  { verb: 'Supports',  detail: 'awareness without judgment' },
  { verb: 'Preserves', detail: 'your autonomy at every step' },
  { verb: 'Adapts',    detail: 'gently to your patterns' },
  { verb: 'Builds',    detail: 'resilience over time' },
]

export function Philosophy() {
  return (
    <section className="py-28 px-6">
      <div className="max-w-5xl mx-auto">

        <motion.div
          className="mb-16 text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={fadeUp}
        >
          <p className="text-xs font-semibold tracking-widest uppercase text-ink-muted mb-4">Philosophy</p>
          <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
            A different kind of protection.
          </h2>
        </motion.div>

        {/* Comparison table */}
        <motion.div
          className="grid gap-4 sm:grid-cols-2"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
        >
          {/* Existing tools column */}
          <motion.div
            className="rounded-2xl border border-border p-7"
            variants={fadeUp}
          >
            <p className="text-xs font-semibold tracking-widest uppercase text-ink-muted mb-5">
              Most tools
            </p>
            <div className="space-y-4">
              {existing.map(({ verb, detail }) => (
                <div key={verb} className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-ink-secondary line-through decoration-ink-muted/30">
                    {verb}
                  </span>
                  <span className="text-sm text-ink-muted">{detail}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Angel column */}
          <motion.div
            className="rounded-2xl border border-sage/25 bg-sage-light/30 p-7"
            variants={fadeUp}
          >
            <div className="flex items-center gap-2 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-sage" />
              <p className="text-xs font-semibold tracking-widest uppercase text-sage">
                Angel
              </p>
            </div>
            <div className="space-y-4">
              {angel.map(({ verb, detail }) => (
                <div key={verb} className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-ink-primary">{verb}</span>
                  <span className="text-sm text-ink-muted">{detail}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Featured quote */}
        <motion.div
          className="mt-16 text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={fadeUp}
        >
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            <blockquote>
              <p className="text-xl font-medium leading-relaxed text-ink-primary sm:text-2xl">
                "Helping users become more resilient to manipulation<br className="hidden sm:block" />
                rather than dependent on protection."
              </p>
            </blockquote>
            <div className="mt-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
        </motion.div>

        {/* Research grounding note */}
        <motion.p
          className="mt-12 text-center text-sm text-ink-muted max-w-xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
        >
          Designed around autonomy-supportive intervention theory (Deci & Ryan), dark pattern research (Mathur et al.), and the documented failure modes of restriction-based digital wellbeing tools (Lyngs et al.).
        </motion.p>
      </div>
    </section>
  )
}
