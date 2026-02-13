export interface RenderPerformanceProfile {
  maxPixelRatio: number;
  edgeStride: number;
}

const DEFAULT_PROFILE: RenderPerformanceProfile = {
  maxPixelRatio: 2,
  edgeStride: 1,
};

function clampInt(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, safe));
}

export function getRenderPerformanceProfile(nodeCount: number, edgeCount: number): RenderPerformanceProfile {
  const safeNodes = Math.max(0, clampInt(nodeCount, 0, Number.MAX_SAFE_INTEGER));
  const safeEdges = Math.max(0, clampInt(edgeCount, 0, Number.MAX_SAFE_INTEGER));

  if (safeNodes > 4500 || safeEdges > 14000) {
    return {
      maxPixelRatio: 1,
      edgeStride: 3,
    };
  }

  if (safeNodes > 2600 || safeEdges > 7000) {
    return {
      maxPixelRatio: 1.25,
      edgeStride: 2,
    };
  }

  if (safeNodes > 1400 || safeEdges > 3500) {
    return {
      maxPixelRatio: 1.5,
      edgeStride: 1,
    };
  }

  return DEFAULT_PROFILE;
}

