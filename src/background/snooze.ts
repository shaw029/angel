import { getState, patchState } from '@storage/index'
import { incrementPattern } from '@memory/index'
import { afterIntervention } from './gate'
import { MSG, SNOOZE } from '@shared/constants'
import type { Intervention } from '@shared/types'

// ─── Deferred re-delivery ─────────────────────────────────────────────────────
// "Remind me later" is the one path where a nudge reaches the user without the
// Guardian's approval — because the user asked for it. Sending it back through
// guardianVerdict would swallow it: the 5-minute deferral clears MIN_GAP_MS but
// loses to SUBTLE_COOLDOWN_MS once the adaptive multiplier is above 1.
//
// Two things still hold. The nudge is only re-delivered into the context it was
// raised in (same tab, same origin) — a reflection about a checkout countdown is
// noise on an unrelated page. And delivery is recorded through afterIntervention,
// so the hourly budget and subsequent cooldowns account for it; the bypass skips
// the veto, not the bookkeeping.
//
// chrome.alarms rather than setTimeout: the MV3 service worker is terminated
// after ~30s idle, so a timer would never survive to fire.

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
      intervention: { ...intervention, snoozeCount: nextCount },
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
  if (!state.enabled) return true

  // The nudge belongs to a moment, not just a tab. If that moment is gone —
  // tab closed, or navigated to a different site — let the reminder go with it.
  try {
    const tab = await chrome.tabs.get(record.tabId)
    if (!tab.url || new URL(tab.url).origin !== record.origin) return true
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
