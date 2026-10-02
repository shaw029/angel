import type { CompressedContext } from '../../src/shared/types'
import type { IntentFit } from '../../src/ai/intent-check'
export let checked: CompressedContext | undefined
let fit: IntentFit = 'diverges'
export function setIntentFit(value: IntentFit) { fit = value }
export async function checkIntent(ctx: CompressedContext) { checked = ctx; return fit }
