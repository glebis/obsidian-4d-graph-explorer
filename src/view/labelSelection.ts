export interface LabelCandidate {
  index: number;
  text: string;
  x: number;
  y: number;
  opacity: number;
  weight: number;
  fontSize: number;
  focus: boolean;
  mandatory?: boolean;
  missing: boolean;
}

function findMinWeightIndex(candidates: LabelCandidate[]): number {
  let minIndex = 0;
  let minWeight = candidates[0].weight;
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].weight < minWeight) {
      minWeight = candidates[i].weight;
      minIndex = i;
    }
  }
  return minIndex;
}

export function pushCandidateToPool(pool: LabelCandidate[], candidate: LabelCandidate, maxSize: number): void {
  if (maxSize <= 0) return;
  if (pool.length < maxSize) {
    pool.push(candidate);
    return;
  }
  const minIndex = findMinWeightIndex(pool);
  if (candidate.weight <= pool[minIndex].weight) {
    return;
  }
  pool[minIndex] = candidate;
}

export function pickVisibleLabels(
  candidates: LabelCandidate[],
  maxVisibleLabels: number,
  options: { overlapScale?: number } = {}
): LabelCandidate[] {
  if (candidates.length === 0 || maxVisibleLabels <= 0) {
    return [];
  }

  const overlapScale = Math.max(0.5, Math.min(2, options.overlapScale ?? 1));
  const mandatoryCandidates = candidates
    .filter((candidate) => candidate.mandatory)
    .sort((a, b) => b.weight - a.weight);
  const focusCandidate = candidates.find((candidate) => candidate.focus) ?? null;
  const sorted = [...candidates].sort((a, b) => b.weight - a.weight);
  const visible: LabelCandidate[] = [];

  for (const mandatoryCandidate of mandatoryCandidates) {
    if (visible.some((existing) => existing.index === mandatoryCandidate.index)) {
      continue;
    }
    visible.push({
      ...mandatoryCandidate,
      weight: Math.max(mandatoryCandidate.weight, mandatoryCandidate.focus ? 1.2 : mandatoryCandidate.weight),
    });
    if (visible.length >= maxVisibleLabels) {
      return visible;
    }
  }

  if (focusCandidate && !visible.some((candidate) => candidate.index === focusCandidate.index)) {
    visible.push({
      ...focusCandidate,
      weight: Math.max(focusCandidate.weight, 1.2),
    });
  }

  for (const candidate of sorted) {
    if (visible.some((existing) => existing.index === candidate.index)) {
      continue;
    }
    let overlaps = false;
    for (const existing of visible) {
      const dx = candidate.x - existing.x;
      const dy = candidate.y - existing.y;
      const threshold = Math.max(20, (candidate.fontSize + existing.fontSize) * 0.34 * overlapScale);
      if (dx * dx + dy * dy < threshold * threshold) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    visible.push(candidate);
    if (visible.length >= maxVisibleLabels) {
      break;
    }
  }

  return visible;
}
