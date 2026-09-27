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
              <img src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" className="h-4 w-4 rounded-[22%]" />
              <span className="text-sm font-medium text-white/70">Angel</span>
            </div>
            <p className="text-xs leading-relaxed max-w-xs">
              A browsing companion powered by local Gemma inference. Browsing observations stay on your device. Model files are downloaded and cached locally.
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
              Angel processes titles, visible-text pattern results, and browsing signals locally. Storage includes aggregate history and temporary session context; saving a page explicitly keeps its URL and title. Model downloads can recur after cache clearing or upgrades.
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
            Powered locally by <span className="text-white/60">Gemma</span>
          </p>
          <p className="text-xs">MIT License · Open source</p>
        </div>
      </div>
    </footer>
  )
}
