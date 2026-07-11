import React from 'react'
import { createRoot } from 'react-dom/client'
import { Nudge } from '@ui/components'
import type { Intervention, NudgeOutcome } from '@shared/types'

/**
 * Mounts the nudge inside a shadow root on the host element.
 *
 * Shadow DOM is the visibility guarantee: host-page CSS (dark themes, element
 * resets, !important rules) cannot reach the nudge, and the nudge's styles —
 * shipped inline by the component itself — cannot leak into the page. Without
 * this, sites with aggressive stylesheets rendered the text invisible.
 */
export function mountNudge(
  host: HTMLElement,
  intervention: Intervention,
  onDismiss: (outcome: NudgeOutcome) => void,
) {
  const shadow    = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  const container = document.createElement('div')
  shadow.appendChild(container)

  createRoot(container).render(
    <React.StrictMode>
      <Nudge intervention={intervention} onDismiss={onDismiss} />
    </React.StrictMode>,
  )
}
