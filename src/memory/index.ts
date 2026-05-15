import type { MemorySummary } from '@shared/types'
import { openMemoryDB, dbGet, dbPut, dbGetAll, dbGetAllKeys, dbDelete, STORE } from './db'

// ─── Pattern keys ─────────────────────────────────────────────────────────────
// Strictly enumerated. No dynamic keys, no URLs, no content.

export type PatternKey =
  | 'late_night_scroll_sessions'      // session flagged, hour 22–04
  | 'long_passive_sessions'           // extended low-engagement time (>20 min)
  | 'rapid_tab_switching_episodes'    // distracted_browsing event type
  | 'doom_scroll_episodes'            // doom_scrolling velocity flag
  | 'checkout_pressure_events'        // checkout_pressure event type
  | 'subscription_funnel_events'      // subscription_funnel event type
  | 'engagement_hook_events'          // engagement_hook event type
  | 'interventions_shown'             // total interventions delivered
  | 'interventions_accepted'          // action button clicked
  | 'interventions_quick_dismissed'   // dismissed in < 3 s

// Patterns that represent browsing behavior (used for dominant_pattern in summary)
const BEHAVIORAL_PATTERNS: readonly PatternKey[] = [
  'late_night_scroll_sessions',
  'long_passive_sessions',
  'rapid_tab_switching_episodes',
  'doom_scroll_episodes',
  'checkout_pressure_events',
  'subscription_funnel_events',
  'engagement_hook_events',
]

// ─── Internal record shapes ───────────────────────────────────────────────────

interface PatternRecord {
  key:         PatternKey
  count:       number
  lastUpdated: number  // epoch ms — for prune/snapshot timing only
}

interface WeeklySummary {
  week:     string                  // ISO 8601: '2025-W18'
  snapshot: Partial<Record<PatternKey, number>>  // pattern counts at snapshot time
}

// ─── Retention ────────────────────────────────────────────────────────────────

const WEEKLY_RETENTION = 12  // weeks

// ─── Session-level guards (reset when service worker restarts) ────────────────

let prunedThisSession  = false
let lastSnapshotWeek   = ''

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Increment a pattern counter. The main write entry-point for all callers.
 * Also triggers weekly snapshot and (once per SW lifetime) pruning.
 */
export async function incrementPattern(
  key:   PatternKey,
  delta: number = 1,
): Promise<void> {
  const db  = await openMemoryDB()
  const now = Date.now()

  // One-time prune per service worker session
  if (!prunedThisSession) {
    prunedThisSession = true
    await pruneOld(db, now)
  }

  const existing = await dbGet<PatternRecord>(db, STORE.PATTERNS, key)
  await dbPut(db, STORE.PATTERNS, {
    key,
    count:       (existing?.count ?? 0) + delta,
    lastUpdated: now,
  })

  await maybeSnapshot(db, now)
}

/**
 * Returns a snapshot of all current pattern counts.
 * Returns an empty object if IndexedDB is unavailable.
 */
export async function getPatterns(): Promise<Partial<Record<PatternKey, number>>> {
  const db      = await openMemoryDB()
  const records = await dbGetAll<PatternRecord>(db, STORE.PATTERNS)
  return Object.fromEntries(records.map(r => [r.key, r.count])) as Partial<Record<PatternKey, number>>
}

/**
 * Returns a compact summary safe to include in the AI inference context.
 * Never contains URLs, domains, content, or timestamps.
 */
export async function getMemorySummary(): Promise<MemorySummary> {
  const db      = await openMemoryDB()
  const records = await dbGetAll<PatternRecord>(db, STORE.PATTERNS)

  const counts = Object.fromEntries(records.map(r => [r.key, r.count])) as
    Partial<Record<PatternKey, number>>

  // Dominant behavioral pattern: highest-count, ignoring meta-counters
  const dominant_pattern = BEHAVIORAL_PATTERNS.reduce<PatternKey | null>((best, key) => {
    const n = counts[key] ?? 0
    if (n === 0) return best
    if (best === null || n > (counts[best] ?? 0)) return key
    return best
  }, null)

  // Acceptance rate: what fraction of shown interventions led to an action click
  const shown    = counts['interventions_shown'] ?? 0
  const accepted = counts['interventions_accepted'] ?? 0
  const acceptance_rate = shown > 0 ? accepted / shown : 0

  // Weeks active: number of stored weekly snapshots
  const snapKeys = await dbGetAllKeys(db, STORE.WEEKLY_SUMMARIES)

  return {
    dominant_pattern,
    acceptance_rate,
    weeks_active: snapKeys.length,
  }
}

/**
 * Removes weekly summaries outside the retention window.
 * Called automatically on first write per SW session.
 */
export async function prune(): Promise<void> {
  const db = await openMemoryDB()
  await pruneOld(db, Date.now())
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function pruneOld(db: IDBDatabase, now: number): Promise<void> {
  const cutoffMs   = now - WEEKLY_RETENTION * 7 * 24 * 60 * 60 * 1000
  const cutoffWeek = isoWeek(cutoffMs)
  const summaries  = await dbGetAll<WeeklySummary>(db, STORE.WEEKLY_SUMMARIES)

  for (const s of summaries) {
    if (s.week < cutoffWeek) await dbDelete(db, STORE.WEEKLY_SUMMARIES, s.week)
  }
}

/**
 * Takes a snapshot of current pattern counts at the start of each new ISO week.
 * Subsequent calls within the same week are no-ops (module-level guard + DB check).
 */
async function maybeSnapshot(db: IDBDatabase, now: number): Promise<void> {
  const week = isoWeek(now)
  if (week === lastSnapshotWeek) return  // already checked this session
  lastSnapshotWeek = week

  const existing = await dbGet<WeeklySummary>(db, STORE.WEEKLY_SUMMARIES, week)
  if (existing) return  // already snapshotted this week

  const records = await dbGetAll<PatternRecord>(db, STORE.PATTERNS)
  const snapshot: Partial<Record<PatternKey, number>> = {}
  for (const r of records) snapshot[r.key] = r.count

  await dbPut(db, STORE.WEEKLY_SUMMARIES, { week, snapshot })
}

/** ISO 8601 week string: '2025-W18' */
function isoWeek(ms: number): string {
  const d    = new Date(ms)
  const year = d.getUTCFullYear()
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((ms - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}
