const GITHUB_URL = 'https://github.com/shaw029/angel'
const STORE_URL  = 'https://chromewebstore.google.com/detail/angel/geemggebjlbjnkhgbgloldmnfefoghip'

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
              href={STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:text-white/70 transition-colors"
            >
              Chrome Web Store
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
              Angel reads page titles, scans visible text for manipulative patterns, and tracks behavioural signals — all locally. Only the result of a scan is kept, never the text, and session stories vanish when the tab closes. Only anonymous behavioral counters are kept in your browser's IndexedDB. No network calls beyond the one-time model download.
            </p>
            <a
              href="privacy.html"
              className="text-xs text-white/60 underline underline-offset-2 hover:text-white/80 transition-colors"
            >
              Read the full privacy policy
            </a>
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
