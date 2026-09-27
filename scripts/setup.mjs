import { copyFile, mkdir } from 'node:fs/promises'
await mkdir('public', { recursive: true })
await copyFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', 'public/ort-wasm-simd-threaded.asyncify.wasm')
