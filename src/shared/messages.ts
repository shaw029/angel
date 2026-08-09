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
} from './types'
import type { MSG } from './constants'

type MsgKey = typeof MSG

// Routed inference request: requestId ties the judgment back to the pending
// entry in the background; tabId makes delivery explicit (no module-global slot).
export interface NarratorRequest {
  requestId: string
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

  // Deferrals this nudge has already been through. > 0 means the user asked to
  // see it again, which is what lets the background judge whether the deferral
  // was genuine timing feedback or a softer way of dismissing it.
  snoozeCount?: number

  // Present only when outcome is 'snoozed' — the payload to re-deliver.
  // The content script already holds it, so echoing it back avoids the
  // background having to retain every in-flight nudge just in case.
  intervention?: Intervention
}

export type Message =
  | { type: MsgKey['BROWSING_SIGNAL'];   payload: BrowsingSignal }
  | { type: MsgKey['BEHAVIORAL_EVENTS']; payload: BehavioralEvent[] }
  | { type: MsgKey['AI_CONTEXT'];        payload: NarratorRequest }
  | { type: MsgKey['JUDGMENT'];          payload: JudgmentPayload }
  | { type: MsgKey['INTERVENTION'];      payload: Intervention }
  | { type: MsgKey['DISMISSED'];         payload: DismissedPayload }
  | { type: MsgKey['GET_STATE'] }
  | { type: MsgKey['SET_ENABLED'];       payload: boolean }
  | { type: MsgKey['SET_PRESENCE'];      payload: number }
  | { type: MsgKey['MODEL_PROGRESS'];    payload: ModelLoadStatus }
  | { type: MsgKey['KEEPALIVE'] }

export type MessageOf<T extends Message['type']> = Extract<Message, { type: T }>

export type ResponseFor<T extends Message['type']> =
  T extends MsgKey['GET_STATE'] ? StorageState : void
