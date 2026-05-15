import React from 'react'
import { createRoot } from 'react-dom/client'
import { Nudge } from '@ui/components'
import type { Intervention } from '@shared/types'
import './content.css'

export function mountNudge(
  container: HTMLElement,
  intervention: Intervention,
  onDismiss: (outcome: 'accepted' | 'dismissed') => void,
) {
  createRoot(container).render(
    <React.StrictMode>
      <Nudge intervention={intervention} onDismiss={onDismiss} />
    </React.StrictMode>,
  )
}
