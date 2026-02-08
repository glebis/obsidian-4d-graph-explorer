import type { GraphMeta } from '../core/graph';

export type GraphInsightGroupKey =
  | 'components'
  | 'communities'
  | 'bridges'
  | 'loops'
  | 'suggestions';

export interface GraphHighlight {
  id: string;
  type: GraphInsightGroupKey;
  label: string;
  description?: string;
  nodes: number[];
  edges?: number[];
  score?: number;
}

export interface InsightGroup {
  key: GraphInsightGroupKey;
  title: string;
  description?: string;
  items: GraphHighlight[];
}

export interface GraphOverview {
  nodeCount: number;
  edgeCount: number;
  averageDegree: number;
  density: number;
  componentCount: number;
}

export interface GraphInsights {
  overview: GraphOverview;
  groups: InsightGroup[];
}

const DEFAULT_OVERVIEW: GraphOverview = {
  nodeCount: 0,
  edgeCount: 0,
  averageDegree: 0,
  density: 0,
  componentCount: 0,
};

function pairKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function toAdjacencySets(adjacency: number[][]): Array<Set<number>> {
  return adjacency.map((neighbors) => new Set(neighbors));
}

function computeComponents(adjacency: number[][]): number[][] {
  const nodeCount = adjacency.length;
  const visited = new Array(nodeCount).fill(false);
  const components: number[][] = [];

  for (let start = 0; start < nodeCount; start += 1) {
    if (visited[start]) continue;
    const queue: number[] = [start];
    visited[start] = true;
    const component: number[] = [];

    while (queue.length) {
      const node = queue.pop()!;
      component.push(node);
      const neighbors = adjacency[node] ?? [];
      for (let i = 0; i < neighbors.length; i += 1) {
        const neighbor = neighbors[i];
        if (visited[neighbor]) continue;
        visited[neighbor] = true;
        queue.push(neighbor);
      }
    }

    component.sort((a, b) => a - b);
    components.push(component);
  }

  components.sort((a, b) => b.length - a.length);
  return components;
}

function gatherEdgesWithin(meta: GraphMeta, nodeSet: Set<number>): number[] {
  const indices: number[] = [];
  meta.links.forEach((link, index) => {
    if (nodeSet.has(link.sourceIndex) && nodeSet.has(link.targetIndex)) {
      indices.push(index);
    }
  });
  return indices;
}

function detectCommunities(adjacency: number[][], degrees: number[]): number[][] {
  const nodeCount = adjacency.length;
  if (nodeCount === 0) return [];

  const labels = new Array<number>(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) {
    labels[i] = i;
  }

  const order = new Array<number>(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) {
    order[i] = i;
  }
  order.sort((a, b) => degrees[b] - degrees[a] || a - b);

  const maxIterations = Math.min(18, 4 + Math.ceil(Math.log2(Math.max(2, nodeCount)) * 6));

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false;

    for (let oi = 0; oi < nodeCount; oi += 1) {
      const node = order[(oi + iteration) % nodeCount];
      const neighbors = adjacency[node];
      if (!neighbors || neighbors.length === 0) continue;

      const scoreByLabel = new Map<number, number>();
      for (let ni = 0; ni < neighbors.length; ni += 1) {
        const neighbor = neighbors[ni];
        const label = labels[neighbor];
        const baseScore = scoreByLabel.get(label) ?? 0;
        scoreByLabel.set(label, baseScore + 1 + degrees[neighbor] * 0.001);
      }

      let bestLabel = labels[node];
      let bestScore = -Infinity;
      scoreByLabel.forEach((score, label) => {
        if (score > bestScore || (score === bestScore && label < bestLabel)) {
          bestLabel = label;
          bestScore = score;
        }
      });

      if (bestLabel !== labels[node]) {
        labels[node] = bestLabel;
        changed = true;
      }
    }

    if (!changed) break;
  }

  const groups = new Map<number, number[]>();
  labels.forEach((label, node) => {
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(node);
  });

  const result: number[][] = [];
  groups.forEach((nodes) => {
    nodes.sort((a, b) => a - b);
    if (nodes.length === 0) return;
    result.push(nodes);
  });

  result.sort((a, b) => b.length - a.length);
  return result;
}

