import { useEffect, useState } from 'react'
import type { StorageState, ModelLoadStatus, EvaluationMetrics, TrendDirection } from '@shared/types'
import { MSG, COOLDOWN_DEFAULT_MINUTES } from '@shared/constants'
import { getEvaluationMetrics } from '@memory/evaluation'

const STATE_DEFAULTS: Omit<StorageState, 'modelStatus'> = {
  enabled:                true,
  interventionCount:      0,
  lastIntervention:       null,
  cooldownMinutes:        COOLDOWN_DEFAULT_MINUTES,
  lastFullIntervention:   null,
  lastSubtleIntervention: null,
  recentDismissals:       [],
  suppressionMultiplier:  1.0,
}


function ModelStatusBadge({ status }: { status: ModelLoadStatus }) {
  // Track the highest progress seen so the bar never moves backwards.
  const [displayPct, setDisplayPct] = useState(0)

  useEffect(() => {
    if (status.phase === 'downloading') {
      const incoming = Math.round(status.progress * 100)
      setDisplayPct(prev => Math.max(prev, incoming))
    }
  }, [status])

  if (status.phase === 'idle' || status.phase === 'checking') return null

  if (status.phase === 'downloading' || status.phase === 'loading') {
    const showPct = status.phase === 'downloading'
    return (
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-ink-muted">Setting up your companion…</span>
          {showPct && (
            <span className="text-xs tabular-nums text-ink-muted">{displayPct}%</span>
          )}
        </div>
        <div className="h-1 w-full rounded-full bg-neutral-200 overflow-hidden">
          {showPct ? (
            <div
              className="h-full rounded-full bg-sage transition-all duration-700 ease-out"
              style={{ width: `${displayPct}%` }}
            />
          ) : (
            <div className="absolute h-full w-1/3 rounded-full bg-sage animate-slide" />
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-ink-muted">
          This happens once — the model stays on your device.
        </p>
      </div>
    )
  }

  if (status.phase === 'ready') {
    return (
      <div className="mt-3 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-sage" />
        <span className="text-xs text-ink-muted">
          AI ready · {status.device === 'webgpu' ? 'GPU' : 'CPU'}
        </span>
      </div>
    )
  }

  if (status.phase === 'error') {
    return (
      <div className="mt-3">
        <span className="text-xs text-amber-500">Model unavailable — nudges paused</span>
        {status.reason && (
          <p className="mt-1 text-[10px] text-amber-400 break-all">{status.reason}</p>
        )}
      </div>
    )
  }

  return null
}

// ─── Insight panel ────────────────────────────────────────────────────────────
// Observational, non-gamified. Shows what's been building, not a score.

function trendLabel(dir: TrendDirection): string {
  if (dir === 'improving')         return '↑'
  if (dir === 'needs_attention')   return '↓'
  if (dir === 'stable')            return '→'
  return ''
}

function trendColor(dir: TrendDirection): string {
  if (dir === 'improving')       return 'text-sage'
  if (dir === 'needs_attention') return 'text-amber-400'
  return 'text-ink-muted'
}

interface InsightRow {
  label: string
  value: string
  trend?: TrendDirection
}

function buildInsightRows(m: EvaluationMetrics): InsightRow[] {
  const rows: InsightRow[] = []

  if (m.postNudgeRecoveryRate !== null) {
    const pct = Math.round(m.postNudgeRecoveryRate * 100)
    rows.push({
      label: 'Loop exits after nudge',
      value: `${pct}%`,
      trend: m.recoveryTrend,
    })
  }

  if (m.reflectiveEngagementRate !== null) {
    const pct = Math.round(m.reflectiveEngagementRate * 100)
    rows.push({
      label: 'Nudges with reflection',
      value: `${pct}%`,
      trend: m.engagementTrend,
    })
  }

  if (m.recoveryDurationMinutes !== null) {
    rows.push({
      label: 'Avg loop recovery',
      value: `${Math.round(m.recoveryDurationMinutes)} min`,
      trend: m.recoveryTrend,
    })
  }

  if (m.awarenessBuilding && m.escalationDepthMinutes !== null) {
    rows.push({
      label: 'Catching loops at',
      value: `${Math.round(m.escalationDepthMinutes)} min in`,
    })
  }

  return rows.slice(0, 3)
}

function InsightPanel({ metrics }: { metrics: EvaluationMetrics }) {
  const hasData = metrics.totalInterventions >= 5

  if (!hasData) {
    return (
      <div className="mt-4 pt-3 border-t border-neutral-100">
        <p className="text-[11px] text-ink-muted leading-relaxed">
          Building your awareness picture — a few more sessions and patterns will emerge.
        </p>
      </div>
    )
  }

  const rows = buildInsightRows(metrics)
  if (rows.length === 0) return null

  const weekLabel = metrics.weeksActive > 0
    ? `${metrics.weeksActive} week${metrics.weeksActive !== 1 ? 's' : ''}`
    : 'This session'

  return (
    <div className="mt-4 pt-3 border-t border-neutral-100">
      <p className="text-[10px] text-ink-muted mb-2">{weekLabel} of awareness data</p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-[11px] text-ink-muted">{row.label}</span>
            <span className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-ink-secondary">{row.value}</span>
              {row.trend && row.trend !== 'insufficient_data' && (
                <span className={`text-[10px] font-medium ${trendColor(row.trend)}`}>
                  {trendLabel(row.trend)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
  const [state,       setState      ] = useState<Omit<StorageState, 'modelStatus'> | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelLoadStatus>({ phase: 'idle' })
  const [metrics,     setMetrics    ] = useState<EvaluationMetrics | null>(null)

  // Read state directly from storage — no service worker round-trip needed
  useEffect(() => {
    chrome.storage.local.get('state', (result) => {
      setState({ ...STATE_DEFAULTS, ...(result.state ?? {}) })
    })
    chrome.storage.session.get('modelStatus', (result) => {
      if (result.modelStatus) setModelStatus(result.modelStatus as ModelLoadStatus)
    })
    // Evaluation metrics — read from IDB directly (same extension origin)
    getEvaluationMetrics().then(setMetrics).catch(() => null)
  }, [])

  // Live model progress — two sources so we never miss an update:
  // 1. Direct runtime messages (popup is open when event fires)
  // 2. Storage changes (popup opened after event fired, reads latest from session)
  useEffect(() => {
    function onMessage(message: { type: string; payload?: unknown }) {
      if (message.type === MSG.MODEL_PROGRESS) {
        setModelStatus(message.payload as ModelLoadStatus)
      }
    }
    function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>) {
      if (changes.modelStatus?.newValue) {
        setModelStatus(changes.modelStatus.newValue as ModelLoadStatus)
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    chrome.storage.session.onChanged.addListener(onStorageChanged)
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      chrome.storage.session.onChanged.removeListener(onStorageChanged)
    }
  }, [])

  async function toggle() {
    if (!state) return
    const next = !state.enabled
    setState((s) => (s ? { ...s, enabled: next } : s))
    // Write directly to storage and notify background (for any in-flight logic)
    const current = await new Promise<Record<string, unknown>>(
      (resolve) => chrome.storage.local.get('state', resolve)
    )
    chrome.storage.local.set({ state: { ...STATE_DEFAULTS, ...(current.state as object), enabled: next } })
    chrome.runtime.sendMessage({ type: MSG.SET_ENABLED, payload: next })
  }

  if (!state) {
    return (
      <div className="w-60 p-4 flex items-center justify-center bg-surface">
        <div className="h-4 w-4 rounded-full border-2 border-sage border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="w-60 p-5 bg-surface font-sans">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-primary">Angel</span>
        <button
          onClick={toggle}
          role="switch"
          aria-checked={state.enabled}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
            state.enabled ? 'bg-sage' : 'bg-neutral-200'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              state.enabled ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        {state.enabled
          ? 'Quietly watching for moments worth pausing on.'
          : 'Paused — no nudges will appear.'}
      </p>

      {state.interventionCount > 0 && (
        <p className="mt-3 text-xs text-ink-secondary">
          {state.interventionCount} nudge{state.interventionCount !== 1 ? 's' : ''} offered
        </p>
      )}

      {metrics && <InsightPanel metrics={metrics} />}

      <ModelStatusBadge status={modelStatus} />
    </div>
  )
}
