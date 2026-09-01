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
    sub:      'Every nudge names the mechanic it noticed. "Remind me later" defers it to the same moment, not the same minute.',
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
    sub:      'Gemma runs locally through WebGPU. No accounts, no servers, no browsing history sent anywhere — ever.',
    backdrop: 'plain',
    urlLabel: '',
    statement: true,
  },
]

// ── Page backdrops ───────────────────────────────────────────────────────────
// Deliberately generic, fictional sites: real brands in store screenshots are a
// trademark problem, and the point is the nudge, not the page.

const bar = (w: string, h: number, c: string, r = 6) => (
  <div style={{ width: w, height: h, background: c, borderRadius: r }} />
)

export function Backdrop({ kind }: { kind: Scene['backdrop'] }) {
  if (kind === 'shop') return (
    <div style={{ padding: '34px 44px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {bar('170px', 20, '#d8d8d4')}
        <div style={{ display: 'flex', gap: 12 }}>{bar('80px', 14, '#e8e8e4')}{bar('56px', 14, '#e8e8e4')}</div>
      </div>
      <div style={{ display: 'flex', gap: 34, marginTop: 6 }}>
        <div style={{ width: 260, height: 300, background: '#e9e9e5', borderRadius: 14 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6, maxWidth: 340 }}>
          {bar('100%', 22, '#dcdcd8')}
          {bar('72%', 15, '#e8e8e4')}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: '#33332f' }}>$248</span>
            <span style={{ fontSize: 15, color: '#9b9b95', textDecoration: 'line-through' }}>$310</span>
          </div>
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9,
            padding: '9px 12px', fontSize: 13, color: '#DC2626', fontWeight: 600,
          }}>
            ⏱ Sale ends in 09:52 — only 2 left, 14 people viewing
          </div>
          <div style={{ height: 46, background: '#26261f', borderRadius: 9, marginTop: 6 }} />
          {bar('88%', 12, '#eaeae6')}
          {bar('64%', 12, '#eaeae6')}
        </div>
      </div>
    </div>
  )

  if (kind === 'feed') return (
    <div style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        height: 330, background: '#141414', borderRadius: 14, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg,#1e1e28 0%,#101014 60%,#0a0a0c 100%)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 62, height: 62, borderRadius: '50%', background: 'rgba(255,255,255,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 0, height: 0, marginLeft: 5,
            borderTop: '11px solid transparent', borderBottom: '11px solid transparent',
            borderLeft: '18px solid rgba(255,255,255,0.55)',
          }} />
        </div>
        <div style={{ position: 'absolute', bottom: 20, left: 22, display: 'flex', gap: 10 }}>
          {bar('120px', 11, 'rgba(255,255,255,0.18)', 4)}
          {bar('76px', 11, 'rgba(255,255,255,0.12)', 4)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1, height: 92, background: '#121212', borderRadius: 12 }} />
        <div style={{ flex: 1, height: 92, background: '#101010', borderRadius: 12 }} />
        <div style={{ flex: 1, height: 92, background: '#0e0e0e', borderRadius: 12 }} />
      </div>
    </div>
  )

  if (kind === 'research') return (
    <div style={{ padding: '34px 46px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {bar('220px', 20, '#dcdcd8')}
      <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            flex: 1, borderRadius: 14, padding: 20,
            border: i === 1 ? '2px solid #4A7C59' : '1px solid #e6e6e2',
            background: i === 1 ? '#F3F7F3' : '#fbfbfa',
            display: 'flex', flexDirection: 'column', gap: 12, height: 250,
          }}>
            {bar('56%', 13, '#dcdcd8')}
            <span style={{ fontSize: 26, fontWeight: 700, color: '#33332f' }}>
              ${[9, 19, 49][i]}<span style={{ fontSize: 12, fontWeight: 500, color: '#9b9b95' }}>/mo</span>
            </span>
            {bar('100%', 10, '#eaeae6')}{bar('84%', 10, '#eaeae6')}{bar('90%', 10, '#eaeae6')}
            <div style={{
              marginTop: 'auto', height: 38, borderRadius: 8,
              background: i === 1 ? '#4A7C59' : '#eaeae6',
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <div style={{ width: 34, height: 18, borderRadius: 9, background: '#4A7C59', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 2, right: 2, width: 14, height: 14,
            borderRadius: '50%', background: '#fff',
          }} />
        </div>
        <span style={{ fontSize: 13, color: '#6b6b64' }}>Billed annually — save 20%</span>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '34px 46px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {bar('180px', 18, '#dcdcd8')}
      <div style={{ height: 1, background: '#ececE8' }} />
      {bar('100%', 12, '#ececE8')}{bar('92%', 12, '#ececE8')}{bar('70%', 12, '#f2f2ee')}
    </div>
  )
}
