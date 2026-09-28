import { modelSetupView } from './model-setup'
import { getAuthorizedModelRun } from '@shared/model-plan'
import { getState, patchState } from '@storage/index'
import { incrementPattern, recordStateInterventionShown } from '@memory/index'
import { afterIntervention } from './gate'
import { getCompanion, isCurrentIntervention } from './companion'
import { MSG, SNOOZE, GATE } from '@shared/constants'
import type { Intervention } from '@shared/types'

// User-requested reminders skip adaptive spacing, but still respect the hard
// floor, hourly budget, current episode, correction revision, and expiry.
// Alarms survive service-worker suspension; stale reminders are discarded.

const PREFIX = 'snooze:'

interface SnoozeRecord {
  tabId:        number
  origin:       string
  intervention: Intervention
  retries:      number
}

function keyFor(tabId: number, interventionId: string): string {
  return `${PREFIX}${tabId}:${interventionId}`
}

async function readRecord(key: string): Promise<SnoozeRecord | null> {
  try {
    const result = await chrome.storage.session.get(key)
    return (result[key] as SnoozeRecord | undefined) ?? null
  } catch {
    return null
  }
}

async function arm(key: string, record: SnoozeRecord, delayMs: number): Promise<void> {
  await chrome.storage.session.set({ [key]: record })
  chrome.alarms.create(key, { when: Date.now() + delayMs })
}

/**
 * Defers an intervention for SNOOZE.DELAY_MS. Returns false when the nudge has
 * already been deferred its maximum number of times, or when the originating
 * tab can no longer be resolved.
 */
export async function scheduleSnooze(
  tabId:        number,
  intervention: Intervention,
): Promise<boolean> {
  const nextCount = (intervention.snoozeCount ?? 0) + 1
  if (nextCount > SNOOZE.MAX) return false

  let origin: string
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url) return false
    origin = new URL(tab.url).origin
  } catch {
    return false  // tab closed between dismissal and this call
  }

  await arm(
    keyFor(tabId, intervention.id),
    {
      tabId,
      origin,
      intervention: { ...intervention, snoozeCount: nextCount, expiresAt: Date.now() + SNOOZE.DELAY_MS + 5 * 60_000 },
      retries:      0,
    },
    SNOOZE.DELAY_MS,
  )
  return true
}

/**
 * Handles a fired alarm. Returns false if the alarm was not a snooze, so the
 * caller can pass other alarms elsewhere.
 */
export async function onSnoozeAlarm(alarm: chrome.alarms.Alarm): Promise<boolean> {
  if (!alarm.name.startsWith(PREFIX)) return false

  const record = await readRecord(alarm.name)
  await chrome.storage.session.remove(alarm.name)
  if (!record) return true

  // Angel was switched off during the deferral — that veto still stands.
  const state = await getState()
  if (!state.enabled || !(await getAuthorizedModelRun()) || (await modelSetupView()).status.phase !== 'ready') return true
  if (!isCurrentIntervention(record.intervention, await getCompanion(record.tabId))) return true
  const now = Date.now()
  const last = Math.max(state.lastFullIntervention ?? 0, state.lastSubtleIntervention ?? 0)
  if (now - last < GATE.MIN_GAP_MS || (state.recentNudges ?? []).filter(t => now - t < 60 * 60_000).length >= GATE.HOURLY_BUDGET) {
    if (record.retries < SNOOZE.MAX_RETRIES) await arm(alarm.name, { ...record, retries: record.retries + 1 }, SNOOZE.RETRY_MS)
    return true
  }

  // The nudge belongs to a moment, not just a tab. If that moment is gone —
  // tab closed, or navigated to a different site — let the reminder go with it.
  try {
    const tab = await chrome.tabs.get(record.tabId)
    if (!tab.url || new URL(tab.url).origin !== record.origin) return true
    if (!tab.active) {
      if (record.retries < SNOOZE.MAX_RETRIES) await arm(alarm.name, { ...record, retries: record.retries + 1 }, SNOOZE.RETRY_MS)
      return true
    }
  } catch {
    return true
  }

  // The content script shows one nudge at a time and reports whether this one
  // landed. If something else already occupies the slot, re-arm rather than
  // dropping a reminder the user explicitly asked for.
  let shown = false
  try {
    shown = await chrome.tabs.sendMessage(record.tabId, {
      type:    MSG.INTERVENTION,
      payload: record.intervention,
    }) === true
  } catch {
    return true  // content script gone
  }

  if (!shown) {
    if (record.retries < SNOOZE.MAX_RETRIES) {
      await arm(alarm.name, { ...record, retries: record.retries + 1 }, SNOOZE.RETRY_MS)
    }
    return true
  }

  // A re-delivery is a real delivery: it counts toward the hourly budget, the
  // nudge total, and the denominator the evaluation rates divide by.
  await patchState(afterIntervention(record.intervention.tier, state))
  if (record.intervention.cogState) await recordStateInterventionShown(record.intervention.cogState)
  void incrementPattern('interventions_shown')
  return true
}

/** Drops any pending reminders for a tab that has gone away. */
export async function clearSnoozesForTab(tabId: number): Promise<void> {
  const alarms = await chrome.alarms.getAll()
  const mine   = alarms.filter(a => a.name.startsWith(`${PREFIX}${tabId}:`))
  await Promise.all(mine.map(a => chrome.alarms.clear(a.name)))
  if (mine.length > 0) await chrome.storage.session.remove(mine.map(a => a.name))
}
