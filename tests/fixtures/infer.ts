import type { InferenceInput, InferenceOutput } from '../../src/shared/types'
export let lastInput: InferenceInput | undefined
let output: InferenceOutput | null = null
export function setOutput(value: InferenceOutput | null) { output = value }
export async function infer(input: InferenceInput) { lastInput = input; return output }
