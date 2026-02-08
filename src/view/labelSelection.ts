export interface LabelCandidate {
  index: number;
  text: string;
  x: number;
  y: number;
  opacity: number;
  weight: number;
  fontSize: number;
  focus: boolean;
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
  maxVisibleLabels: number
): LabelCandidate[] {
  if (candidates.length === 0 || maxVisibleLabels <= 0) {
    return [];
  }

  const focusCandidate = candidates.find((candidate) => candidate.focus) ?? null;
  const sorted = [...candidates].sort((a, b) => b.weight - a.weight);
  const visible: LabelCandidate[] = [];

  if (focusCandidate) {
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
      const threshold = Math.max(28, (candidate.fontSize + existing.fontSize) * 0.34);
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
