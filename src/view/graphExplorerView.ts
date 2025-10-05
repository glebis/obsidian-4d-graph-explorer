import { ItemView, Notice, WorkspaceLeaf, TFile } from 'obsidian';
import { Vector3 } from 'three';
import { HyperRenderer } from '../hyper/render/renderer';
import { HyperControls } from '../hyper/controls/controls';
import { OBJECTS, getObjectByName, getNarrativeGraphObject, getNarrativeGraphSample, replaceNarrativeGraph, type HyperObject } from '../hyper/core/objects';
import { composeRotation, applyMatrix, type RotationAngles, type Vec4 } from '../hyper/core/math4d';
import { getTheme, themeList } from '../hyper/render/palette';
import { buildVaultGraph, type VaultGraphOptions } from '../data/vaultGraph';
import type { GraphDataPayload } from '../hyper/core/graph';

export const HYPER_VIEW_TYPE = 'obsidian-4d-graph-explorer';

interface SliceState {
  mode: 'projection' | 'hyperplane' | 'shadow';
  offset: number;
  thickness: number;
}

interface ProjectionState {
  wCamera: number;
  scale: number;
  scaleTarget?: number;
}

interface CameraState {
  zoom: number;
}

interface GraphRenderState {
  focusNode: number | null;
  glow: number;
  pointOpacity: number;
  nodeScale: number;
  vertexVisibility?: number[] | null;
  edgeVisibility?: number[] | null;
}

interface RotationState extends RotationAngles {
  xy: number;
  xz: number;
  xw: number;
  yz: number;
  yw: number;
  zw: number;
}

interface RenderState {
  rotation: RotationState;
  slice: SliceState;
  projection: ProjectionState;
  camera: CameraState;
  autoRotate: boolean;
  autoSpeed: number;
  themeId: string;
  graph: GraphRenderState;
}

interface GraphLabelPayload {
  positions: Array<[number, number, number]>;
  labels: Array<{
    id: string;
    label: string;
    summary: string;
    category: string;
    emoji?: string;
    media?: unknown[];
    imageUrl?: string;
    thumbnailUrl?: string;
  }>;
  vertexVisibility?: number[] | null;
  graphState?: GraphRenderState | null;
}

interface DatasetOption {
  id: string;
  label: string;
  type: 'shape' | 'graph';
  objectName?: string;
  vaultOptions?: VaultGraphOptions;
}

const DATASET_OPTIONS: DatasetOption[] = [
  { id: 'vault-local', label: 'Vault · Local (active note)', type: 'graph', vaultOptions: { scope: 'local', includeCanvas: true, depth: 2 } },
  { id: 'vault-global', label: 'Vault · Global Graph', type: 'graph', vaultOptions: { scope: 'global', includeCanvas: true } },
  { id: 'narrative', label: 'Sample Narrative Graph', type: 'graph' },
  { id: 'tesseract', label: 'Tesseract (Hypercube)', type: 'shape', objectName: 'Tesseract' },
  { id: 'fivecell', label: '5-Cell Simplex', type: 'shape', objectName: '5-Cell' },
  { id: 'sixteencell', label: '16-Cell Hypercross', type: 'shape', objectName: '16-Cell' },
  { id: 'duocylinder', label: 'Duocylinder Lattice', type: 'shape', objectName: 'Duocylinder' },
];

function createOption(el: HTMLSelectElement, { id, label }: { id: string; label: string }) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = label;
  el.appendChild(option);
}

