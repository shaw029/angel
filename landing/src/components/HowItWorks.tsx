import { motion } from 'framer-motion'

const steps = [
  {
    number: '01',
    title: 'Witness the environment',
    body: 'Angel collects evidence — endless-scroll mechanics, urgency pressure, autoplay settings, compulsive switching, how you arrived and where the session has drifted. Evidence is never a verdict: nothing here can trigger a nudge by itself.',
  },
  {
    number: '02',
    title: 'Understand the session',
    body: 'Gemma uses local context to estimate whether an offer might help. It can be wrong: titles, duration, and arrival clues do not establish your purpose. In the companion development version, you can state your intent, and unknown judgments stay quiet.',
  },
  {
    number: '03',
    title: 'Nudge, learn, back off',
    body: 'A dismissible nudge describes observed page mechanics. Hard limits keep offers sparse. The companion development version adds explanations and an "I chose this" correction on both nudge sizes, so your choice takes precedence.',
  },
]

const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.25, 0.1, 0.25, 1] } },
}

export function HowItWorks() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-5xl mx-auto">

        <motion.div
          className="mb-12 text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={fadeUp}
        >
          <p className="text-xs font-semibold tracking-widest uppercase text-ink-muted mb-4">How it works</p>
          <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
            Awareness, not interruption.
          </h2>
        </motion.div>

        <div className="grid gap-0 lg:grid-cols-3 lg:gap-px lg:bg-border">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="relative bg-surface p-8 lg:p-10"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={fadeUp}
              transition={{ delay: i * 0.1 }}
            >
              {/* Step number */}
              <span className="block text-4xl font-semibold text-border select-none mb-6 leading-none">
                {step.number}
              </span>

              {/* Divider line that animates */}
              <motion.div
                className="mb-6 h-px bg-sage"
                initial={{ scaleX: 0, originX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
              />

              <h3 className="text-base font-semibold text-ink-primary mb-3 leading-snug">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-ink-muted">
                {step.body}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Observational note */}
        <motion.p
          className="mt-10 text-center text-sm text-ink-muted max-w-lg mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
        >
          Angel observes without judgment. It judges trajectories, never taste — no topic, site, or format is treated as bad, and what it names is always your environment, not your choices. Grounded in research on digital wellbeing, persuasive technology, and autonomy-supportive design.
        </motion.p>
      </div>
    </section>
  )
}
