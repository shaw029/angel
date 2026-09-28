export const env = { allowRemoteModels: true, allowLocalModels: true, useBrowserCache: true, useWasmCache: false, backends: { onnx: { wasm: {} } } }
export const calls: any[] = []
export let fail = false
export function setFailure(value: boolean) { fail = value }
export async function pipeline(task: string, model: string, options: any) {
  calls.push({ task, model, options, remote: env.allowRemoteModels })
  if (fail) throw new Error('Fixture failure')
  return async () => [{ generated_text: 'fixture' }]
}
