import type {
  BrowsingSignal,
  CompressedContext,
  Intervention,
  StorageState,
  BehavioralEvent,
  ModelLoadStatus,
} from './types'
import type { MSG } from './constants'

type MsgKey = typeof MSG

export type Message =
  | { type: MsgKey['BROWSING_SIGNAL'];   payload: BrowsingSignal }
  | { type: MsgKey['BEHAVIORAL_EVENTS']; payload: BehavioralEvent[] }
  | { type: MsgKey['AI_CONTEXT'];        payload: CompressedContext }
  | { type: MsgKey['INTERVENTION'];      payload: Intervention }
  | { type: MsgKey['DISMISSED'];         payload: { id: string; dwellMs: number; outcome: 'accepted' | 'dismissed' } }
  | { type: MsgKey['GET_STATE'] }
  | { type: MsgKey['SET_ENABLED'];       payload: boolean }
  | { type: MsgKey['SET_PRESENCE'];      payload: number }
  | { type: MsgKey['MODEL_PROGRESS'];    payload: ModelLoadStatus }
  | { type: MsgKey['KEEPALIVE'] }

export type MessageOf<T extends Message['type']> = Extract<Message, { type: T }>

export type ResponseFor<T extends Message['type']> =
  T extends MsgKey['GET_STATE'] ? StorageState : void
