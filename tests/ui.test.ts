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
