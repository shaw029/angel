const GITHUB_URL = 'https://github.com/shaw029/angel'

export function Footer() {
  return (
    <footer className="bg-dark-bg text-white/40 py-10 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">

          {/* Brand */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sage" />
              <span className="text-sm font-medium text-white/70">Angel</span>
            </div>
            <p className="text-xs leading-relaxed max-w-xs">
              An adaptive cognitive protection system powered by on-device Gemma inference. Browsing data and behavioural signals never leave your device. Model files are downloaded once and cached locally.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-1">Links</p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:text-white/70 transition-colors"
            >
              GitHub Repository
            </a>
            <a
              href="#"
              className="text-sm hover:text-white/70 transition-colors"
              aria-label="Chrome Extension — coming soon"
            >
              Chrome Extension <span className="text-white/25 text-xs">(coming soon)</span>
            </a>
            <a
              href={`${GITHUB_URL}/tree/main/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:text-white/70 transition-colors"
            >
              Documentation
            </a>
          </div>

          {/* Privacy statement */}
          <div className="flex flex-col gap-2 max-w-xs">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-1">Privacy</p>
            <p className="text-xs leading-relaxed">
              Angel reads page text locally to detect manipulation patterns — it is never stored or transmitted. Only anonymous behavioral counters are kept in your browser's IndexedDB. No network calls beyond the one-time model download.
            </p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs">
            Powered locally by <span className="text-white/60">Gemma 4 2B</span>
          </p>
          <p className="text-xs">MIT License · Open source</p>
        </div>
      </div>
    </footer>
  )
}
