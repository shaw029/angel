import { pipeline, env } from '@huggingface/transformers'
import { MODEL_ID, MODEL_DTYPE_WEBGPU, MODEL_DTYPE_WASM } from '@shared/constants'
import type { ModelLoadStatus } from '@shared/types'
import { isCached, markCached } from './cache'

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

class GemmaEngine {
  private pipe: AnyToAnyPipeline | null = null
  private initPromise: Promise<void> | null = null
  private progressCb: ((s: ModelLoadStatus) => void) | null = null
  private _device: Device = 'wasm'
  private filesLoaded = 0
  private currentFile  = ''  // last file to start downloading (not last to finish)

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
    this.progressCb?.(status)
  }

  private async load(): Promise<void> {
    this.emit({ phase: 'checking' })

    const device = await detectDevice()
    this._device = device

    env.allowRemoteModels = true
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

    const alreadyCached = await isCached(MODEL_ID, device)
    const dtype = device === 'webgpu' ? MODEL_DTYPE_WEBGPU : MODEL_DTYPE_WASM

    try {
      const raw = await pipeline('text-generation', MODEL_ID, {
        device,
        dtype,
        progress_callback: (raw: unknown) => {
          if (alreadyCached) return
          const info = raw as TFProgressEvent
          const fileName = info.file ?? info.name ?? ''

          if (info.status === 'progress' && info.progress !== undefined) {
            this.emit({
              phase: 'downloading',
              progress: (info.progress ?? 0) / 100,
              file: fileName,
            })
          } else if (info.status === 'initiate' || info.status === 'download') {
            if (fileName) this.currentFile = fileName
            this.emit({ phase: 'loading', file: this.currentFile, filesLoaded: this.filesLoaded })
          } else if (info.status === 'done') {
            this.filesLoaded++
            // Don't update currentFile on done — keep showing the in-progress file
            this.emit({ phase: 'loading', file: this.currentFile, filesLoaded: this.filesLoaded })
          }
        },
      })

      this.pipe = raw as unknown as AnyToAnyPipeline

      if (!alreadyCached) await markCached(MODEL_ID, device)
      this.emit({ phase: 'ready', device })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error('[GemmaEngine] load failed:', err)
      this.emit({ phase: 'error', reason })
      this.initPromise = null
      throw err
    }
  }
}

async function detectDevice(): Promise<Device> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return 'wasm'
  try {
    const gpu = (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu
    const adapter = await gpu.requestAdapter()
    return adapter ? 'webgpu' : 'wasm'
  } catch {
    return 'wasm'
  }
}

export const engine = new GemmaEngine()
