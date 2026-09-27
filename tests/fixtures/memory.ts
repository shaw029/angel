export const transitions: unknown[][] = []
export const counts = new Map<string, number>()
export const incrementPattern = async (key: string) => { counts.set(key, (counts.get(key) ?? 0) + 1) }
export const getMemorySummary = async () => undefined
export const recordInterventionOutcome = async () => {}
export const recordSessionEnd = async () => {}
export const recordStateTransition = async (...args: unknown[]) => { transitions.push(args) }
export const recordStateInterventionOutcome = async () => {}
export const recordReflectiveEngagement = async () => {}

export const recordStateInterventionShown = async () => {}