function findBridges(adjacency: number[][]): Array<[number, number]> {
  const nodeCount = adjacency.length;
  const visited = new Array(nodeCount).fill(false);
  const discovery = new Array(nodeCount).fill(-1);
  const low = new Array(nodeCount).fill(-1);
  const parent = new Array(nodeCount).fill(-1);
  const bridges: Array<[number, number]> = [];
  let time = 0;

  function dfs(node: number) {
    visited[node] = true;
    discovery[node] = time;
    low[node] = time;
    time += 1;

    const neighbors = adjacency[node] ?? [];
    for (let i = 0; i < neighbors.length; i += 1) {
      const neighbor = neighbors[i];
      if (!visited[neighbor]) {
        parent[neighbor] = node;
        dfs(neighbor);
        low[node] = Math.min(low[node], low[neighbor]);
        if (low[neighbor] > discovery[node]) {
          bridges.push(node < neighbor ? [node, neighbor] : [neighbor, node]);
        }
      } else if (neighbor !== parent[node]) {
        low[node] = Math.min(low[node], discovery[neighbor]);
      }
    }
  }

  for (let i = 0; i < nodeCount; i += 1) {
    if (!visited[i]) dfs(i);
  }

  bridges.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  return bridges;
}

function findTriangles(adjacency: number[][], adjacencySets: Array<Set<number>>): number[][] {
  const nodeCount = adjacency.length;
  const seen = new Set<string>();
  const triangles: number[][] = [];

  for (let a = 0; a < nodeCount; a += 1) {
    const neighbors = adjacency[a] ?? [];
    for (let i = 0; i < neighbors.length; i += 1) {
      const b = neighbors[i];
      if (b <= a) continue;
      for (let j = i + 1; j < neighbors.length; j += 1) {
        const c = neighbors[j];
        if (c <= a || c === b) continue;
        if (!adjacencySets[b].has(c)) continue;
        const sorted = [a, b, c].sort((x, y) => x - y);
        const key = sorted.join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        triangles.push(sorted);
      }
    }
  }

  triangles.sort((a, b) => b.length - a.length);
  return triangles;
}

interface ConnectionSuggestion {
  nodes: [number, number];
  commonNeighbors: number[];
  score: number;
}

function suggestConnections(adjacency: number[][], adjacencySets: Array<Set<number>>): ConnectionSuggestion[] {
  const nodeCount = adjacency.length;
  const suggestions: ConnectionSuggestion[] = [];

  for (let a = 0; a < nodeCount; a += 1) {
    const neighborsA = adjacencySets[a];
    if (!neighborsA.size) continue;

    const candidateCounts = new Map<number, number>();

    neighborsA.forEach((neighbor) => {
      const neighborsOfNeighbor = adjacency[neighbor] ?? [];
      for (let i = 0; i < neighborsOfNeighbor.length; i += 1) {
        const candidate = neighborsOfNeighbor[i];
        if (candidate === a || neighborsA.has(candidate) || candidate <= a) continue;
        const current = candidateCounts.get(candidate) ?? 0;
        candidateCounts.set(candidate, current + 1);
      }
    });

    candidateCounts.forEach((count, candidate) => {
      if (count === 0) return;
      const neighborsB = adjacencySets[candidate] ?? new Set<number>();
      const union = neighborsA.size + neighborsB.size - count;
      if (union === 0) return;
      const score = count / union;
      if (score < 0.12 && count < 2) return;

      const commonNeighbors: number[] = [];
      const candidateNeighbors = adjacencySets[candidate] ?? new Set<number>();
      neighborsA.forEach((neighbor) => {
        if (candidateNeighbors.has(neighbor)) {
          commonNeighbors.push(neighbor);
        }
      });

      suggestions.push({
        nodes: [a, candidate],
        commonNeighbors,
        score,
      });
    });
  }

  suggestions.sort((a, b) => b.score - a.score || a.nodes[0] - b.nodes[0] || a.nodes[1] - b.nodes[1]);
  return suggestions;
}

