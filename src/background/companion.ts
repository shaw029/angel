import type { BrowsingSignal, CompanionSession, Intervention } from '@shared/types'

const PREFIX = 'companion:'
const EPISODE_IDLE_MS = 30 * 60_000

export async function getCompanion(tabId: number): Promise<CompanionSession | null> {
  const key = `${PREFIX}${tabId}`
  const stored = (await chrome.storage.session.get(key))[key] as CompanionSession | undefined
  if (!stored) return null
  return stored
}

export async function putCompanion(tabId: number, session: CompanionSession): Promise<void> {
  await chrome.storage.session.set({ [`${PREFIX}${tabId}`]: session })
}

export async function clearCompanion(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${PREFIX}${tabId}`)
}

export function nextSession(
  previous: CompanionSession | null,
  signal: BrowsingSignal,
  now = Date.now(),
): CompanionSession {
  const origin = new URL(signal.url).origin
  if (!previous || previous.origin !== origin || now - previous.lastSeenAt > EPISODE_IDLE_MS) {
    return {
      episodeId: crypto.randomUUID(), origin, contextKey: signal.contextKey,
      revision: 0, lastSeenAt: now, intent: null, quiet: false, evidenceSignature: '',
      returnPoint: previous?.returnPoint,
    }
  }
  const changed = previous.contextKey !== signal.contextKey
  return {
    ...previous, contextKey: signal.contextKey, lastSeenAt: now,
    revision: previous.revision + (changed ? 1 : 0),
    evidenceSignature: changed ? '' : previous.evidenceSignature,
  }
}

export function isCurrentIntervention(
  intervention: Intervention,
  session: CompanionSession | null,
  now = Date.now(),
): boolean {
  return !!session && !session.quiet && now - session.lastSeenAt < EPISODE_IDLE_MS &&
    intervention.episodeId === session.episodeId &&
    intervention.contextKey === session.contextKey &&
    intervention.revision === session.revision &&
    typeof intervention.expiresAt === 'number' && now < intervention.expiresAt
}
