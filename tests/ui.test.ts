import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Nudge } from '../src/ui/components/Nudge'
import { CompanionPanel } from '../src/popup/CompanionPanel'

test('both nudge tiers offer correction and explanation without implied pause actions', () => {
  for (const tier of ['subtle', 'full'] as const) {
    const markup = renderToString(createElement(Nudge, {
      intervention: { id: 'n', message: 'You can choose your own pace.', tone: 'gentle', action: 'pause_for_a_moment', confidence: 0.8, tier },
      onDismiss() {}, onSave: async () => true,
    }))
    assert.match(markup, /I chose this/)
    assert.match(markup, /Why this\?/)
    assert.match(markup, /aria-label="Dismiss"/)
    assert.doesNotMatch(markup, />Pause for a moment</)
    if (tier === 'full') {
      assert.match(markup, /Save this page for later/)
      assert.match(markup, /Remind me in 5 minutes/)
    }
  }
})

test('Ask Angel is user-opened and does not require a model response', () => {
  const markup = renderToString(createElement(CompanionPanel))
  assert.match(markup, /Ask Angel/)
  assert.match(markup, /aria-expanded="false"/)
  assert.doesNotMatch(markup, /companion-intent/)
})


test('AI onboarding discloses cost, decline, cancel, and meaningful readiness states', async () => {
  const { ModelSetupCard } = await import('../src/popup/ModelSetup')
  const render = (preference: any, status: any) => renderToString(createElement(ModelSetupCard, {
    view: { preference, status }, device: 'webgpu', onDevice() {}, onAction() {},
  }))
  const pending = render({ choice: 'pending' }, { phase: 'idle' })
  assert.match(pending, /Download and enable Angel/)
  assert.match(pending, /Not now/)
  assert.match(pending, /3.1 GB/)
  assert.match(pending, /unmetered connection/)
  assert.match(pending, /See an example/)
  assert.doesNotMatch(pending, /one-time|proven|% better/)
  const deferred = render({ choice: 'deferred' }, { phase: 'idle' })
  assert.match(deferred, /Review AI setup/)
  assert.doesNotMatch(deferred, /Download and enable Angel/)
  const loading = render({ choice: 'enabled' }, { phase: 'downloading', file: 'weights', progress: 0.5, loadedBytes: 1e9, totalBytes: 3.1e9 })
  assert.match(loading, /1.0 GB/)
  assert.match(loading, /Cancel setup/)
  assert.match(loading, /close this popup/)
  assert.match(render({ choice: 'enabled' }, { phase: 'loading' }), /Preparing AI/)
  assert.match(render({ choice: 'enabled' }, { phase: 'ready', device: 'webgpu' }), /Angel is ready/)
})
