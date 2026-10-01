const GITHUB_URL = 'https://github.com/shaw029/angel'
const UPDATED    = '28 September 2026'

/**
 * The Chrome Web Store requires a posted privacy policy from any extension that
 * handles user data — and "handle" covers local processing, not just
 * transmission. Every claim here is checked against the source: if the code
 * changes what it reads or keeps, this page changes with it.
 */
export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-surface font-sans text-ink-primary">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="./" className="flex items-center gap-2 group">
            <img src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" className="h-4 w-4 rounded-[22%]" />
            <span className="text-sm font-medium group-hover:text-sage transition-colors">Angel</span>
          </a>
          <a
            href="./"
            className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
          >
            ← Back to site
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-[11px] font-semibold tracking-widest uppercase text-sage mb-4">
          Privacy Policy
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-5">
          Your browsing context stays on your device
        </h1>
        <p className="text-base leading-relaxed text-ink-secondary">
          Angel processes browsing observations locally. The extension has no account service,
          telemetry, or remote inference. This page explains what it reads and stores, the model
          downloads it makes, and the separate services used by this website.
        </p>
        <p className="mt-6 text-xs text-ink-faint">
          Last updated {UPDATED} · Describes the 0.3.0 development source. Companion controls are
          unreleased; published downloads and the store may offer an earlier version.
        </p>

        <Section title="What Angel reads">
          <List items={[
            'The current page address, hostname, and title (truncated to 120 characters).',
            'Foreground duration, scroll depth, time since interaction, recent tab switching, and whether media is playing.',
            'A coarse arrival category such as search, social referral, internal navigation, reload, or direct/no referrer. This does not prove why you arrived.',
            'Visible text and DOM patterns for urgency wording, timers, billing/trial language, gamification, autoplay attributes, and feed growth.',
          ]} />
          <p>
            Text-pattern scans retain result categories, counts, and scores rather than the matched
            passages. Page titles are handled separately and may be included in local context.
            Angel does not read host-page form values, search inputs, or passwords. Text you
            intentionally enter into Ask Angel is processed locally as your stated intent.
          </p>
        </Section>

        <Section title="What the local model sees">
          <p>
            The prompt can contain the current title and up to four previous titles, an arrival
            category, media activity, active duration, detector labels, a mechanic hypothesis,
            behavioral estimates, a previous narrative, aggregate history, and optional stated
            intent. It does not contain raw page HTML or the passages matched by text detectors.
          </p>
          <p>
            The selected Gemma profile runs inside the browser using WebGPU where available, with a WASM fallback.
            Prompts, titles, and browsing observations are not sent to a remote inference service.
          </p>
        </Section>

        <Section title="What is stored locally">
          <List items={[
            'Your AI download choice, selected profile and processor, and approved model revision; persistent settings; recent delivery/outcome records; and correction-based priors grouped by coarse site category.',
            'IndexedDB aggregate counters, behavioral profile summaries, and weekly aggregate snapshots. Old weekly snapshots are pruned on subsequent writes; aggregates do not contain URLs or page passages.',
            'Browser session storage for tab/site context, including evidence signatures containing the current title, optional intent, quiet preference, explanations, and requested reminders.',
            'An explicitly saved URL/title when you choose Save this page for later. It remains associated with that tab until forgotten, the tab closes, or the browser session ends.',
            'Cached model and tokenizer files, which the browser may evict or you may clear.',
          ]} />
          <p>
            Intent and quiet mode reset when the tab changes origin or resumes after 30 minutes
            without an observed foreground snapshot. Saved return points survive navigation.
            In-memory title trails, narratives, and estimates can reset when their process restarts.
            Uninstalling removes extension-managed settings and history from your browser profile.
          </p>
        </Section>

        <Section title="Network requests">
          <p>
            After you choose Download and enable Lite or Full, the development version downloads model weights, tokenizer files, and related model configuration from
            Hugging Face. These can require multiple requests and can be downloaded again after
            cache eviction, clearing, a profile change, or an upgrade. Automatic restarts use cached files only; missing files require another setup choice. A changed model revision or profile requires renewed consent. Cancel setup stops the model-loading document; already completed cached files may remain for reuse. The download service receives normal request
            metadata, including your IP address; prompts and browsing observations are not included.
          </p>
          <p>
            The extension sends no analytics or crash reports. Chrome handles extension updates
            separately. Opening a saved page is a navigation you request and contacts that website
            in the normal way.
          </p>
        </Section>

        <Section title="Why the extension requests site access">
          <p>
            Angel requests access to HTTP and HTTPS pages so its content script can observe the
            listed signals and display optional nudges across sites. Generic detectors can notice
            feed growth or urgency wording; they do not establish your mental state, verify a
            seller's deadline, or prove that media was automatically selected.
          </p>
        </Section>

        <Section title="Your controls">
          <List items={[
            'AI setup offers Download and enable Lite or Full, Not now, and Cancel setup. Declining keeps controls available while proactive nudges stay paused.',
            'The popup switch disables proactive nudges. Page observation is not a separate opt-out under that switch; Chrome site-access controls can restrict where the extension runs.',
            'The presence slider adjusts permitted nudge frequency within hard interruption limits.',
            'Ask Angel lets you state or clear intent, inspect the last explanation, quiet/resume an episode, and save/open/forget a return point.',
            'I chose this corrects Angel and quiets the current episode. Requested reminders remain subject to context, expiry, and interruption limits.',
          ]} />
          <p>
            Angel does not sell or transmit browsing observations to third parties or use them for
            advertising or profiling for others. It does not block sites or navigate automatically.
          </p>
        </Section>

        <Section title="This website and the store listing">
          <p>
            This website is separate from the extension. It uses Google Analytics for visits and
            referral information, which can set cookies, and embeds a YouTube video that can contact
            YouTube. Browser privacy controls can limit these services. The Chrome Web Store also
            provides listing and installation metrics through Google's own systems.
          </p>
          <p>
            The extension does not report browsing observations or its local counters to these
            services. Website measurement is not extension telemetry.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            Data-handling changes should update this policy alongside the code. For questions or
            discrepancies, see the{' '}
            <a href={`${GITHUB_URL}/issues`} className="text-sage underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              GitHub issue tracker
            </a>. Release versions and their source are listed in the{' '}
            <a href={`${GITHUB_URL}/releases`} className="text-sage underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              release history
            </a>.
          </p>
        </Section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-faint">Angel · Powered locally by Gemma</p>
          <p className="text-xs text-ink-faint">MIT License · Open source</p>
        </div>
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-lg font-semibold tracking-tight mb-4">{title}</h2>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-ink-secondary">
        {children}
      </div>
    </section>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map(item => (
        <li key={item} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-muted" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
