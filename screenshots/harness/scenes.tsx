import type { Intervention } from '@shared/types'

export interface Scene {
  id:        string
  headline:  string
  sub:       string
  backdrop:  'shop' | 'feed' | 'research' | 'plain'
  urlLabel:  string
  dark?:     boolean
  intervention?: Intervention
  popup?:    boolean
  statement?: boolean
}

const base = {
  id: 'demo', confidence: 0.82, cogState: 'compulsive_loop',
} as const

export const SCENES: Scene[] = [
  {
    id:       '1_full_card',
    headline: 'It reads the moment, not the site',
    sub:      'No blocklists. Angel watches how you are browsing, and speaks only when the pattern is worth naming.',
    backdrop: 'shop',
    urlLabel: 'northwind.example/checkout',
    intervention: {
      ...base,
      id: 's1',
      tier:        'full',
      tone:        'gentle',
      action:      'take_your_time',
      observation: 'Countdown timer and "only 2 left" — urgency you did not arrive with',
      message:     'This price will likely be the same next week. You do not have to decide right now.',
    } as Intervention,
  },
  {
    id:       '2_subtle_pill',
    headline: 'A whisper when a whisper is enough',
    sub:      'Two tiers. Most moments get the quiet one — a single line that costs you nothing to ignore.',
    backdrop: 'feed',
    dark:     true,
    urlLabel: 'streamline.example/watch',
    intervention: {
      ...base,
      id: 's2',
      tier:    'subtle',
      tone:    'gentle',
      action:  'notice_how_you_feel',
      message: 'This is the fourth video in a row.',
    } as Intervention,
  },
  {
    id:       '3_remind_me_later',
    headline: 'Says what it saw — then waits',
    sub:      'Every nudge names what it noticed. "Remind me later" defers it to the moment, not the minute.',
    backdrop: 'research',
    urlLabel: 'atlasplan.example/pricing',
    intervention: {
      ...base,
      id: 's3',
      tier:        'full',
      tone:        'curious',
      action:      'come_back_later',
      observation: 'Annual billing preselected — commitment escalation',
      message:     'Annual billing is hard to undo. Worth a quiet moment before you commit?',
      snoozeCount: 1,
    } as Intervention,
  },
  {
    id:       '4_popup',
    headline: 'You set how present it is',
    sub:      'One slider from quiet to active, an honest tally of when it spoke, and how often it chose not to.',
    backdrop: 'plain',
    urlLabel: 'any tab',
    popup:    true,
  },
  {
    id:       '5_on_device',
    headline: 'Nothing leaves your device',
    sub:      'Gemma runs locally through WebGPU. No account, no server, nothing sent anywhere.',
    backdrop: 'plain',
    urlLabel: '',
    statement: true,
  },
]

// ── Page backdrops ───────────────────────────────────────────────────────────
// Real-looking pages on fictional sites. Wireframe grey bars made the images
// read as mockups rather than as software in use; invented brands keep real
// trademarks out of a commercial store listing.
//
// Everything stays left of x=512, where the nudge card begins, so the page
// content the nudge is reacting to is never hidden behind it.

const INK   = '#26261F'
const MUTED = '#77776E'
const FAINT = '#9C9C93'

function Nav({ brand, links }: { brand: string; links: string[] }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 14, borderBottom: '1px solid #EEEEE9',
    }}>
      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: INK }}>{brand}</span>
      <div style={{ display: 'flex', gap: 18 }}>
        {links.map(l => <span key={l} style={{ fontSize: 12, color: MUTED }}>{l}</span>)}
      </div>
    </div>
  )
}

