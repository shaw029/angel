import { motion } from 'framer-motion'

const GITHUB_URL = 'https://github.com/shaw029/angel'

export function Nav() {
  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-12"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="absolute inset-0 bg-surface/80 backdrop-blur-md border-b border-border/40" />

      <div className="relative flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-sage" />
        <span className="text-sm font-medium text-ink-primary tracking-tight">Angel</span>
      </div>

      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="relative text-sm text-ink-muted hover:text-ink-primary transition-colors duration-200"
      >
        View on GitHub
      </a>
    </motion.nav>
  )
}
