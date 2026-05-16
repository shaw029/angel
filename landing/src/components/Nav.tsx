import { motion } from 'framer-motion'

export function Nav() {
  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center px-6 py-4 md:px-12"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="absolute inset-0 bg-surface/80 backdrop-blur-md border-b border-border/40" />

      <div className="relative flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-sage" />
        <span className="text-sm font-medium text-ink-primary tracking-tight">Angel</span>
      </div>
    </motion.nav>
  )
}
