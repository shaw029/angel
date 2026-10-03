import manifest from '../../../src/shared/model-manifest.json'
const size = (device: 'webgpu') => (Object.values(manifest.files[device]).reduce((sum, bytes) => sum + bytes, 0) / 1e9).toFixed(1)

export function ModelDownloadNotice() {
  return <p className="mt-4 text-xs leading-relaxed text-ink-muted max-w-2xl mx-auto">
    AI runs on your device, needs WebGPU, and requires a separate initial model download of approximately {size('webgpu')} GB.
    Files are cached for future use. An unmetered connection is recommended.
    The development build asks before downloading; earlier published versions may start setup automatically.
  </p>
}
