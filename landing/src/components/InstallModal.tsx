import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// When a release exists this triggers an immediate zip download.
// Create a release with: git tag v0.1.0 && git push origin v0.1.0
// then attach dist-angel.zip as a release asset on GitHub.
const RELEASES_URL = 'https://github.com/shaw029/angel/releases/latest/download/angel-extension.zip'

const steps = [
  { n: '1', text: 'Download the Angel ZIP from the link below' },
  { n: '2', text: 'Unzip the downloaded folder anywhere on your computer' },
  { n: '3', text: 'Open Chrome and navigate to chrome://extensions' },
  { n: '4', text: 'Enable Developer Mode using the toggle in the top-right corner' },
  { n: '5', text: 'Click "Load unpacked" and select the unzipped Angel folder' },
  { n: '6', text: 'Angel is now running. The icon will appear in your toolbar' },
]

export function InstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-50 bg-ink-primary/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="Install Angel locally"
            className="fixed inset-x-4 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl bg-surface px-7 py-8 shadow-2xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl md:px-10 md:py-10"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-border hover:text-ink-primary transition-colors"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="mb-7">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sage" />
                <span className="text-xs font-semibold tracking-widest uppercase text-sage">Manual install</span>
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-ink-primary">
                Install Angel from GitHub
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                No account. No store. No data shared. The extension runs entirely on your device — you can verify every line of code before installing.
              </p>
            </div>

            {/* Steps */}
            <ol className="space-y-4 mb-8">
              {steps.map(({ n, text }) => (
                <li key={n} className="flex items-start gap-4">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold text-ink-muted">
                    {n}
                  </span>
                  <span className="text-sm leading-relaxed text-ink-secondary">{text}</span>
                </li>
              ))}
            </ol>

            {/* Download CTA */}
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink-primary px-6 py-3 text-sm font-medium text-surface hover:bg-ink-secondary transition-colors duration-200"
            >
              <DownloadIcon />
              Download latest release
            </a>

            <p className="mt-4 text-center text-xs text-ink-muted">
              Hosted on GitHub Releases ·{' '}
              <a
                href="https://github.com/shaw029/angel"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-ink-secondary transition-colors"
              >
                View source
              </a>
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
