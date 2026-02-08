import type { Vec4 } from './math4d';
import { planForceLayoutExecution } from './forceLayoutPlan';

export interface RawGraphNode {
  id?: string | number;
  label?: string;
  category?: string;
  size?: number;
  importance?: number;
  summary?: string;
  description?: string;
  emoji?: string;
  media?: Array<unknown> | null;
  imageUrl?: string;
  thumbnailUrl?: string;
  color?: number;
  raw?: unknown;
}

export interface RawGraphLink {
  source?: string | number;
  target?: string | number;
  from?: string | number;
  to?: string | number;
  a?: string | number;
  b?: string | number;
  start?: string | number;
  end?: string | number;
  value?: number;
  strength?: number;
  type?: string;
  kind?: string;
  description?: string;
  summary?: string;
}

export interface GraphNodeMeta {
  id: string;
  label: string;
  emoji: string;
  category: string;
  size: number;
  color: [number, number, number];
  importance: number | null;
  summary: string;
  media: Array<unknown>;
  imageUrl: string;
  thumbnailUrl: string;
  raw: RawGraphNode | null;
}

export interface GraphLinkMeta {
  index: number;
  sourceIndex: number;
  targetIndex: number;
  value: number;
  type: string;
  description: string;
  color: [number, number, number];
}

export interface GraphMeta {
  type: 'graph';
  nodes: GraphNodeMeta[];
  links: GraphLinkMeta[];
  categories: string[];
  vertexColors: Float32Array;
  vertexSizes: Float32Array;
  maxLinkValue: number;
  adjacency: number[][];
  summary: string;
  query: string;
}

export interface NarrativeGraph {
  name: string;
  vertices: Vec4[];
  edges: Array<[number, number]>;
  meta: GraphMeta;
}

export interface GraphDataPayload {
  nodes?: RawGraphNode[];
  links?: RawGraphLink[];
  summary?: string;
  query?: string;
}

export interface GraphLayoutConfig {
  MAJOR_RADIUS: number;
  MINOR_RADIUS_BASE: number;
  MINOR_RADIUS_SCALE: number;
  CLUSTER_SPREAD: number;
  BASE_LIGHTEN: number;
}

export interface GraphBuildOptions {
  fallbackData?: GraphDataPayload;
  graphName?: string;
}

export interface ForceLayoutConfig {
  iterations: number;
  repelForce: number;
  centerForce: number;
  linkForce: number;
  linkDistance: number;
}

const EDGE_TYPE_COLORS: Record<string, number> = {
  therapeutic: 0x4fc3f7,
  romantic: 0xff6f91,
  emotional: 0xffb74d,
  environmental: 0x81c784,
  professional: 0x9575cd,
  technological: 0x64b5f6,
  skill: 0xba68c8,
  cognitive: 0x4db6ac,
  social: 0xff8a65,
  financial: 0xffca28,
  aspiration: 0xff80ab,
  systemic: 0x90a4ae,
  conflict: 0xff5252,
  comparison: 0xa1887f,
  creative: 0xf48fb1,
  learning: 0x4dd0e1,
  energy: 0x7e57c2,
  temporal: 0x7986cb,
  technological_alt: 0x4db6f2,
  health: 0x4db6ac,
  relationship: 0xff8a80,
  values: 0xce93d8,
  resource: 0x81d4fa,
  influence: 0xffcc80,
  inspiration: 0x90caf9,
  collaboration: 0xffab91,
  default: 0xb0bec5,
};

const CATEGORY_EMOJI: Record<string, string> = {
  person: '🧑',
  concept: '🧠',
  event: '📅',
  idea: '💡',
  book: '📘',
  media: '📺',
  organization: '🏛️',
  technology: '🛠️',
  place: '📍',
  movement: '🌐',
  discipline: '📚',
  theme: '🎯',
  practice: '🌀',
  history: '📜',
  science: '🔬',
  art: '🎨',
  philosophy: '🧭',
  psychology: '🧠',
  society: '🌍',
  culture: '🎭',
  image: '🖼️',
  default: '🔹',
};

