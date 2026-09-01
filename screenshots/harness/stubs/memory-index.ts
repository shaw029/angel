// Screenshot-only stub for @memory/index.
export async function getPatterns() {
  return {
    nudges_withheld: 118,
  }
}

export async function getCognitiveProfile() {
  return {
    id: 'profile', version: 1, updatedAt: Date.now(), observations: 240,
    vulnerabilityByHour: new Array(24).fill(0),
    stateStats: {
      compulsive_loop:     { shown: 14, accepted: 9 },
      emotionally_reactive:{ shown: 11, accepted: 8 },
      decision_fatigue:    { shown: 9,  accepted: 5 },
      fragmented_attention:{ shown: 7,  accepted: 4 },
    },
  }
}
