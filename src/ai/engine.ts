import { pipeline, env } from '@huggingface/transformers'
import { MODEL_ID, MODEL_DTYPE_WEBGPU, MODEL_DTYPE_WASM } from '@shared/constants'
import type { ModelLoadStatus } from '@shared/types'
import { requestModelRun, MODEL_REVISION, ModelDownloadProgress } from '@shared/model-plan'

// Transformers.js progress event shape (v3)
interface TFProgressEvent {
  status: string
  name?: string
  file?: string
  progress?: number   // 0–100
  loaded?: number
  total?: number
}

// ─── Public types (consumed by prompts.ts and infer.ts) ──────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GenerateOptions {
  maxNewTokens?: number
  doSample?:     boolean
}

// ─── Internal pipeline shape ──────────────────────────────────────────────────
// Gemma 4 E2B is an any-to-any (multimodal) model. Content items can be
// { type: 'text', text: '...' } objects or plain strings depending on the
// pipeline version. generated_text on output mirrors the same union.

interface ContentItem  { type: string; text?: string }
interface RawMessage   { role: string; content: string | ContentItem[] }
interface AnyToAnyOut  { generated_text: RawMessage[] | string }
type AnyToAnyPipeline = (
  input: RawMessage[],
  opts?: Record<string, unknown>,
) => Promise<AnyToAnyOut[]>

type Device = 'webgpu' | 'wasm'

export class GemmaEngine {
  private pipe: AnyToAnyPipeline | null = null
  private initPromise: Promise<void> | null = null
  private progressCb: ((s: ModelLoadStatus) => void) | null = null
  private _device: Device = 'wasm'
  private filesLoaded   = 0
  private currentFile   = ''
  private quotaExceeded = false
  private lastProgressAt = 0
  private lastProgressPhase = ''

  get isReady(): boolean { return this.pipe !== null }
  get device(): Device   { return this._device }

  onProgress(cb: (s: ModelLoadStatus) => void): void {
    this.progressCb = cb
  }

  async ensureReady(): Promise<void> {
    if (this.pipe) return
    this.initPromise ??= this.load()
    return this.initPromise
  }

  async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string | null> {
    if (!this.pipe) return null

    const { maxNewTokens = 150, doSample = false } = options

    const result = await this.pipe(messages as RawMessage[], {
      max_new_tokens: maxNewTokens,
      do_sample: doSample,
    })

    const gen = result[0]?.generated_text
    if (Array.isArray(gen)) {
      const last = gen.at(-1)
      if (!last) return null
      const c = last.content
      if (typeof c === 'string') return c || null
      if (Array.isArray(c)) return c.find((x) => x.type === 'text')?.text ?? null
    }
    if (typeof gen === 'string') return gen || null
    return null
  }

  private emit(status: ModelLoadStatus): void {
    // Avoid filling the serialized background queue with per-chunk storage writes,
    // so Cancel remains responsive during a multi-gigabyte transfer.
    if (status.phase === 'downloading' || status.phase === 'loading') {
      const now = Date.now()
      if (this.lastProgressPhase === status.phase && now - this.lastProgressAt < 250) return
      this.lastProgressPhase = status.phase
      this.lastProgressAt = now
    }
    this.progressCb?.(status)
  }


  private async load(): Promise<void> {
    this.emit({ phase: 'checking' })

    const run = await requestModelRun()
    if (!run) throw new Error('Enable local AI before loading a model.')
    const device = run.device
    this._device = device
    const progress = new ModelDownloadProgress(device)
    this.filesLoaded = 0
    this.quotaExceeded = false

    env.allowRemoteModels = run.allowDownload
    env.allowLocalModels = true
    env.useBrowserCache   = true
    env.useWasmCache      = false  // Cache API rejects chrome-extension:// URLs

    // Override the CDN default that Transformers.js v4 sets at module load time.
    // Chrome's CSP blocks loading scripts from external origins; serve ORT locally.
    const ortBase = chrome.runtime.getURL('')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    env.backends.onnx.wasm!.wasmPaths = {
      mjs:  `${ortBase}ort-wasm-simd-threaded.asyncify.mjs`,
      wasm: `${ortBase}ort-wasm-simd-threaded.asyncify.wasm`,
    }

    const dtype = device === 'webgpu' ? MODEL_DTYPE_WEBGPU : MODEL_DTYPE_WASM

    // Intercept console.warn during pipeline() to detect Cache API quota errors.
    // The HuggingFace library catches QuotaExceededError internally and logs it
    // as a warning — it never propagates to our catch block.
    const restoreWarn = this.interceptQuotaWarnings()

    try {
      const raw = await pipeline('text-generation', MODEL_ID, {
        device,
        dtype,
        revision: MODEL_REVISION,
        local_files_only: !run.allowDownload,
        progress_callback: (raw: unknown) => {
          const info = raw as TFProgressEvent
          const fileName = info.file ?? info.name ?? ''
          if (!run.allowDownload) {
            if (info.status === 'done') this.filesLoaded++
            this.emit({ phase: 'loading', file: fileName, filesLoaded: this.filesLoaded })
          } else if (info.status === 'progress') {
            this.emit({ phase: 'downloading', ...progress.update(fileName, info.loaded ?? 0), file: fileName })
          } else if (info.status === 'initiate' || info.status === 'download') {
            if (fileName) this.currentFile = fileName
            if (run.allowDownload) this.emit({ phase: 'downloading', ...progress.update(fileName, 0), file: fileName })
          } else if (info.status === 'done') {
            this.filesLoaded++
            const current = progress.update(fileName, 0, true)
            this.emit(current.progress >= 1 || !run.allowDownload
              ? { phase: 'loading', file: this.currentFile, filesLoaded: this.filesLoaded }
              : { phase: 'downloading', ...current, file: fileName })
          }
        },
      })

      this.pipe = raw as unknown as AnyToAnyPipeline

      const storageWarning = this.quotaExceeded ? 'Some model files could not be cached. A future download may be needed; Angel will ask first.' : undefined
      this.emit({ phase: 'ready', device, ...(storageWarning ? { storageWarning } : {}) })
    } catch (err) {
      const reason = run.allowDownload
        ? 'AI setup did not finish. Check your connection and available storage, then try again. If this device cannot prepare the model, try the other processor option.'
        : 'Saved model files could not be loaded. They may be missing or incompatible. You can retry setup after reviewing the download size.'
      console.error('[GemmaEngine] load failed:', err)
      this.emit({ phase: 'error', reason })
      this.initPromise = null
      throw err
    } finally {
      restoreWarn()
    }
  }

  private interceptQuotaWarnings(): () => void {
    const original = console.warn.bind(console)
    console.warn = (...args: unknown[]) => {
      if (args.some(a => typeof a === 'string' && a.includes('QuotaExceededError'))) {
        this.quotaExceeded = true
        return  // handled — storageWarning shown in popup instead
      }
      original(...args)
    }
    return () => { console.warn = original }
  }
}

export const engine = new GemmaEngine()
