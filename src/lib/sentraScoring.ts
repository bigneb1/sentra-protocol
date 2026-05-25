export function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function computeBrierScore(probabilityBps: number, outcome: boolean) {
  const probability = Math.max(0, Math.min(10_000, probabilityBps)) / 10_000;
  const realized = outcome ? 1 : 0;
  return (probability - realized) ** 2;
}

export function computeReputationDelta(brierScore: number) {
  const skill = 1 - Math.max(0, Math.min(1, brierScore));
  return (skill - 0.5) * 12;
}

export function computeNextReputation(previousScore: number, brierScore: number) {
  return clampScore(previousScore + computeReputationDelta(brierScore));
}

export function isPredictionCorrect(probabilityBps: number, outcome: boolean) {
  return probabilityBps >= 5_000 === outcome;
}
