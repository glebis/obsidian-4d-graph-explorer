import type { GraphDataPayload, RawGraphLink, RawGraphNode } from '../hyper/core/graph';

export interface SyntheticGraphOptions {
  nodeCount: number;
  averageDegree: number;
  categoryCount: number;
  seed: number;
  connected: boolean;
}

const DEFAULT_OPTIONS: SyntheticGraphOptions = {
  nodeCount: 1200,
  averageDegree: 5.5,
  categoryCount: 8,
  seed: 42,
  connected: true,
};

const CATEGORY_POOL = [
  'note',
  'project',
  'idea',
  'person',
  'topic',
  'reference',
  'journal',
  'research',
  'meta',
  'canvas',
  'image',
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createPrng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function createSyntheticGraphPayload(input: Partial<SyntheticGraphOptions> = {}): GraphDataPayload {
  const options: SyntheticGraphOptions = {
    ...DEFAULT_OPTIONS,
    ...input,
  };
  const nodeCount = clamp(Math.round(options.nodeCount), 0, 50_000);
  const categoryCount = clamp(Math.round(options.categoryCount), 1, CATEGORY_POOL.length);
  const maxPossibleEdges = (nodeCount * (nodeCount - 1)) / 2;
  const avgDegree = clamp(options.averageDegree, 0, Math.max(0, nodeCount - 1));
  const targetEdges = Math.min(maxPossibleEdges, Math.round((nodeCount * avgDegree) / 2));
  const prng = createPrng(options.seed);

  const categories = CATEGORY_POOL.slice(0, categoryCount);
  const nodes: RawGraphNode[] = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) {
    const category = categories[i % categories.length];
    const importance = 1.2 + prng() * 4.5;
    nodes[i] = {
      id: `node-${i}`,
      label: `Node ${i}`,
      category,
      importance,
      size: 8 + importance * 2.4,
      summary: `Synthetic node ${i} in ${category}`,
    };
  }

  const links: RawGraphLink[] = [];
  const seenEdges = new Set<string>();

  if (options.connected && nodeCount > 1) {
    for (let i = 1; i < nodeCount && links.length < targetEdges; i += 1) {
      const key = edgeKey(i - 1, i);
      seenEdges.add(key);
      links.push({
        source: `node-${i - 1}`,
        target: `node-${i}`,
        value: 1 + Math.round(prng() * 2),
        type: 'reference',
      });
    }
  }

  const safetyLimit = Math.max(1, targetEdges * 12);
  let attempts = 0;
  while (links.length < targetEdges && attempts < safetyLimit) {
    attempts += 1;
    const a = Math.floor(prng() * nodeCount);
    const b = Math.floor(prng() * nodeCount);
    if (a === b) continue;
    const key = edgeKey(a, b);
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    links.push({
      source: `node-${a}`,
      target: `node-${b}`,
      value: 1 + Math.round(prng() * 2),
      type: 'reference',
    });
  }

  return {
    nodes,
    links,
    summary: `Synthetic graph (${nodeCount} nodes, ${links.length} links)`,
    query: `synthetic:n=${nodeCount},k≈${avgDegree.toFixed(1)}`,
  };
}
