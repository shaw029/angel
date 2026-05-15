import type {
  BrowsingSignal,
  TrackingResult,
  SignalLabel,
  SessionContext,
  PageContext,
  ScrollDepth,
  TimeBucket,
  TabActivity,
} from '@shared/types'
import { classifyDomain } from './domain'

export function buildSessionContext(
  signal: BrowsingSignal,
  _tracking: TrackingResult[],
  signals: SignalLabel[],
): SessionContext {
  return {
    minutes_active: Math.round(signal.timeOnPage / 60),
    doom_scrolling:  signals.includes('doom_scrolling'),
    rapid_clicking:  signals.includes('rapid_interaction'),
    tab_activity:    tabActivity(signal.switchCount),
  }
}

export function buildPageContext(signal: BrowsingSignal): PageContext {
  return {
    category:    classifyDomain(signal.domain),
    scroll_depth: scrollDepth(signal.scrollDepth),
    duration:     timeBucket(signal.timeOnPage),
  }
}

function tabActivity(switchCount: number): TabActivity {
  if (switchCount >= 8) return 'restless'
  if (switchCount >= 3) return 'moderate'
  return 'focused'
}

function scrollDepth(depth: number): ScrollDepth {
  if (depth >= 0.70) return 'deep'
  if (depth >= 0.25) return 'medium'
  return 'shallow'
}

function timeBucket(seconds: number): TimeBucket {
  if (seconds >= 1800) return 'long'       // 30+ min
  if (seconds >= 600)  return 'extended'   // 10–30 min
  if (seconds >= 120)  return 'moderate'   // 2–10 min
  return 'brief'
}