const TWO_PI = Math.PI * 2;

const DEFAULT_LAYOUT: GraphLayoutConfig = {
  MAJOR_RADIUS: 1.08,
  MINOR_RADIUS_BASE: 0.55,
  MINOR_RADIUS_SCALE: 0.32,
  CLUSTER_SPREAD: 0.72,
  BASE_LIGHTEN: 0.22,
};

let currentLayoutConfig: GraphLayoutConfig = { ...DEFAULT_LAYOUT };

const DEFAULT_FORCE_LAYOUT: ForceLayoutConfig = {
  iterations: 48,
  repelForce: 0,
  centerForce: 0,
  linkForce: 0,
  linkDistance: 1.6,
};

let currentForceLayout: ForceLayoutConfig = { ...DEFAULT_FORCE_LAYOUT };

export function updateLayoutConfig(config: Partial<GraphLayoutConfig> = {}): void {
  currentLayoutConfig = {
    ...currentLayoutConfig,
    ...config,
  };
}

export function resetLayoutConfig(): void {
  currentLayoutConfig = { ...DEFAULT_LAYOUT };
}

export function getLayoutConfig(): GraphLayoutConfig {
  return { ...currentLayoutConfig };
}

export function updateForceLayoutConfig(config: Partial<ForceLayoutConfig> = {}): void {
  currentForceLayout = {
    ...currentForceLayout,
    ...config,
  };
  if (!Number.isFinite(currentForceLayout.iterations) || currentForceLayout.iterations <= 0) {
    currentForceLayout.iterations = DEFAULT_FORCE_LAYOUT.iterations;
  }
  if (!Number.isFinite(currentForceLayout.linkDistance) || currentForceLayout.linkDistance <= 0) {
    currentForceLayout.linkDistance = DEFAULT_FORCE_LAYOUT.linkDistance;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hueToChannel = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToChannel(p, q, h + 1 / 3);
  const g = hueToChannel(p, q, h);
  const b = hueToChannel(p, q, h - 1 / 3);
  return [r, g, b];
}

function intToRgb(intColor: number): [number, number, number] {
  const value = intColor >>> 0;
  return [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
}

function lightenColor(rgb: [number, number, number]): [number, number, number] {
  return rgb.map((channel) => clamp01(currentLayoutConfig.BASE_LIGHTEN + channel * (1 - currentLayoutConfig.BASE_LIGHTEN))) as [number, number, number];
}

function stringHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function colorFromCategory(category: string): [number, number, number] {
  const key = category.toLowerCase();
  const hash = stringHash(key);
  const hue = (hash % 360) / 360;
  const rgb = hslToRgb(hue, 0.55, 0.58);
  return lightenColor(rgb);
}

function emojiFromCategory(category?: string): string {
  if (!category) return CATEGORY_EMOJI.default;
  const key = category.toLowerCase();
  return CATEGORY_EMOJI[key] || CATEGORY_EMOJI.default;
}

function edgeColor(type?: string): [number, number, number] {
  if (!type) return lightenColor(intToRgb(EDGE_TYPE_COLORS.default));
  const key = type.toLowerCase();
  if (EDGE_TYPE_COLORS[key]) {
    return lightenColor(intToRgb(EDGE_TYPE_COLORS[key]));
  }
  return colorFromCategory(key);
}

interface NormalizedNode {
  id: string;
  label: string;
  category: string;
  size: number;
  importance: number | null;
  summary: string;
  emoji: string;
  media: Array<unknown>;
  imageUrl: string;
  thumbnailUrl: string;
  color: [number, number, number];
  raw: RawGraphNode | null;
}

function normalizeNode(node: RawGraphNode | null | undefined, index: number): NormalizedNode | null {
  if (!node) {
    return null;
  }
  const id = String(node.id ?? node.label ?? index);
  const label = node.label ?? id;
  const category = node.category ?? 'uncategorized';
  const importance = Number.isFinite(node.importance) ? Number(node.importance) : null;

  // Check if this is a MOC node
  const isMoc = node.raw && typeof node.raw === 'object' && 'isMoc' in node.raw && node.raw.isMoc;

  const baseSize = Number.isFinite(node.size)
    ? Number(node.size)
    : (importance ? 8 + (Math.max(1, Math.min(importance, 5)) - 1) * 4 : 12);

  // MOC nodes get 2x size
  const finalSize = isMoc ? baseSize * 2 : baseSize;

  const summary = node.summary || node.description || '';
  const emoji = node.emoji || emojiFromCategory(category);
  const media = Array.isArray(node.media) ? node.media : [];
  const imageUrl = node.imageUrl || '';
  const thumbnailUrl = node.thumbnailUrl || '';

  // MOC nodes get a distinctive golden color
  let color: [number, number, number];
  if (isMoc) {
    color = [1.0, 0.84, 0.0]; // Golden color for MOC nodes
  } else if (Number.isFinite(node.color)) {
    color = lightenColor(intToRgb(Number(node.color)));
  } else {
    color = colorFromCategory(category);
  }

  return {
    id,
    label,
    category,
    size: finalSize,
    importance,
    summary,
    emoji,
    media,
    imageUrl,
    thumbnailUrl,
    color,
    raw: node,
  };
}

interface NormalizedLink {
  sourceIndex: number;
  targetIndex: number;
  value: number;
  type: string;
  description: string;
  color: [number, number, number];
}

function normalizeLink(link: RawGraphLink | null | undefined, indexById: Map<string, number>): NormalizedLink | null {
  if (!link) return null;
  const sourceId = link.source ?? link.from ?? link.a ?? link.start;
  const targetId = link.target ?? link.to ?? link.b ?? link.end;
  if (sourceId === undefined || targetId === undefined) return null;
  const sourceKey = String(sourceId);
  const targetKey = String(targetId);
  const sourceIndex = indexById.get(sourceKey);
  const targetIndex = indexById.get(targetKey);
  if (sourceIndex === undefined || targetIndex === undefined) return null;
  const type = (link.type || link.kind || 'connection').toLowerCase();
  const value = Number.isFinite(link.value)
    ? Number(link.value)
    : (Number.isFinite(link.strength) ? Number(link.strength) : 1);
  const description = link.description || link.summary || '';
  return {
    sourceIndex,
    targetIndex,
    value,
    type,
    description,
    color: edgeColor(type),
  };
}

interface LayoutResult {
  vertices: Vec4[];
  vertexColors: Float32Array;
  vertexSizes: Float32Array;
  nodeMeta: GraphNodeMeta[];
  adjacency: Array<Set<number>>;
  categories: string[];
}

function layoutNodes(normalizedNodes: NormalizedNode[]): LayoutResult {
  const categoryBuckets = new Map<string, Array<{ node: NormalizedNode; index: number }>>();
  const categoryOrder: string[] = [];

  normalizedNodes.forEach((node, index) => {
    const key = node.category || 'uncategorized';
    if (!categoryBuckets.has(key)) {
      categoryBuckets.set(key, []);
      categoryOrder.push(key);
    }
    categoryBuckets.get(key)!.push({ node, index });
  });

  const totalCategories = categoryOrder.length || 1;
  const nodeCount = normalizedNodes.length;
  const sizeValues = normalizedNodes.map((node) => node.size || 1);
  const minSize = Math.min(...sizeValues);
  const maxSize = Math.max(...sizeValues);
  const sizeRange = maxSize - minSize || 1;

  const vertices: Vec4[] = new Array(nodeCount);
  const vertexColors = new Float32Array(nodeCount * 3);
  const vertexSizes = new Float32Array(nodeCount);
  const nodeMeta: GraphNodeMeta[] = new Array(nodeCount);
  const adjacency: Array<Set<number>> = Array.from({ length: nodeCount }, () => new Set<number>());

  categoryOrder.forEach((category, catIndex) => {
    const bucket = categoryBuckets.get(category);
    if (!bucket) return;
    const bucketSize = bucket.length;
    const thetaCenter = (catIndex / totalCategories) * TWO_PI;
    const thetaExtent = (TWO_PI / totalCategories) * currentLayoutConfig.CLUSTER_SPREAD;

    bucket.forEach(({ node, index }, itemIndex) => {
      const spread = bucketSize > 1 ? (itemIndex / (bucketSize - 1)) - 0.5 : 0;
      const theta = thetaCenter + spread * thetaExtent;

      const sizeNorm = sizeRange === 0 ? 0.5 : (node.size - minSize) / sizeRange;
      const minorRadius = currentLayoutConfig.MINOR_RADIUS_BASE + sizeNorm * currentLayoutConfig.MINOR_RADIUS_SCALE;

      const phiBase = bucketSize > 0 ? (itemIndex / bucketSize) * TWO_PI : 0;
      const phiNoise = (stringHash(node.id) % 360) * 0.0008;
      const phi = phiBase + phiNoise;

      const x = currentLayoutConfig.MAJOR_RADIUS * Math.cos(theta);
      const y = currentLayoutConfig.MAJOR_RADIUS * Math.sin(theta);
      const z = minorRadius * Math.cos(phi);
      const w = minorRadius * Math.sin(phi);

      vertices[index] = [x, y, z, w];

      vertexColors[index * 3] = node.color[0];
      vertexColors[index * 3 + 1] = node.color[1];
      vertexColors[index * 3 + 2] = node.color[2];

      const sizeBase = 10 + sizeNorm * 16;
      vertexSizes[index] = sizeBase;

      nodeMeta[index] = {
        id: node.id,
        label: node.label,
        emoji: node.emoji,
        category: node.category,
        size: node.size,
        color: node.color,
        importance: node.importance,
        summary: node.summary,
        media: node.media,
        imageUrl: node.imageUrl,
        thumbnailUrl: node.thumbnailUrl,
        raw: node.raw ?? null,
      };
    });
  });

  return {
    vertices,
    vertexColors,
    vertexSizes,
    nodeMeta,
    adjacency,
    categories: categoryOrder,
  };
}

interface LinkBuildResult {
  edges: Array<[number, number]>;
  linkMeta: GraphLinkMeta[];
  maxLinkValue: number;
}

function buildLinks(rawLinks: NormalizedLink[], adjacency: Array<Set<number>>): LinkBuildResult {
  const edges: Array<[number, number]> = [];
  const linkMeta: GraphLinkMeta[] = [];
  let maxLinkValue = 0;

  rawLinks.forEach((link, linkIndex) => {
    edges.push([link.sourceIndex, link.targetIndex]);
    adjacency[link.sourceIndex].add(link.targetIndex);
    adjacency[link.targetIndex].add(link.sourceIndex);
    const value = link.value ?? 1;
    if (value > maxLinkValue) maxLinkValue = value;
    linkMeta.push({
      index: linkIndex,
      sourceIndex: link.sourceIndex,
      targetIndex: link.targetIndex,
      value,
      type: link.type,
      description: link.description,
      color: link.color,
    });
  });

  return { edges, linkMeta, maxLinkValue: maxLinkValue || 10 };
}

function shouldApplyForceLayout(config: ForceLayoutConfig): boolean {
  return (
    (config.repelForce ?? 0) > 0 ||
    (config.centerForce ?? 0) > 0 ||
    (config.linkForce ?? 0) > 0
  );
}

function applyForceLayout(vertices: Vec4[], edges: Array<[number, number]>, config: ForceLayoutConfig): void {
  if (!shouldApplyForceLayout(config)) return;
  const count = vertices.length;
  if (count === 0) return;

  const plan = planForceLayoutExecution(count, config.iterations || DEFAULT_FORCE_LAYOUT.iterations);
  const iterations = plan.iterations;
  const repel = Math.max(0, config.repelForce);
  const center = Math.max(0, config.centerForce);
  const linkStrength = Math.max(0, config.linkForce);
  const targetDistance = Math.max(0.05, config.linkDistance || DEFAULT_FORCE_LAYOUT.linkDistance);

  const positions: Vec4[] = vertices.map((vertex) => [...vertex] as Vec4);
  const velocities: Vec4[] = Array.from({ length: count }, () => [0, 0, 0, 0] as Vec4);
  const forces: Vec4[] = Array.from({ length: count }, () => [0, 0, 0, 0] as Vec4);

  const damping = 0.85;
  const timeStep = 0.02;
  const epsilon = 0.0001;

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < count; i += 1) {
      const f = forces[i];
      f[0] = 0;
      f[1] = 0;
      f[2] = 0;
      f[3] = 0;
    }

    if (repel > 0) {
      if (plan.useApproximateRepulsion && plan.repulsionOffsets.length > 0) {
        for (let offsetIndex = 0; offsetIndex < plan.repulsionOffsets.length; offsetIndex += 1) {
          const baseOffset = plan.repulsionOffsets[offsetIndex];
          const rotatedOffset = (baseOffset + iter * 3) % count || 1;
          for (let i = 0; i < count; i += 1) {
            const j = (i + rotatedOffset) % count;
            if (j <= i) continue;
            const pi = positions[i];
            const pj = positions[j];
            let dx = pi[0] - pj[0];
            let dy = pi[1] - pj[1];
            let dz = pi[2] - pj[2];
            let dw = pi[3] - pj[3];
            const distSq = dx * dx + dy * dy + dz * dz + dw * dw + epsilon;
            const scale = repel / distSq;
            dx *= scale;
            dy *= scale;
            dz *= scale;
            dw *= scale;
            forces[i][0] += dx;
            forces[i][1] += dy;
            forces[i][2] += dz;
            forces[i][3] += dw;
            forces[j][0] -= dx;
            forces[j][1] -= dy;
            forces[j][2] -= dz;
            forces[j][3] -= dw;
          }
        }
      } else {
        for (let i = 0; i < count; i += 1) {
          for (let j = i + 1; j < count; j += 1) {
            const pi = positions[i];
            const pj = positions[j];
            let dx = pi[0] - pj[0];
            let dy = pi[1] - pj[1];
            let dz = pi[2] - pj[2];
            let dw = pi[3] - pj[3];
            const distSq = dx * dx + dy * dy + dz * dz + dw * dw + epsilon;
            const scale = repel / distSq;
            dx *= scale;
            dy *= scale;
            dz *= scale;
            dw *= scale;
            forces[i][0] += dx;
            forces[i][1] += dy;
            forces[i][2] += dz;
            forces[i][3] += dw;
            forces[j][0] -= dx;
            forces[j][1] -= dy;
            forces[j][2] -= dz;
            forces[j][3] -= dw;
          }
        }
      }
    }

    if (center > 0) {
      for (let i = 0; i < count; i += 1) {
        const pos = positions[i];
        forces[i][0] -= pos[0] * center;
        forces[i][1] -= pos[1] * center;
        forces[i][2] -= pos[2] * center;
        forces[i][3] -= pos[3] * center;
      }
    }

    if (linkStrength > 0 && edges.length > 0) {
      for (let index = 0; index < edges.length; index += 1) {
        const [aIndex, bIndex] = edges[index];
        const pa = positions[aIndex];
        const pb = positions[bIndex];
        let dx = pb[0] - pa[0];
        let dy = pb[1] - pa[1];
        let dz = pb[2] - pa[2];
        let dw = pb[3] - pa[3];
        const distSq = dx * dx + dy * dy + dz * dz + dw * dw;
        if (distSq < epsilon) continue;
        const dist = Math.sqrt(distSq);
        const diff = dist - targetDistance;
        const limitedDiff = Math.max(-targetDistance * 3, Math.min(diff, targetDistance * 3));
        const scale = (linkStrength * limitedDiff) / dist;
        dx *= scale;
        dy *= scale;
        dz *= scale;
        dw *= scale;
        forces[aIndex][0] += dx;
        forces[aIndex][1] += dy;
        forces[aIndex][2] += dz;
        forces[aIndex][3] += dw;
        forces[bIndex][0] -= dx;
        forces[bIndex][1] -= dy;
        forces[bIndex][2] -= dz;
        forces[bIndex][3] -= dw;
      }
    }

    for (let i = 0; i < count; i += 1) {
      const vel = velocities[i];
      const force = forces[i];
      vel[0] = (vel[0] + force[0] * timeStep) * damping;
      vel[1] = (vel[1] + force[1] * timeStep) * damping;
      vel[2] = (vel[2] + force[2] * timeStep) * damping;
      vel[3] = (vel[3] + force[3] * timeStep) * damping;
      positions[i][0] += vel[0];
      positions[i][1] += vel[1];
      positions[i][2] += vel[2];
      positions[i][3] += vel[3];
    }
  }

  const centroid: Vec4 = [0, 0, 0, 0];
  for (let i = 0; i < count; i += 1) {
    const pos = positions[i];
    centroid[0] += pos[0];
    centroid[1] += pos[1];
    centroid[2] += pos[2];
    centroid[3] += pos[3];
  }
  const invCount = 1 / count;
  centroid[0] *= invCount;
  centroid[1] *= invCount;
  centroid[2] *= invCount;
  centroid[3] *= invCount;

  let maxRadiusSq = 0;
  for (let i = 0; i < count; i += 1) {
    const pos = positions[i];
    pos[0] -= centroid[0];
    pos[1] -= centroid[1];
    pos[2] -= centroid[2];
    pos[3] -= centroid[3];
    const radiusSq = pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2] + pos[3] * pos[3];
    if (radiusSq > maxRadiusSq) maxRadiusSq = radiusSq;
  }

  const maxRadius = Math.sqrt(maxRadiusSq);
  const clampRadius = 8.8;
  const scale = maxRadius > clampRadius ? clampRadius / maxRadius : 1;

  for (let i = 0; i < count; i += 1) {
    const pos = positions[i];
    vertices[i][0] = pos[0] * scale;
    vertices[i][1] = pos[1] * scale;
    vertices[i][2] = pos[2] * scale;
    vertices[i][3] = pos[3] * scale;
  }
}

