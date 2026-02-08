export interface ForceLayoutExecutionPlan {
  iterations: number;
  useApproximateRepulsion: boolean;
  repulsionOffsets: number[];
  estimatedPairChecksPerIteration: number;
}

const MIN_ITERATIONS = 1;
const MAX_ITERATIONS = 160;
const MIN_ADAPTIVE_ITERATIONS = 6;
const EXACT_PAIRWISE_THRESHOLD = 420;
const PAIR_CHECK_BUDGET_PER_ITERATION = 120_000;
const MIN_APPROX_OFFSETS = 4;
const MAX_APPROX_OFFSETS = 44;

function clampInt(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, safe));
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function estimatePairChecks(nodeCount: number, offsets: number[]): number {
  if (nodeCount <= 1 || offsets.length === 0) {
    return 0;
  }
  return Math.round((nodeCount * offsets.length) / 2);
}

export function buildRepulsionOffsets(nodeCount: number, desiredCount: number): number[] {
  const count = clampInt(nodeCount, 0, Number.MAX_SAFE_INTEGER);
  if (count < 3) {
    return [];
  }

  const desired = clampInt(desiredCount, 1, Math.max(1, count - 1));
  const offsets: number[] = [];
  const seen = new Set<number>();
  const baseStep = Math.max(1, Math.floor((count - 1) / desired));

  for (let candidate = baseStep; candidate < count && offsets.length < desired; candidate += baseStep) {
    const normalized = ((candidate % (count - 1)) + (count - 1)) % (count - 1) + 1;
    if (seen.has(normalized)) continue;
    if (greatestCommonDivisor(normalized, count) !== 1) continue;
    seen.add(normalized);
    offsets.push(normalized);
  }

  if (offsets.length < desired) {
    for (let fallback = 1; fallback < count && offsets.length < desired; fallback += 1) {
      if (seen.has(fallback)) continue;
      seen.add(fallback);
      offsets.push(fallback);
    }
  }

  return offsets;
}

export function planForceLayoutExecution(nodeCount: number, requestedIterations: number): ForceLayoutExecutionPlan {
  const count = Math.max(0, Math.round(nodeCount));
  const requested = clampInt(requestedIterations, MIN_ITERATIONS, MAX_ITERATIONS);
  if (count <= 1) {
    return {
      iterations: requested,
      useApproximateRepulsion: false,
      repulsionOffsets: [],
      estimatedPairChecksPerIteration: 0,
    };
  }

  const densityScale = count <= 240 ? 1 : Math.max(0.16, Math.sqrt(240 / count));
  const adaptiveIterations = clampInt(
    Math.max(MIN_ADAPTIVE_ITERATIONS, requested * densityScale),
    MIN_ITERATIONS,
    requested
  );

  if (count <= EXACT_PAIRWISE_THRESHOLD) {
    return {
      iterations: adaptiveIterations,
      useApproximateRepulsion: false,
      repulsionOffsets: [],
      estimatedPairChecksPerIteration: Math.round((count * (count - 1)) / 2),
    };
  }

  const targetOffsets = clampInt(
    (PAIR_CHECK_BUDGET_PER_ITERATION * 2) / count,
    MIN_APPROX_OFFSETS,
    MAX_APPROX_OFFSETS
  );
  const offsets = buildRepulsionOffsets(count, targetOffsets);

  return {
    iterations: adaptiveIterations,
    useApproximateRepulsion: offsets.length > 0,
    repulsionOffsets: offsets,
    estimatedPairChecksPerIteration: estimatePairChecks(count, offsets),
  };
}