function formatList(items: string[], limit = 3): string {
  if (items.length === 0) return '';
  const truncated = items.slice(0, limit);
  if (items.length > limit) {
    truncated.push(`…+${items.length - limit}`);
  }
  return truncated.join(', ');
}

function describeNodes(meta: GraphMeta, nodes: number[]): string {
  const labels = nodes.map((index) => meta.nodes[index]?.label ?? `#${index}`);
  return formatList(labels);
}

function describeTags(meta: GraphMeta, nodes: number[]): string {
  const tags = new Map<string, number>();
  nodes.forEach((index) => {
    const raw = meta.nodes[index]?.raw;
    const nodeTags = raw && typeof raw === 'object' && 'tags' in raw ? (raw as any).tags : null;
    if (Array.isArray(nodeTags)) {
      nodeTags.forEach((tag: unknown) => {
        if (typeof tag !== 'string') return;
        const normalized = tag.toLowerCase();
        tags.set(normalized, (tags.get(normalized) ?? 0) + 1);
      });
    }
  });

  const sorted = Array.from(tags.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  return formatList(sorted.map(([tag]) => `#${tag}`));
}

export function analyzeGraph(meta: GraphMeta | null | undefined): GraphInsights {
  if (!meta || meta.nodes.length === 0) {
    return {
      overview: DEFAULT_OVERVIEW,
      groups: [],
    };
  }

  const nodeCount = meta.nodes.length;
  const edgeCount = meta.links.length;
  const averageDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;
  const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1) * 0.5) : 0;

  const adjacency = Array.isArray(meta.adjacency) && meta.adjacency.length === nodeCount
    ? meta.adjacency
    : Array.from({ length: nodeCount }, () => [] as number[]);
  const adjacencySets = toAdjacencySets(adjacency);
  const degrees = adjacency.map((neighbors) => neighbors.length);
  const edgeIndexMap = new Map<string, number>();
  meta.links.forEach((link, index) => {
    edgeIndexMap.set(pairKey(link.sourceIndex, link.targetIndex), index);
  });

  const components = computeComponents(adjacency);
  const communities = detectCommunities(adjacency, degrees);
  const bridges = findBridges(adjacency);
  const triangles = findTriangles(adjacency, adjacencySets);
  const suggestions = suggestConnections(adjacency, adjacencySets);

  const overview: GraphOverview = {
    nodeCount,
    edgeCount,
    averageDegree: Number(averageDegree.toFixed(2)),
    density: Number(density.toFixed(4)),
    componentCount: components.length,
  };

  const componentItems: GraphHighlight[] = components
    .filter((nodes) => nodes.length > 0)
    .map((nodes, index) => {
      const nodeSet = new Set(nodes);
      const componentEdges = gatherEdgesWithin(meta, nodeSet);
      return {
        id: `component-${index + 1}`,
        type: 'components',
        label: `Component ${index + 1} · ${nodes.length} nodes`,
        description: describeTags(meta, nodes) || describeNodes(meta, nodes),
        nodes,
        edges: componentEdges,
        score: nodes.length,
      };
    });

  const communityItems: GraphHighlight[] = communities
    .filter((nodes) => nodes.length > 1)
    .map((nodes, index) => {
      const nodeSet = new Set(nodes);
      const intraEdges = gatherEdgesWithin(meta, nodeSet);
      const densityScore = nodes.length > 1
        ? intraEdges.length / (nodes.length * (nodes.length - 1) * 0.5)
        : 0;
      return {
        id: `community-${index + 1}`,
        type: 'communities',
        label: `Community ${index + 1} · ${nodes.length} nodes`,
        description: describeTags(meta, nodes) || describeNodes(meta, nodes),
        nodes,
        edges: intraEdges,
        score: Number(densityScore.toFixed(3)),
      };
    });

  const bridgeItems: GraphHighlight[] = bridges
    .map(([a, b], index) => {
      const edgeIndex = edgeIndexMap.get(pairKey(a, b));
      const labels = [meta.nodes[a], meta.nodes[b]].map((node) => node?.label ?? `#${node?.id ?? '?'}`);
      return {
        id: `bridge-${index + 1}`,
        type: 'bridges',
        label: `Bridge · ${labels[0]} ↔ ${labels[1]}`,
        description: 'Removing this link splits the surrounding cluster.',
        nodes: [a, b],
        edges: edgeIndex !== undefined ? [edgeIndex] : undefined,
        score: 1,
      };
    });

  const loopItems: GraphHighlight[] = triangles.slice(0, 20).map((nodes, index) => {
    const edgeIndices: number[] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      const b = nodes[(i + 1) % nodes.length];
      const edgeIndex = edgeIndexMap.get(pairKey(a, b));
      if (edgeIndex !== undefined) {
        edgeIndices.push(edgeIndex);
      }
    }
    return {
      id: `loop-${index + 1}`,
      type: 'loops',
      label: `Loop · ${describeNodes(meta, nodes)}`,
      description: 'Three-note feedback loop.',
      nodes,
      edges: edgeIndices,
      score: nodes.length,
    };
  });

  const suggestionItems: GraphHighlight[] = suggestions.slice(0, 12).map((suggestion, index) => {
    const [a, b] = suggestion.nodes;
    const commonLabels = suggestion.commonNeighbors
      .map((node) => meta.nodes[node]?.label ?? `#${node}`);
    const labelA = meta.nodes[a]?.label ?? `#${a}`;
    const labelB = meta.nodes[b]?.label ?? `#${b}`;
    return {
      id: `suggestion-${index + 1}`,
      type: 'suggestions',
      label: `Connect ${labelA} ↔ ${labelB}`,
      description: `Shared neighbors: ${formatList(commonLabels)}`,
      nodes: [a, b, ...suggestion.commonNeighbors],
      edges: undefined,
      score: Number(suggestion.score.toFixed(3)),
    };
  });

  const groups: InsightGroup[] = [];

  if (componentItems.length > 1) {
    groups.push({
      key: 'components',
      title: 'Disconnected Clusters',
      description: 'Notes that do not connect to the main vault graph.',
      items: componentItems,
    });
  }

  if (communityItems.length > 0) {
    groups.push({
      key: 'communities',
      title: 'Communities',
      description: 'Dense neighborhoods discovered via label propagation.',
      items: communityItems,
    });
  }

  if (bridgeItems.length > 0) {
    groups.push({
      key: 'bridges',
      title: 'Bridging Links',
      description: 'Edges whose removal would isolate clusters.',
      items: bridgeItems,
    });
  }

  if (loopItems.length > 0) {
    groups.push({
      key: 'loops',
      title: 'Feedback Loops',
      description: 'Triangular loops often reveal tightly-knit ideas.',
      items: loopItems,
    });
  }

  if (suggestionItems.length > 0) {
    groups.push({
      key: 'suggestions',
      title: 'Potential Connections',
      description: 'Pairs of notes that share neighbors but lack a direct link.',
      items: suggestionItems,
    });
  }

  return {
    overview,
    groups,
  };
}

export function summariseInsight(item: GraphHighlight, meta: GraphMeta): string {
  const labels = item.nodes
    .slice(0, 3)
    .map((index) => meta.nodes[index]?.label ?? `#${index}`);
  return `${item.label} (${formatList(labels)})`;
}
