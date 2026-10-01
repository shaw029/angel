import manifest from '../../../src/shared/model-manifest.json'
const size = (profile: 'lite' | 'full', device: 'webgpu' | 'wasm') =>
  (Object.values(manifest.models[profile].files[device]).reduce((sum, bytes) => sum + bytes, 0) / 1e9).toFixed(1)

export function ModelDownloadNotice() {
  return <p className="mt-4 text-xs leading-relaxed text-ink-muted max-w-2xl mx-auto">
    AI runs on your device and requires a separate initial model download. Lite is approximately {size('lite', 'webgpu')} GB on GPU or {size('lite', 'wasm')} GB on CPU; Full is approximately {size('full', 'webgpu')} GB on GPU or {size('full', 'wasm')} GB on CPU.
    Files are cached for future use. An unmetered connection is recommended.
    The development build asks before downloading; earlier published versions may start setup automatically.
  </p>
}
