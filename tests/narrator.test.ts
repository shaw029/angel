import test from 'node:test'
import assert from 'node:assert/strict'
import { judgeSession } from '../src/ai/index'
import { setOutput, lastInput } from './fixtures/infer'
import type { CompressedContext, InferenceOutput } from '../src/shared/types'
const ctx: CompressedContext = {
  event_type: 'checkout_pressure', signals: ['countdown_timer'],
  session_context: { minutes_active: 10, doom_scrolling: false, rapid_clicking: false, tab_activity: 'focused' },
  page_context: { category: 'ecommerce', scroll_depth: 'shallow', duration: 'extended' },
  explicitIntent: 'Comparing headphones',
}
const output: InferenceOutput = { alignment: 'captured', decision_state: 'intervene', confidence: 0.9,
  narrative: 'Observed timer language.', intent: '', tier_hint: 'full', intervention_style: 'gentle',
  intervention_message: 'You came to buy headphones and the price will be lower next week.', suggested_action: 'none' }

test('aligned, unknown and failed judgments always stay silent', async () => {
  for (const alignment of ['aligned', 'unknown'] as const) {
    setOutput({ ...output, alignment })
    assert.equal((await judgeSession(ctx)).intervention, null)
  }
  setOutput(null)
  assert.equal((await judgeSession(ctx)).intervention, null)
})

test('unsupported model copy never reaches the user; explicit intent and evidence reach inference', async () => {
  setOutput(output)
  const verdict = await judgeSession(ctx)
  assert.ok(verdict.intervention)
  assert.doesNotMatch(verdict.intervention.message, /headphones|price|next week/)
  assert.match(verdict.intervention.explanation!, /do not tell me what you intended/)
  assert.equal(lastInput?.explicitIntent, 'Comparing headphones')
  assert.deepEqual(lastInput?.signals, ['countdown_timer'])
  assert.ok(lastInput?.interpretation?.explanation)
})

test('a model proposal without current supporting mechanics cannot produce a nudge', async () => {
  setOutput({ ...output, intervention_message: '' })
  assert.equal((await judgeSession({ ...ctx, signals: [] })).intervention, null)
  assert.ok((await judgeSession(ctx)).intervention, 'grounded copy does not require generated copy')
})