export function Backdrop({ kind }: { kind: Scene['backdrop'] }) {
  if (kind === 'shop') return (
    <div style={{ padding: '26px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Nav brand="NORTHWIND" links={['Women', 'Men', 'Home', 'Sale']} />

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{
          width: 186, height: 268, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(160deg,#DFDCD4 0%,#CFCBC1 60%,#C3BFB4 100%)',
        }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 244 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.12em', color: FAINT, fontWeight: 600 }}>
            OUTERWEAR
          </span>
          <span style={{ fontSize: 19, fontWeight: 600, color: INK, lineHeight: 1.25 }}>
            Merino Wool Overshirt
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <span style={{ fontSize: 25, fontWeight: 700, color: INK }}>$248</span>
            <span style={{ fontSize: 14, color: FAINT, textDecoration: 'line-through' }}>$310</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#B45309',
              background: '#FEF3C7', borderRadius: 4, padding: '2px 6px',
            }}>20% OFF</span>
          </div>

          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
            padding: '8px 10px', fontSize: 11.5, lineHeight: 1.45, color: '#DC2626', fontWeight: 600,
          }}>
            ⏱ Sale ends in 09:52 — only 2 left, 14 people viewing
          </div>

          <div style={{
            height: 40, borderRadius: 8, background: INK, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600, marginTop: 2,
          }}>
            Add to cart
          </div>

          <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
            Free returns within 30 days. Ships tomorrow.
          </span>
        </div>
      </div>
    </div>
  )

  if (kind === 'feed') return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        height: 268, borderRadius: 12, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(155deg,#232331 0%,#14141B 55%,#0B0B0F 100%)',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 0, height: 0, marginLeft: 4,
            borderTop: '10px solid transparent', borderBottom: '10px solid transparent',
            borderLeft: '16px solid rgba(255,255,255,0.6)',
          }} />
        </div>
        <div style={{ position: 'absolute', bottom: 16, left: 18, maxWidth: 300 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
            Ten Minutes of Absolutely Nothing
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
            Driftwave · 1.2M views · Autoplaying next
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {['Why You Cannot Stop', 'The Algorithm Explained', 'One More Episode'].map((t, i) => (
          <div key={t} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              height: 58, borderRadius: 8,
              background: ['#17171C', '#14141A', '#111117'][i],
            }} />
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.42)', lineHeight: 1.35 }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (kind === 'research') return (
    <div style={{ padding: '26px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Nav brand="ATLASPLAN" links={['Product', 'Pricing', 'Docs']} />

      <div style={{ display: 'flex', gap: 14 }}>
        {[
          { name: 'Starter', price: '9',  lines: ['3 projects', 'Basic exports', 'Email support'] },
          { name: 'Studio',  price: '19', lines: ['Unlimited projects', 'Priority exports', 'Shared workspaces'] },
        ].map((plan, i) => (
          <div key={plan.name} style={{
            width: 176, borderRadius: 12, padding: '16px 16px 18px',
            border: i === 1 ? '2px solid #4A7C59' : '1px solid #EAEAE4',
            background: i === 1 ? '#F4F8F4' : '#FFFFFF',
            display: 'flex', flexDirection: 'column', gap: 9,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{plan.name}</span>
              {i === 1 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#4A7C59',
                  background: 'rgba(74,124,89,0.12)', borderRadius: 4, padding: '2px 5px',
                }}>POPULAR</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: INK }}>${plan.price}</span>
              <span style={{ fontSize: 11, color: FAINT, fontWeight: 500 }}>/mo</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
              {plan.lines.map(l => (
                <span key={l} style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.4 }}>✓&nbsp;&nbsp;{l}</span>
              ))}
            </div>
            <div style={{
              marginTop: 'auto', height: 32, borderRadius: 7,
              background: i === 1 ? '#4A7C59' : '#F1F1EC',
              color: i === 1 ? '#fff' : MUTED,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11.5, fontWeight: 600,
            }}>
              Choose {plan.name}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 18, borderRadius: 9, background: '#4A7C59', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 2, right: 2, width: 14, height: 14,
            borderRadius: '50%', background: '#fff',
          }} />
        </div>
        <span style={{ fontSize: 12, color: MUTED }}>Billed annually — save 20%</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 430, marginTop: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>Frequently asked</span>
        <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.55 }}>
          Can I switch plans later? Yes — annual plans are refunded pro rata within 14 days.
        </span>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '26px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Nav brand="THE DAILY REVIEW" links={['World', 'Business', 'Culture']} />
      <span style={{ fontSize: 20, fontWeight: 600, color: INK, maxWidth: 430, lineHeight: 1.3 }}>
        The quiet economics of holding your attention
      </span>
      <span style={{ fontSize: 12, color: MUTED, maxWidth: 430, lineHeight: 1.65 }}>
        Every interface you use today was shaped by someone measuring how long you stayed.
        The results are rarely accidental, and almost never neutral.
      </span>
    </div>
  )
}
