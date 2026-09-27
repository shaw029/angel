import test from 'node:test'
import assert from 'node:assert/strict'
import { MSG, SNOOZE } from '../src/shared/constants'
import { transitions } from './fixtures/memory'
import type { BrowsingSignal, CompanionView, Intervention } from '../src/shared/types'

let now = 1_000_000_000
Date.now = () => now
const local: Record<string, any> = {}
const session: Record<string, any> = {}
const snapshots = new Map<number, BrowsingSignal>()
const delivered: { tabId: number; intervention: Intervention }[] = []
const requested: any[] = []
const opened: string[] = []
const alarms = new Map<string, any>()
let listener: any
let alarmListener: any
let removedListener: any
const noop = { addListener() {} }
function area(values: Record<string, any>) {
  return {
    async get(key: string) { return structuredClone({ [key]: values[key] }) },
    async set(update: Record<string, any>) { Object.assign(values, structuredClone(update)) },
    async remove(keys: string | string[]) { for (const key of [keys].flat()) delete values[key] },
  }
}
;(globalThis as any).chrome = {
  storage: { local: area(local), session: area(session) },
  runtime: {
    onInstalled: noop, onStartup: noop, onConnect: noop,
    onMessage: { addListener(fn: any) { listener = fn } },
    async sendMessage(message: any) { if (message.type === MSG.AI_CONTEXT) requested.push(message.payload) },
  },
  offscreen: { async hasDocument() { return true } },
  tabs: {
    onRemoved: { addListener(fn: any) { removedListener = fn } },
    async query() { return [...snapshots.keys()].map(id => ({ id, active: true })) },
    async get(id: number) { return { id, active: true, url: snapshots.get(id)?.url } },
    async create({ url }: { url: string }) { opened.push(url) },
    async sendMessage(tabId: number, message: any) {
      if (message.type === MSG.GET_PAGE_SNAPSHOT) return structuredClone(snapshots.get(tabId))
      if (message.type === MSG.INTERVENTION) { delivered.push({ tabId, intervention: message.payload }); return true }
      return true
    },
  },
  alarms: {
    onAlarm: { addListener(fn: any) { alarmListener = fn } },
    async getAll() { return [...alarms.values()] },
    async clear(name: string) { alarms.delete(name) },
    create(name: string, options: any) { alarms.set(name, { name, ...options }) },
  },
}
await import('../src/background/index')
const { serial } = await import('../src/background/serial')
async function send(message: any, tabId?: number): Promise<any> {
  return new Promise(resolve => listener(message, tabId === undefined ? {} : { tab: { id: tabId } }, resolve))
}
const action = (tabId: number, action: string, intent?: string) => send({ type: MSG.COMPANION_ACTION, payload: { action, intent } }, tabId)
function setup(tabId: number) {
  local.state = { enabled: true, presenceLevel: 0.5, recentNudges: [], lastFullIntervention: null, lastSubtleIntervention: null, suppressionMultiplier: 1 }
  snapshots.set(tabId, { contextKey: `doc:${tabId}`, url: 'https://shop.example/item', domain: 'shop.example', timestamp: now,
    timeOnPage: 100, scrollDepth: 0.8, idleTime: 0, switchCount: 0, pageTitle: 'Headphones', mediaPlaying: false, entry: 'search' })
}
async function evidence(tabId: number, found = true) {
  const base = { timestamp: now, domain: 'shop.example' }
  await send({ type: MSG.BEHAVIORAL_EVENTS, payload: { contextKey: snapshots.get(tabId)!.contextKey, events: [
    { ...base, id: 'd', kind: 'detection', data: { detector: 'urgency-language', found, confidence: found ? 0.9 : 0, count: found ? 2 : 0, categories: found ? [3, 4] : [] } },
    ...(found ? [{ ...base, id: 't', kind: 'tracking', data: { tracker: 'interaction-loop', value: 12, unit: 'count' } }] : []),
  ] } }, tabId)
}
async function request(tabId: number) {
  setup(tabId)
  await evidence(tabId)
  now += 40_000
  await evidence(tabId)
  const req = requested.findLast(r => r.tabId === tabId)
  assert.ok(req, 'fresh pressure evidence reaches the narrator without an idle/scroll heuristic')
  return req
}
async function verdict(req: any, alignment = 'captured') {
  await send({ type: MSG.JUDGMENT, payload: { requestId: req.requestId, tabId: req.tabId,
    judgment: { alignment, confidence: 0.9, narrative: 'Fresh observed pressure', intent: '', at: now },
    intervention: { id: `n:${req.tabId}`, message: 'You can choose your own pace.', explanation: 'Limited-stock language was detected.', reasonKey: 'limited_stock', confidence: 0.9, tier: 'full', tone: 'gentle', action: 'none' },
  } })
}