function createButton(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  if (title) button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

export class GraphExplorerView extends ItemView {
  private rootEl!: HTMLDivElement;
  private canvasEl!: HTMLCanvasElement;
  private overlayEl!: HTMLDivElement;
  private labelLayer!: HTMLDivElement;
  private labelElements: HTMLDivElement[] = [];
  private toolbarEl!: HTMLDivElement;
  private statusEl!: HTMLSpanElement;
  private nodeInfoEl!: HTMLDivElement;
  private imageStripEl!: HTMLDivElement;
  private renderer!: HyperRenderer;
  private controls!: HyperControls;
  private animationId: number | null = null;
  private state: RenderState;
  private activeObject: HyperObject;
  private transformedVertices: Vec4[] = [];
  private lastGraphPayload: GraphLabelPayload | null = null;
  private selectedDataset: string;
  private selectedNodeIndex: number | null = null;
  private lastRenderedNodeSignature: string | null = null;
  private tempVec = new Vector3();
  private themeCycle = themeList();

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    const hasActiveFile = Boolean(this.app.workspace.getActiveFile());
    this.selectedDataset = hasActiveFile ? 'vault-local' : 'vault-global';
    this.state = {
      rotation: { xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 },
      slice: { mode: 'projection', offset: 0, thickness: 0.24 },
      projection: { wCamera: 3.2, scale: 1.08 },
      camera: { zoom: 1 },
      autoRotate: true,
      autoSpeed: 0.85,
      themeId: 'neon',
      graph: { focusNode: null, glow: 0.6, pointOpacity: 0.95, nodeScale: 1.0 },
    };
    this.activeObject = getNarrativeGraphObject();
  }

  getViewType(): string {
    return HYPER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '4D Graph Explorer';
  }

  getIcon(): string {
    return 'network';
  }

  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl.createDiv({ cls: 'hyper-view-container' });

    this.canvasEl = this.rootEl.createEl('canvas', { cls: 'hyper-view-canvas' });
    this.overlayEl = this.rootEl.createDiv({ cls: 'hyper-overlay' });
    this.labelLayer = this.overlayEl.createDiv({ cls: 'hyper-label-layer' });

    this.toolbarEl = this.rootEl.createDiv({ cls: 'hyper-toolbar' });
    this.statusEl = this.toolbarEl.createEl('span', { text: 'Loading…' });

    const datasetSelect = this.toolbarEl.createEl('select');
    DATASET_OPTIONS.forEach((option) => createOption(datasetSelect, option));
    datasetSelect.value = this.selectedDataset;
    datasetSelect.addEventListener('change', async (event) => {
      const value = (event.target as HTMLSelectElement).value;
      this.selectedDataset = value;
      await this.loadSelectedDataset();
    });

    const themeSelect = this.toolbarEl.createEl('select');
    this.themeCycle.forEach((theme) => createOption(themeSelect, { id: theme.id, label: theme.name }));
    themeSelect.value = this.state.themeId;
    themeSelect.addEventListener('change', () => {
      this.state.themeId = themeSelect.value;
    });

    const refreshBtn = createButton('Refresh Graph', () => {
      void this.loadSelectedDataset(true);
    }, 'Rebuilds the current vault graph dataset');

    const autoBtn = createButton('Pause Spin', () => {
      this.state.autoRotate = !this.state.autoRotate;
      autoBtn.textContent = this.state.autoRotate ? 'Pause Spin' : 'Resume Spin';
    }, 'Toggle automatic 4D rotation');

    const sliceBtn = createButton('Slice', () => {
      const order: Array<SliceState['mode']> = ['projection', 'hyperplane', 'shadow'];
      const nextIndex = (order.indexOf(this.state.slice.mode) + 1) % order.length;
      this.state.slice.mode = order[nextIndex];
      this.showStatus(`Slice mode: ${this.state.slice.mode}`);
    }, 'Cycle through projection / hyperplane / shadow views');

    this.toolbarEl.appendChild(datasetSelect);
    this.toolbarEl.appendChild(themeSelect);
    this.toolbarEl.appendChild(refreshBtn);
    this.toolbarEl.appendChild(autoBtn);
    this.toolbarEl.appendChild(sliceBtn);

    this.imageStripEl = this.rootEl.createDiv({ cls: 'hyper-image-strip' });
    this.nodeInfoEl = this.rootEl.createDiv({ cls: 'hyper-node-info' });

    this.renderer = new HyperRenderer(this.canvasEl);
    this.renderer.setGraphLabelCallback((payload: GraphLabelPayload) => this.onGraphPayload(payload));

    this.controls = new HyperControls({
      canvas: this.canvasEl,
      state: this.state,
      callbacks: {
        rotation: () => this.requestRender(),
        slice: () => this.requestRender(),
        autorotate: () => this.requestRender(),
        zoom: () => this.updateCameraZoom(),
      },
    });

    this.canvasEl.addEventListener('click', (event) => this.handleCanvasClick(event));
    this.canvasEl.addEventListener('dblclick', (event) => this.handleCanvasDoubleClick(event));

    await this.loadSelectedDataset(false);
    this.startAnimationLoop();
  }

  async onClose(): Promise<void> {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  private showStatus(message: string) {
    if (this.statusEl) {
      this.statusEl.textContent = message;
    }
  }

  private updateCameraZoom() {
    const camera = (this.renderer as any).camera;
    if (!camera) return;
    camera.zoom = this.state.camera.zoom;
    camera.updateProjectionMatrix();
  }

  private requestRender() {
    // No-op placeholder: continuous loop handles rendering
  }

  async loadSelectedDataset(force = false) {
    const option = DATASET_OPTIONS.find((item) => item.id === this.selectedDataset) ?? DATASET_OPTIONS[0];
    try {
      this.showStatus(`Loading ${option.label}…`);
      if (option.type === 'shape' && option.objectName) {
        this.activeObject = getObjectByName(option.objectName);
      } else if (option.type === 'graph') {
        let graphData: GraphDataPayload;
        if (option.id === 'narrative') {
          graphData = getNarrativeGraphSample();
        } else if (option.vaultOptions) {
          const opts: VaultGraphOptions = {
            ...option.vaultOptions,
            rootFile: option.vaultOptions.scope === 'local' ? this.app.workspace.getActiveFile() : undefined,
          };
          if (opts.scope === 'local' && !opts.rootFile) {
            new Notice('Open a note to seed the local vault graph.');
          }
          graphData = await buildVaultGraph(this.app, opts);
        } else {
          graphData = { nodes: [], links: [], summary: '', query: '' };
        }
        this.activeObject = replaceNarrativeGraph(graphData, { graphName: option.label });
        this.selectedNodeIndex = 0;
        this.lastRenderedNodeSignature = null;
      }
      this.renderer.setObject(this.activeObject);
      this.transformedVertices = new Array(this.activeObject.vertices.length).fill(null) as Vec4[];
      this.labelElements.forEach((el) => { el.style.display = 'none'; });
      this.showStatus(`${option.label} ready`);
    } catch (error) {
      console.error('[4d-graph] Failed to load dataset', error);
      new Notice('Failed to load graph dataset. Check console for details.');
      this.showStatus('Load failed');
    }
  }

  private startAnimationLoop() {
    const loop = () => {
      this.animationId = requestAnimationFrame(loop);
      this.animateFrame();
    };
    loop();
  }

  private animateFrame() {
    if (!this.activeObject) return;

    if (this.state.autoRotate) {
      const speed = this.state.autoSpeed + 0.1;
      this.state.rotation.xy += 0.28 * speed * 0.016;
      this.state.rotation.xw += 0.24 * speed * 0.016;
      this.state.rotation.yz += 0.18 * speed * 0.016;
    }

    const rotationMatrix = composeRotation(this.state.rotation);
    for (let i = 0; i < this.activeObject.vertices.length; i += 1) {
      this.transformedVertices[i] = applyMatrix(this.activeObject.vertices[i], rotationMatrix);
    }

    if (this.state.projection.scaleTarget !== undefined) {
      this.state.projection.scale += (this.state.projection.scaleTarget - this.state.projection.scale) * 0.08;
      if (Math.abs(this.state.projection.scaleTarget - this.state.projection.scale) < 0.0001) {
        this.state.projection.scaleTarget = undefined;
      }
    }

    const theme = getTheme(this.state.themeId);

    this.renderer.renderFrame({
      vertices4d: this.transformedVertices,
      projection: this.state.projection,
      sliceMode: this.state.slice.mode,
      sliceOffset: this.state.slice.offset,
      sliceThickness: this.state.slice.thickness,
      theme,
      graphState: this.activeObject.meta?.type === 'graph' ? this.state.graph : null,
    });

    if (this.state.graph.focusNode !== this.selectedNodeIndex) {
      this.state.graph.focusNode = this.selectedNodeIndex;
    }

    if (this.activeObject.meta?.type !== 'graph') {
      this.nodeInfoEl.empty();
      this.imageStripEl.empty();
      this.lastRenderedNodeSignature = null;
    }
  }

  private onGraphPayload(payload: GraphLabelPayload) {
    this.lastGraphPayload = payload;
    if (this.selectedNodeIndex !== null) {
      this.updateNodeDetails(this.selectedNodeIndex);
    }
    this.renderLabels(payload);
  }

  private handleCanvasClick(event: MouseEvent) {
    const index = this.pickNodeFromEvent(event);
    if (index === null) {
      this.selectedNodeIndex = null;
      this.lastRenderedNodeSignature = null;
      this.nodeInfoEl.empty();
      this.imageStripEl.empty();
      if (this.lastGraphPayload) {
        this.renderLabels(this.lastGraphPayload);
      }
      return;
    }
    this.selectedNodeIndex = index;
    this.lastRenderedNodeSignature = null;
    this.updateNodeDetails(index);
    if (this.lastGraphPayload) {
      this.renderLabels(this.lastGraphPayload);
    }
  }

  private handleCanvasDoubleClick(event: MouseEvent) {
    const index = this.pickNodeFromEvent(event);
    if (index === null) return;
    this.selectedNodeIndex = index;
    this.lastRenderedNodeSignature = null;
    this.updateNodeDetails(index);
    if (this.lastGraphPayload) {
      this.renderLabels(this.lastGraphPayload);
    }
    void this.openNodeByIndex(index);
  }

  private pickNodeFromEvent(event: MouseEvent): number | null {
    if (!this.lastGraphPayload) return null;
    const camera = (this.renderer as any).camera;
    if (!camera) return null;
    const rect = this.canvasEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const pointerY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    let closestIndex: number | null = null;
    let closestDistance = 0.14;

    const visibility = this.lastGraphPayload.vertexVisibility;

    for (let index = 0; index < this.lastGraphPayload.positions.length; index += 1) {
      const pos = this.lastGraphPayload.positions[index];
      if (!pos) continue;
      const visible = visibility ? (visibility[index] ?? 0) > 0.05 : true;
      if (!visible) continue;
      this.tempVec.set(pos[0], pos[1], pos[2]).project(camera);
      if (!Number.isFinite(this.tempVec.x) || !Number.isFinite(this.tempVec.y)) continue;
      const dx = this.tempVec.x - pointerX;
      const dy = this.tempVec.y - pointerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestIndex = index;
      }
    }

    return closestIndex;
  }

  private updateNodeDetails(index: number) {
    if (!this.lastGraphPayload) return;
    const node = this.lastGraphPayload.labels[index];
    if (!node) return;

    const gallery = Array.isArray(node.media) ? (node.media as string[]) : [];
    const hero = node.imageUrl || node.thumbnailUrl || '';
    const signature = [node.id, node.summary ?? '', node.category ?? '', hero, gallery.slice(0, 3).join('|')].join('::');
    if (this.lastRenderedNodeSignature === signature) return;
    this.lastRenderedNodeSignature = signature;

    this.nodeInfoEl.empty();
    const title = this.nodeInfoEl.createEl('h2');
    title.textContent = node.emoji ? `${node.emoji} ${node.label}` : node.label;
    this.nodeInfoEl.createEl('p', { text: node.summary || 'No summary available yet.' });
    this.nodeInfoEl.createEl('p', { text: `Category: ${node.category}` });

    this.imageStripEl.empty();
    const images = hero ? [hero, ...gallery.filter((url) => url !== hero)] : gallery;

    if (images.length === 0) {
      this.imageStripEl.createSpan({ text: 'No media attached' });
      return;
    }

    images.forEach((url) => {
      const img = this.imageStripEl.createEl('img');
      img.src = url;
      img.alt = node.label;
      img.addEventListener('error', () => img.remove());
    });
  }

  private renderLabels(payload: GraphLabelPayload) {
    if (!this.labelLayer) return;
    const isGraph = this.activeObject.meta?.type === 'graph';
    if (!isGraph) {
      this.labelElements.forEach((el) => { el.style.display = 'none'; });
      return;
    }
    const camera = (this.renderer as any).camera;
    if (!camera) return;
    const rect = this.canvasEl.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width === 0 || height === 0) return;

    const { positions, labels, vertexVisibility } = payload;
    const focusIndex = this.selectedNodeIndex ?? -1;

    while (this.labelElements.length < labels.length) {
      const el = document.createElement('div');
      el.className = 'hyper-label';
      this.labelLayer.appendChild(el);
      this.labelElements.push(el);
    }

    for (let i = 0; i < this.labelElements.length; i += 1) {
      this.labelElements[i].style.display = 'none';
    }

    for (let i = 0; i < labels.length; i += 1) {
      const el = this.labelElements[i];
      const node = labels[i];
      const pos = positions[i];
      if (!el || !node || !pos) continue;
      const visibility = vertexVisibility ? vertexVisibility[i] ?? 0 : 1;
      if (visibility <= 0.02) {
        continue;
      }
      this.tempVec.set(pos[0], pos[1], pos[2]).project(camera);
      if (!Number.isFinite(this.tempVec.x) || !Number.isFinite(this.tempVec.y) || !Number.isFinite(this.tempVec.z)) {
        continue;
      }
      if (this.tempVec.z < -1 || this.tempVec.z > 1) continue;
      const ndcX = this.tempVec.x;
      const ndcY = this.tempVec.y;
      if (Math.abs(ndcX) > 1.2 || Math.abs(ndcY) > 1.2) continue;

      const depth = Math.min(1, Math.max(0, (this.tempVec.z + 1) / 2));
      const depthScale = 1 - depth * 0.85;
      const opacity = Math.max(0.18, Math.min(1, visibility * depthScale));
      const baseSize = focusIndex === i ? 20 : 14;
      const fontSize = baseSize + depthScale * 10;
      const x = (ndcX + 1) / 2 * width;
      const y = (-ndcY + 1) / 2 * height;
      el.textContent = node.emoji ? `${node.emoji} ${node.label}` : node.label;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.fontSize = `${fontSize.toFixed(1)}px`;
      el.style.opacity = opacity.toFixed(2);
      el.style.display = 'block';
      el.classList.toggle('hyper-label-focus', focusIndex === i);
    }
  }

  private async openNodeByIndex(index: number): Promise<void> {
    const payload = this.lastGraphPayload;
    if (!payload) return;
    const node = payload.labels[index];
    if (!node) return;
    const abstractFile = this.app.vault.getAbstractFileByPath(node.id);
    if (abstractFile instanceof TFile) {
      const leaf = this.app.workspace.getLeaf(false) ?? this.app.workspace.getLeaf(true);
      if (leaf) {
        await leaf.openFile(abstractFile);
      }
    } else if (node.id) {
      this.app.workspace.openLinkText(node.id, '', false);
    }
  }
}
