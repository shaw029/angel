const GITHUB_URL = 'https://github.com/shaw029/angel'
const UPDATED    = '7 September 2026'

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
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
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
          Angel does not collect your data
        </h1>
        <p className="text-base leading-relaxed text-ink-secondary">
          Angel has no servers, no accounts, and no analytics. Everything it observes is
          processed on your own machine and stays there. This page describes exactly what it
          reads, what it keeps, and the single network request it makes — so you can check the
          claims against{' '}
          <a href={GITHUB_URL} className="text-sage underline underline-offset-2" target="_blank" rel="noopener noreferrer">
            the source code
          </a>.
        </p>
        <p className="mt-6 text-xs text-ink-faint">
          Last updated {UPDATED} · Applies to Angel 0.2.1 and later
        </p>

        <Section title="What Angel reads while you browse">
          <p>
            On pages you visit, Angel's content script keeps a short-lived picture of the
            current moment in memory:
          </p>
          <List items={[
            'The page address and hostname.',
            'The page title, truncated to 120 characters.',
            'How long the tab has been visible in the foreground, how far you have scrolled, and how long since your last interaction.',
            'How many times you have switched tabs in the last ten minutes.',
            'Whether audio or video is currently playing.',
            'How you arrived — typed, from a search engine, from a social feed, an internal link, or a reload. The referring hostname is matched locally and immediately discarded; only the category label is kept.',
          ]} />
          <p>
            Angel also scans the visible text of the page against a fixed list of patterns for
            manipulative design: urgency phrasing ("only 2 left", "ends tonight"), countdown
            timers, recurring-billing and trial wording, and gamification prompts. Those patterns
            are written into the source and cannot change at runtime.
          </p>
          <p>
            Only the <Strong>result</Strong> of that scan is kept — which pattern categories
            matched, how many times, and a confidence score. The text itself is never stored,
            never included in what the model is shown, and never leaves the page; it is matched
            and discarded in the same function.
          </p>
          <p>
            Angel does <Strong>not</Strong> read what you type. It never accesses the value of any
            form field, search box, or password input — only text the page itself displays.
          </p>
          <p>
            This picture lives in memory for as long as the tab does. It is never written to disk
            and never leaves the browser.
          </p>
        </Section>

        <Section title="What the local model sees">
          <p>
            When Angel considers speaking, it passes a compressed description of the moment to a
            Gemma model running on your own device: a category label for the kind of site, bucketed
            scroll depth and duration, the current page title and up to four previous titles, how
            you arrived, whether media is playing, the labels of any manipulation patterns that
            matched, and aggregate counts from your own history. The model is given those labels,
            never the page text that produced them.
          </p>
          <p>
            The model runs entirely inside your browser through WebGPU. No prompt, no page title,
            and no browsing signal is ever sent over the network.
          </p>
        </Section>

        <Section title="What is stored on your device">
          <p>Three things persist, all locally, all in your own browser profile:</p>
          <List items={[
            'Your settings — whether Angel is on, and where the presence slider sits.',
            'A fixed set of counters, in IndexedDB. These are strictly enumerated: how many long passive sessions occurred, how many nudges were shown, accepted, quickly dismissed, or withheld. No URLs and no page content are stored — the key list is fixed in the source and cannot grow dynamically.',
            'Weekly aggregate summaries, automatically deleted after twelve weeks.',
          ]} />
          <p>
            Removing the extension removes all of it. Nothing survives uninstallation, because
            nothing was ever stored anywhere but your browser.
          </p>
        </Section>

        <Section title="The one network request">
          <p>
            The first time Angel runs, it downloads the Gemma model's weights and tokenizer from
            the public Hugging Face CDN, then caches them locally so it never needs to fetch them
            again. As with any file download, that CDN sees the request and the IP address it came
            from. Nothing about you or your browsing is included.
          </p>
          <p>
            Angel makes no other network requests of any kind. There is no telemetry, no crash
            reporting, and no update ping beyond Chrome's own extension updates.
          </p>
        </Section>

        <Section title="Why Angel asks to read every site">
          <p>
            Angel requests access to all http and https pages. The patterns it exists to notice —
            a fourth video in a row, a third return to the same checkout, a decision being circled
            for an hour — can only be recognised from whatever page you happen to be on. A fixed
            site list would defeat the purpose: Angel responds to the moment, not the domain.
          </p>
          <p>
            That access is used solely to observe the signals listed above, in your browser, and
            for nothing else.
          </p>
        </Section>

        <Section title="What Angel never does">
          <List items={[
            'It does not transmit your browsing data anywhere.',
            'It does not sell or share data with third parties — there is no data to sell and no third party to share it with.',
            'It does not use your data for advertising, profiling for others, or creditworthiness.',
            'It does not require an account, and it does not know who you are.',
          ]} />
        </Section>

        <Section title="Your controls">
          <List items={[
            'The switch in the popup stops Angel entirely.',
            'The presence slider sets how often it may speak, from quiet to active.',
            'Dismissing a nudge teaches it to speak less; "remind me later" defers one without losing it.',
            'Uninstalling deletes every counter and setting along with the extension.',
          ]} />
        </Section>

        <Section title="Changes and contact">
          <p>
            If Angel's data handling ever changes, this page changes with it and the date above is
            updated. Questions, or a discrepancy between this page and the code, are best raised as
            an issue on{' '}
            <a href={`${GITHUB_URL}/issues`} className="text-sage underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              the GitHub repository
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

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-ink-primary">{children}</span>
}
