// Screenshot-only stub. Replaces @memory/evaluation (IndexedDB) with a fixed,
// representative sample so store images are deterministic. The popup component
// itself is the real one.
export async function getEvaluationMetrics() {
  return {
    weeksActive:              3,
    totalInterventions:       41,
    acceptanceRate:           0.62,
    reflectiveEngagementRate: 0.48,
    postNudgeRecoveryRate:    0.64,
    recoveryDurationMinutes:  11,
    escalationDepthMinutes:   9,
    toleranceLevel:           0.94,
    recoveryTrend:            'improving',
    engagementTrend:          'improving',
    awarenessBuilding:        false,
    weeklyTrends:             [],
  }
}
