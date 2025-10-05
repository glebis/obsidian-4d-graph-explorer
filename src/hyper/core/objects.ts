import type { Vec4 } from './math4d';
import { normalize } from './math4d';
import type { GraphDataPayload, GraphBuildOptions, NarrativeGraph } from './graph';
import { buildNarrativeGraphFromData } from './graph';

export interface HyperObject {
  name: string;
  vertices: Array<Vec4>;
  edges: Array<[number, number]>;
  meta?: NarrativeGraph['meta'];
}

const SAMPLE_GRAPH_DATA: GraphDataPayload = {
  summary: 'Sample 4D graph seed',
  query: 'Sample',
  nodes: [
    { id: 'root', label: 'Vault', category: 'concept', size: 18, summary: 'Your notes in four dimensions.' },
    { id: 'canvas', label: 'Canvas Boards', category: 'canvas', size: 14, summary: 'Visual canvases and spatial layouts.' },
    { id: 'media', label: 'Images', category: 'image', size: 12, summary: 'Embedded attachments and artwork.' },
    { id: 'ideas', label: 'Ideas', category: 'idea', size: 15, summary: 'Evolving concepts and clippings.' },
    { id: 'people', label: 'People', category: 'person', size: 13, summary: 'Mentions of collaborators.' }
  ],
  links: [
    { source: 'root', target: 'canvas', type: 'creative', description: 'Canvas boards capture spatial thinking.' },
    { source: 'root', target: 'media', type: 'resource', description: 'Images enrich the graph nodes.' },
    { source: 'root', target: 'ideas', type: 'inspiration' },
    { source: 'ideas', target: 'people', type: 'social' },
    { source: 'media', target: 'canvas', type: 'creative' }
  ],
};

function createTesseract(size = 1): HyperObject {
  const vertices: Array<Vec4> = [];
  const indexByKey = new Map<string, number>();
  let idx = 0;
  for (const x of [-size, size]) {
    for (const y of [-size, size]) {
      for (const z of [-size, size]) {
        for (const w of [-size, size]) {
          const key = `${x},${y},${z},${w}`;
          indexByKey.set(key, idx);
          vertices.push([x, y, z, w]);
          idx += 1;
        }
      }
    }
  }
  const edges: Array<[number, number]> = [];
  vertices.forEach((vertex, i) => {
    for (let axis = 0; axis < 4; axis += 1) {
      const neighbor = vertex.slice() as Vec4;
      neighbor[axis] *= -1;
      const key = neighbor.join(',');
      const j = indexByKey.get(key);
      if (j !== undefined && j > i) {
        edges.push([i, j]);
      }
    }
  });
  return { name: 'Tesseract', vertices, edges };
}

function create16Cell(size = Math.SQRT1_2): HyperObject {
  const vertices: Array<Vec4> = [];
  const axes = [0, 1, 2, 3];
  axes.forEach((axis) => {
    const vertexPos: Vec4 = [0, 0, 0, 0];
    vertexPos[axis] = size;
    vertices.push(vertexPos);
    const vertexNeg: Vec4 = [0, 0, 0, 0];
    vertexNeg[axis] = -size;
    vertices.push(vertexNeg);
  });
  const edges: Array<[number, number]> = [];
  const count = vertices.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const vi = vertices[i];
      const vj = vertices[j];
      const dot = vi[0] * vj[0] + vi[1] * vj[1] + vi[2] * vj[2] + vi[3] * vj[3];
      if (dot > -size * size + 1e-6) {
        edges.push([i, j]);
      }
    }
  }
  return { name: '16-Cell', vertices, edges };
}

function create5Cell(size = 1): HyperObject {
  const phi = Math.sqrt(5);
  const vertices: Array<Vec4> = [
    [1, 1, 1, -1 / phi],
    [1, -1, -1, -1 / phi],
    [-1, 1, -1, -1 / phi],
    [-1, -1, 1, -1 / phi],
    [0, 0, 0, 4 / phi],
  ].map((v) => normalize(v.map((x) => x * size) as Vec4));
  const edges: Array<[number, number]> = [];
  const count = vertices.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      edges.push([i, j]);
    }
  }
  return { name: '5-Cell', vertices, edges };
}

function createDuocylinder({ major = 1, minor = 0.6, segments = 28 } = {}): HyperObject {
  const vertices: Array<Vec4> = [];
  const edges: Array<[number, number]> = [];
  for (let a = 0; a < segments; a += 1) {
    const theta = (a / segments) * Math.PI * 2;
    for (let b = 0; b < segments; b += 1) {
      const phi = (b / segments) * Math.PI * 2;
      const x = major * Math.cos(theta);
      const y = major * Math.sin(theta);
      const z = minor * Math.cos(phi);
      const w = minor * Math.sin(phi);
      vertices.push([x, y, z, w]);
      const currentIndex = a * segments + b;
      const right = a * segments + ((b + 1) % segments);
      const down = ((a + 1) % segments) * segments + b;
      edges.push([currentIndex, right]);
      edges.push([currentIndex, down]);
    }
  }
  return { name: 'Duocylinder', vertices, edges };
}

let narrativeGraph: HyperObject = buildNarrativeGraphFromData(SAMPLE_GRAPH_DATA);

const baseObjects: HyperObject[] = [
  createTesseract(),
  create16Cell(),
  create5Cell(),
  createDuocylinder(),
  narrativeGraph,
];

export const OBJECTS: HyperObject[] = baseObjects;

const NARRATIVE_GRAPH_INDEX = OBJECTS.length - 1;

export function getObjectByName(name: string): HyperObject {
  return OBJECTS.find((obj) => obj.name === name) || OBJECTS[0];
}

export function getNarrativeGraphObject(): HyperObject {
  return OBJECTS[NARRATIVE_GRAPH_INDEX];
}

export function replaceNarrativeGraph(data: GraphDataPayload, options: GraphBuildOptions = {}): HyperObject {
  narrativeGraph = buildNarrativeGraphFromData(data, options);
  OBJECTS[NARRATIVE_GRAPH_INDEX] = narrativeGraph;
  return narrativeGraph;
}

export function getNarrativeGraphSample(): GraphDataPayload {
  return SAMPLE_GRAPH_DATA;
}