export function buildNarrativeGraphFromData(
  data: GraphDataPayload = {},
  options: GraphBuildOptions = {}
): NarrativeGraph {
  const { fallbackData, graphName = 'Narrative Graph' } = options;
  const { nodes = [], links = [], summary = '', query = '' } = data;

  if ((!Array.isArray(nodes) || nodes.length === 0) && fallbackData) {
    return buildNarrativeGraphFromData(fallbackData, options);
  }

  const normalizedNodes = (nodes ?? [])
    .map((node, index) => normalizeNode(node, index))
    .filter((value): value is NormalizedNode => Boolean(value));

  const indexById = new Map<string, number>();
  normalizedNodes.forEach((node, index) => {
    indexById.set(String(node.id), index);
  });

  const normalizedLinks = (links ?? [])
    .map((link) => normalizeLink(link, indexById))
    .filter((value): value is NormalizedLink => Boolean(value));

  const layout = layoutNodes(normalizedNodes);
  const { edges, linkMeta, maxLinkValue } = buildLinks(normalizedLinks, layout.adjacency);

  applyForceLayout(layout.vertices, edges, currentForceLayout);

  return {
    name: graphName,
    vertices: layout.vertices,
    edges,
    meta: {
      type: 'graph',
      nodes: layout.nodeMeta,
      links: linkMeta,
      categories: layout.categories,
      vertexColors: layout.vertexColors,
      vertexSizes: layout.vertexSizes,
      maxLinkValue,
      adjacency: layout.adjacency.map((set) => Array.from(set)),
      summary,
      query,
    },
  };
}
