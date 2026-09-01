import './chrome-shim'
import '../../src/popup/index.css'
import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { mountNudge } from '../../src/content/ui'
import { App as Popup } from '../../src/popup/App'
import { SCENES, Backdrop, type Scene } from './scenes'

const SAGE = '#4A7C59'
const INK  = '#2A2A26'

/** Mounts the real nudge the way the content script does: shadow root, 28px in from the top-right. */
function LiveNudge({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !scene.intervention) return
    mountNudge(ref.current, scene.intervention, () => {})
  }, [scene])
  return <div ref={ref} style={{ position: 'absolute', top: 28, right: 28, zIndex: 999, pointerEvents: 'none' }} />
}

function BrowserWindow({ scene }: { scene: Scene }) {
  return (
    <div style={{
      width: 1080, borderRadius: 16, overflow: 'hidden', background: '#fff',
      boxShadow: '0 30px 70px rgba(40,50,42,0.18), 0 6px 18px rgba(40,50,42,0.10)',
      border: '1px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{
        height: 42, background: '#F1F1EE', borderBottom: '1px solid #E4E4DF',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8,
      }}>
        {['#E5A5A0', '#E8CE9A', '#A9CBA6'].map(c => (
          <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
        ))}
        <div style={{
          marginLeft: 14, flex: 1, maxWidth: 420, height: 24, borderRadius: 12,
          background: '#fff', border: '1px solid #E4E4DF', display: 'flex',
          alignItems: 'center', padding: '0 12px', fontSize: 11.5, color: '#8B8B84',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}>{scene.urlLabel}</div>
      </div>
      <div style={{
        position: 'relative', height: 452, overflow: 'hidden',
        background: scene.dark ? '#0B0B0C' : '#FCFCFB',
      }}>
        <Backdrop kind={scene.backdrop} />
        {scene.intervention && <LiveNudge scene={scene} />}

      </div>
    </div>
  )
}

function Statement() {
  const points = [
    ['Runs on your machine', 'Gemma loads once through WebGPU and answers locally.'],
    ['No account, no server', 'There is nothing to sign into and nowhere for data to go.'],
    ['Page text stays put', 'Angel reads a page to understand the moment, then forgets it when the tab closes.'],
  ]
  return (
    <div style={{ width: 1080, display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div style={{ display: 'flex', gap: 22 }}>
      {points.map(([title, body]) => (
        <div key={title} style={{
          flex: 1, background: '#fff', borderRadius: 16, padding: '32px 28px', minHeight: 232,
          border: '1px solid rgba(74,124,89,0.18)',
          boxShadow: '0 18px 44px rgba(40,50,42,0.10)',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: 'rgba(74,124,89,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: SAGE }} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginBottom: 10 }}>{title}</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.65, color: '#6B6B64' }}>{body}</div>
        </div>
      ))}
      </div>

      {/* Says plainly why the extension asks for access to every site — the
          question a cautious installer (and a store reviewer) actually has. */}
      <div style={{
        background: 'rgba(74,124,89,0.07)', border: '1px solid rgba(74,124,89,0.16)',
        borderRadius: 14, padding: '22px 26px', display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <span style={{ marginTop: 7, width: 8, height: 8, borderRadius: '50%', background: SAGE, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: INK, marginBottom: 6 }}>
            Why it asks to read every site
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.65, color: '#6B6B64', maxWidth: 900 }}>
            A pattern like “fourth video in a row” or “third return to this checkout” can only be
            seen from the page you are on. Angel reads that page in your browser to recognise the
            moment — and keeps every byte of it there.
          </div>
        </div>
      </div>
    </div>
  )
}

function PopupShowcase() {
  const notes = [
    ['One switch', 'Turn Angel off entirely, on any tab, at any time.'],
    ['A presence slider', 'From quiet to active — you decide how often it is allowed to speak.'],
    ['An honest tally', 'Every nudge it offered, grouped by the situation that prompted it.'],
    ['On-device status', 'The model runs through WebGPU on your own machine.'],
  ]
  return (
    <div style={{ width: 1080, display: 'flex', alignItems: 'flex-start', gap: 78 }}>
      {/* A scaled element keeps its unscaled layout box, so reserve the real
          painted width (240px popup x 1.3) or the notes column overlaps it. */}
      <div style={{
        width: 312, flexShrink: 0,
        transform: 'scale(1.3)', transformOrigin: 'top left',
        filter: 'drop-shadow(0 20px 44px rgba(40,50,42,0.20))',
      }}>
        {/* The real popup, at its true extension width of 240px, scaled up so
            the store image stays legible in the gallery. */}
        <div style={{
          width: 'fit-content', background: '#fff', borderRadius: 10,
          overflow: 'hidden', border: '1px solid rgba(0,0,0,0.07)',
        }}>
          <Popup />
        </div>
      </div>
      <div style={{ flex: 1, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {notes.map(([title, body]) => (
          <div key={title} style={{ display: 'flex', gap: 14 }}>
            <span style={{
              marginTop: 7, width: 7, height: 7, borderRadius: '50%',
              background: SAGE, flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: 16.5, fontWeight: 600, color: INK, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, color: '#6B6B64' }}>{body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Frame({ scene }: { scene: Scene }) {
  return (
    <div style={{
      width: 1280, height: 800, display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 54, boxSizing: 'border-box',
      background: 'linear-gradient(165deg,#F6F8F5 0%,#EDF2EC 55%,#E6EDE6 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif',
    }}>
      <div style={{ width: 1080, marginBottom: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: SAGE }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '0.09em', color: SAGE, textTransform: 'uppercase' }}>
            Angel
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 35, fontWeight: 600, letterSpacing: '-0.022em', color: INK }}>
          {scene.headline}
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 16.5, lineHeight: 1.55, color: '#6B6B64', maxWidth: 820 }}>
          {scene.sub}
        </p>
      </div>
      {/* Centre the body in whatever space the headline leaves, so shorter
          compositions do not sit against the top with dead space beneath. */}
      <div style={{ flex: 1, width: 1080, display: 'flex', alignItems: 'center', paddingBottom: 40 }}>
        {scene.statement ? <Statement /> : scene.popup ? <PopupShowcase /> : <BrowserWindow scene={scene} />}
      </div>
    </div>
  )
}

const params = new URLSearchParams(location.search)
const id     = params.get('scene') ?? SCENES[0].id
const scene  = SCENES.find(s => s.id === id) ?? SCENES[0]
createRoot(document.getElementById('root')!).render(<Frame scene={scene} />)

// Headless Chrome screenshots on the load event. The nudge animates in after
// mount, so hold the load event open with an image the capture server answers
// slowly — long enough for the spring to settle, far short of the component's
// own auto-dismiss timer (which --virtual-time-budget would have raced past).
if (params.get('hold')) {
  const img = document.createElement('img')
  img.src = '/hold.gif'
  img.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(img)
}
