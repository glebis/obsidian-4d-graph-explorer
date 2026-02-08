export interface LabelPerformanceProfile {
  renderIntervalMs: number;
  maxVisibleLabels: number;
  maxCandidatePool: number;
  minVisibility: number;
  minOpacity: number;
}

export function getLabelPerformanceProfile(labelCount: number): LabelPerformanceProfile {
  if (labelCount > 4500) {
    return {
      renderIntervalMs: 180,
      maxVisibleLabels: 18,
      maxCandidatePool: 100,
      minVisibility: 0.22,
      minOpacity: 0.24,
    };
  }
  if (labelCount > 2500) {
    return {
      renderIntervalMs: 140,
      maxVisibleLabels: 22,
      maxCandidatePool: 130,
      minVisibility: 0.18,
      minOpacity: 0.2,
    };
  }
  return {
    renderIntervalMs: 75,
    maxVisibleLabels: 24,
    maxCandidatePool: 160,
    minVisibility: 0.15,
    minOpacity: 0.25,
  };
}
