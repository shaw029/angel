import { motion } from 'framer-motion'

const GITHUB_URL = 'https://github.com/shaw029/angel'

export function Nav() {
  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 px-6 py-3 md:px-12"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="absolute inset-0 bg-surface/80 backdrop-blur-md border-b border-border/40" />

      <div className="relative flex items-center justify-between">
        {/* Wordmark */}
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sage" />
          <span className="text-sm font-medium text-ink-primary tracking-tight">Angel</span>
        </div>

        {/* GitHub button */}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs font-medium text-ink-secondary hover:border-ink-muted hover:text-ink-primary transition-colors duration-200"
        >
          <GitHubIcon />
          GitHub
        </a>
      </div>
    </motion.nav>
  )
}

function GitHubIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}