test('companion controls work while disabled, save only by request, and survive same-site navigation', async () => {
  setup(1)
  await send({ type: MSG.SET_ENABLED, payload: false })
  const goal: CompanionView = await action(1, 'intent', 'Comparing headphones')
  assert.equal(goal.session?.intent, 'Comparing headphones')
  assert.equal(goal.session?.returnPoint, undefined)
  await action(1, 'quiet')
  const saved = await action(1, 'save')
  snapshots.get(1)!.contextKey = 'next-doc'
  snapshots.get(1)!.url = 'https://shop.example/other'
  const view = await send({ type: MSG.GET_COMPANION }, 1)
  assert.equal(view.session.quiet, true)
  assert.equal(view.session.intent, 'Comparing headphones')
  await action(1, 'open')
  assert.equal(opened.at(-1), saved.session.returnPoint.url)
  await action(1, 'forget')
  assert.equal((await send({ type: MSG.GET_COMPANION }, 1)).session.returnPoint, undefined)
  removedListener(1)
  await serial(async () => {})
  assert.equal(session['companion:1'], undefined)
})

test('disabled, corrected, navigated, expired, and unknown judgments cannot deliver', async () => {
  for (const [tabId, change] of [
    [2, async () => send({ type: MSG.SET_ENABLED, payload: false })],
    [3, async () => action(3, 'quiet')],
    [4, async () => { snapshots.get(4)!.contextKey = 'new-document' }],
    [5, async () => { now += 91_000 }],
    [6, async () => {}],
    [7, async () => evidence(7, false)],
  ] as const) {
    const req = await request(tabId)
    const before = delivered.length
    await change()
    await verdict(req, tabId === 6 ? 'unknown' : 'captured')
    assert.equal(delivered.length, before, `no stale delivery for tab ${tabId}`)
  }
})

test('simultaneous results share the delivery floor; model guesses do not become user priors', async () => {
  const a = await request(8)
  const b = await request(9)
  const before = delivered.length
  await Promise.all([verdict(a), verdict(b)])
  assert.equal(delivered.length, before + 1)
  assert.equal(local.ca_user_alignment_priors_v2, undefined)
  const shown = delivered.at(-1)!
  const n = shown.intervention
  await send({ type: MSG.DISMISSED, payload: { id: n.id, dwellMs: 5000, outcome: 'rejected', tone: n.tone, cogState: n.cogState, category: n.category, episodeId: n.episodeId } }, shown.tabId)
  assert.equal(session[`companion:${shown.tabId}`].quiet, true)
  assert.equal(local.ca_user_alignment_priors_v2.ecommerce.aligned, 1)
})

test('requested reminders respect the hard floor and are cancelled by corrections', async () => {
  const req = await request(10)
  await verdict(req)
  const n = delivered.at(-1)!.intervention
  assert.equal(delivered.at(-1)!.tabId, 10)
  await send({ type: MSG.DISMISSED, payload: { id: n.id, dwellMs: 5000, outcome: 'snoozed', tone: n.tone, cogState: n.cogState, intervention: n, episodeId: n.episodeId } }, 10)
  assert.equal(alarms.size, 1)
  now += SNOOZE.DELAY_MS
  local.state.lastSubtleIntervention = now - 1000
  const before = delivered.length
  alarmListener([...alarms.values()][0])
  await serial(async () => {})
  assert.equal(delivered.length, before)
  assert.ok([...alarms.values()][0].when > now)
  await action(10, 'quiet')
  assert.equal(alarms.size, 0)
})

test('quiet snapshots still record recovery and the previous state duration', async () => {
  setup(11)
  const s = snapshots.get(11)!
  await send({ type: MSG.BEHAVIORAL_EVENTS, payload: { contextKey: s.contextKey, events: [
    { id: 'fast', timestamp: now, domain: s.domain, kind: 'tracking', data: { tracker: 'scroll-continuity', value: 3000, unit: 'px-per-second' } },
    { id: 'feed', timestamp: now, domain: s.domain, kind: 'detection', data: { detector: 'infinite-scroll', found: true, confidence: 0.9, count: 3 } },
    { id: 'rapid', timestamp: now, domain: s.domain, kind: 'tracking', data: { tracker: 'interaction-loop', value: 12, unit: 'count' } },
  ] } }, 11)
  now += 120_000
  s.scrollDepth = 0.2
  await send({ type: MSG.BROWSING_SIGNAL, payload: s }, 11)
  const recovery = transitions.findLast(t => t[0] === 'compulsive_loop')
  assert.ok(recovery)
  assert.equal(recovery[3], 120_000)
})
