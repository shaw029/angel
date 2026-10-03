import type {
  BrowsingSignal,
  CompressedContext,
  Intervention,
  InterventionStyle,
  StorageState,
  BehavioralEvent,
  ModelLoadStatus,
  AlignmentJudgment,
  NudgeOutcome,
  CognitiveState,
  DomainCategory,
  CompanionAction,
  ModelDevice,
} from './types'
import type { MSG } from './constants'

type MsgKey = typeof MSG

// Routed inference request: requestId ties the judgment back to the pending
// entry in the background; tabId makes delivery explicit (no module-global slot).
export interface NarratorRequest {
  modelRunId: string
  requestId: string
  expiresAt: number
  tabId:     number
  ctx:       CompressedContext
}

// The Narrator's full answer — judgment always present when inference succeeded,
// intervention only when it proposes a nudge.
export interface JudgmentPayload {
  requestId:    string
  tabId:        number
  judgment:     AlignmentJudgment | null
  intervention: Intervention | null
}

export interface DismissedPayload {
  id:        string
  dwellMs:   number
  outcome:   NudgeOutcome
  tone:      InterventionStyle
  cogState:  CognitiveState
  category?: DomainCategory

  // Number of user-requested deferrals. Used to bound reminders, not infer intent.
  snoozeCount?: number

  // Present only when outcome is 'snoozed' — the payload to re-deliver.
  // The content script already holds it, so echoing it back avoids the
  // background having to retain every in-flight nudge just in case.
  intervention?: Intervention
  episodeId?: string
}

export type Message =
  | { type: MsgKey['BROWSING_SIGNAL'];   payload: BrowsingSignal }
  | { type: MsgKey['BEHAVIORAL_EVENTS']; payload: { contextKey: string; events: BehavioralEvent[] } }
  | { type: MsgKey['AI_CONTEXT'];        payload: NarratorRequest }
  | { type: MsgKey['JUDGMENT'];          payload: JudgmentPayload }
  | { type: MsgKey['INTERVENTION'];      payload: Intervention }
  | { type: MsgKey['DISMISSED'];         payload: DismissedPayload }
  | { type: MsgKey['GET_STATE'] }
  | { type: MsgKey['SET_ENABLED'];       payload: boolean }
  | { type: MsgKey['SET_PRESENCE'];      payload: number }
  | { type: MsgKey['MODEL_PROGRESS'];    payload: ModelLoadStatus; runId: string }
  | { type: MsgKey['GET_MODEL_SETUP'] }
  | { type: MsgKey['GET_MODEL_RUN'] }
  | { type: MsgKey['SET_MODEL_SETUP']; payload: { action: 'enable' | 'defer' | 'cancel'; device?: ModelDevice } }
  | { type: MsgKey['KEEPALIVE'] }
  | { type: MsgKey['GET_PAGE_SNAPSHOT'] }
  | { type: MsgKey['GET_COMPANION'] }
  | { type: MsgKey['COMPANION_ACTION']; payload: { action: CompanionAction; intent?: string } }
  | { type: MsgKey['CLEAR_NUDGE'] }

export type MessageOf<T extends Message['type']> = Extract<Message, { type: T }>

export type ResponseFor<T extends Message['type']> =
  T extends MsgKey['GET_STATE'] ? StorageState : void
