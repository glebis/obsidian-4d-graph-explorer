import { ItemView, Notice, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import { Vector3 } from 'three';
import { HyperRenderer } from '../hyper/render/renderer';
import { HyperControls } from '../hyper/controls/controls';
import { OBJECTS, getObjectByName, getNarrativeGraphObject, getNarrativeGraphSample, replaceNarrativeGraph, type HyperObject } from '../hyper/core/objects';
import { composeRotation, applyMatrix, type RotationAngles, type Vec4 } from '../hyper/core/math4d';
import { getTheme, themeList } from '../hyper/render/palette';
import { buildVaultGraph, type VaultGraphOptions } from '../data/vaultGraph';
import type { GraphDataPayload } from '../hyper/core/graph';
import { analyzeGraph, type GraphHighlight, type GraphInsights } from '../hyper/analysis/graphInsights';
import type GraphExplorerPlugin from '../main';
import type { GraphExplorerSettings, ColorRule, ColorRuleType } from '../main';

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

type CameraPresetId = 'axial-front' | 'isometric-diagonal' | 'profile-x' | 'zenith-y';

interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  up?: [number, number, number];
  description?: string;
}

interface CameraState {
  zoom: number;
  preset: CameraPresetId;
}

interface GraphRenderState {
  focusNode: number | null;
  focusStrength: number;
  focusColor: [number, number, number];
  glow: number;
  pointOpacity: number;
  nodeScale: number;
  showLinks: boolean;
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
  { id: 'vault-local', label: 'Local', type: 'graph', vaultOptions: { scope: 'local', includeCanvas: true, depth: 2 } },
  { id: 'vault-global', label: 'Global', type: 'graph', vaultOptions: { scope: 'global', includeCanvas: true } },
];

const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'axial-front',
    label: 'Axial · Facing Z',
    position: [0, 0, 5.6],
    description: 'Head-on perspective that keeps distances intuitive when first orienting within the graph.',
  },
  {
    id: 'isometric-diagonal',
    label: 'Isometric · XYZ',
    position: [4.2, 3.2, 5.2],
    description: 'Balanced diagonal framing so clusters along multiple axes stay visible at once.',
  },
  {
    id: 'profile-x',
    label: 'Profile · X-axis',
    position: [6.4, 0.6, 0],
    description: 'Side-on view that stretches structures projected along W, Y, and Z into focus.',
  },
  {
    id: 'zenith-y',
    label: 'Zenith · Top-down',
    position: [0.4, 6.5, 0.2],
    description: 'Bird’s-eye orientation to understand layers and hyperplane slices through W.',
    up: [0, 0, 1],
  },
];

function createOption(el: HTMLSelectElement, { id, label, title }: { id: string; label: string; title?: string }) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = label;
  if (title) option.title = title;
  el.appendChild(option);
}

function createButton(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (title) button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

function createIconButton(icon: string, onClick: () => void, options: { title?: string; ariaLabel?: string } = {}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('hyper-icon-button');
  if (options.title) button.title = options.title;
  if (options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
  else if (options.title) button.setAttribute('aria-label', options.title);
  button.addEventListener('click', onClick);
  setIcon(button, icon);
  return button;
}

export class GraphExplorerView extends ItemView {
  private plugin: GraphExplorerPlugin;
  private rootEl!: HTMLDivElement;
  private canvasEl!: HTMLCanvasElement;
  private overlayEl!: HTMLDivElement;
  private labelLayer!: HTMLDivElement;
  private labelElements: HTMLDivElement[] = [];
  private toolbarEl!: HTMLDivElement;
  private statusEl!: HTMLSpanElement;
  private configPanelEl!: HTMLDivElement;
  private configVisible = false;
  private datasetSelectEl!: HTMLSelectElement;
  private themeSelectEl!: HTMLSelectElement;
  private cameraPresetSelectEl!: HTMLSelectElement;
  private zoomSliderEl!: HTMLInputElement;
  private zoomValueEl!: HTMLSpanElement;
  private autoSpeedSliderEl!: HTMLInputElement;
  private autoSpeedValueEl!: HTMLSpanElement;
  private repelForceSliderEl!: HTMLInputElement;
  private repelForceValueEl!: HTMLSpanElement;
  private centerForceSliderEl!: HTMLInputElement;
  private centerForceValueEl!: HTMLSpanElement;
  private linkForceSliderEl!: HTMLInputElement;
  private linkForceValueEl!: HTMLSpanElement;
  private linkDistanceSliderEl!: HTMLInputElement;
  private linkDistanceValueEl!: HTMLSpanElement;
  private nodeSizeSliderEl!: HTMLInputElement;
  private nodeSizeValueEl!: HTMLSpanElement;
  private showLinksToggleEl!: HTMLInputElement;
  private showOnlyExistingFilesToggleEl!: HTMLInputElement;
  private configToggleBtn!: HTMLButtonElement;
  private analysisToggleBtn!: HTMLButtonElement;
  private refreshBtn!: HTMLButtonElement;
  private autoRotateBtn!: HTMLButtonElement;
  private nodeInfoEl!: HTMLDivElement;
  private imageStripEl!: HTMLDivElement;
  private renderer!: HyperRenderer;
  private controls!: HyperControls;
  private animationId: number | null = null;
  private state: RenderState;
  private activeObject: HyperObject;
  private transformedVertices: Vec4[] = [];
  private graphInsights: GraphInsights | null = null;
  private analysisContainerEl: HTMLDivElement | null = null;
  private analysisSummaryEl: HTMLDivElement | null = null;
  private analysisGroupsEl: HTMLDivElement | null = null;
  private clearHighlightBtn: HTMLButtonElement | null = null;
  private activeHighlight: GraphHighlight | null = null;
  private highlightLookup: Map<string, GraphHighlight> = new Map();
  private analysisModalEl: HTMLDivElement | null = null;
  private analysisVisible = false;
  private lastGraphPayload: GraphLabelPayload | null = null;
  private selectedDataset: string;
  private selectedNodeIndex: number | null = null;
  private lastRenderedNodeSignature: string | null = null;
  private tempVec = new Vector3();
  private themeCycle = themeList();
  private focusStrength = 0;
  private pendingFocusPath: string | null = null;
  private previousVertices: Vec4[] = [];
  private animationProgress = 1;
  private animationDuration = 600;
  private cameraAnimationProgress = 1;
  private cameraAnimationDuration = 800;
  private cameraAnimationStart: { position: [number, number, number]; up: [number, number, number] } | null = null;
  private cameraAnimationTarget: { position: [number, number, number]; up: [number, number, number] } | null = null;
  private enableAnimations = true;
  private settings: GraphExplorerSettings;
  private pointerDownPos = { x: 0, y: 0 };
  private currentLookAt = new Vector3(0, 0, 0);
  private isFocusing = false;
  private uiVisible = true;
  private isFullscreen = false;
  private fullscreenBtn!: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, plugin: GraphExplorerPlugin) {
    super(leaf);
    this.plugin = plugin;
    const activeFile = this.app.workspace.getActiveFile();
    this.selectedDataset = 'vault-local';
    this.settings = this.plugin.settings;
    this.state = {
      rotation: { xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 },
      slice: { mode: 'projection', offset: 0, thickness: 0.24 },
      projection: { wCamera: 3.2, scale: 1.08 },
      camera: { zoom: 1, preset: 'axial-front' },
      autoRotate: false,
      autoSpeed: 0.42,
      themeId: 'neon',
      graph: {
        focusNode: null,
        focusStrength: 0,
        focusColor: [1, 1, 1],
        glow: 0.6,
        pointOpacity: 0.95,
        nodeScale: this.settings.nodeSizeMultiplier,
        showLinks: this.settings.showLinks,
      },
    };
    this.pendingFocusPath = activeFile?.path ?? null;
    this.activeObject = getNarrativeGraphObject();
  }

  applySettings(settings: GraphExplorerSettings): void {
    this.settings = settings;
    this.state.graph.nodeScale = settings.nodeSizeMultiplier;
    this.state.graph.showLinks = settings.showLinks;
    this.updateTheme();
  }

  private updateTheme() {
    if (!this.renderer) return;
    const themeId = this.settings.theme;
    const theme = getTheme(themeId);
    this.renderer.updateTheme(theme);
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

    this.toolbarEl.createDiv({ cls: 'hyper-toolbar-spacer' });

    this.refreshBtn = createIconButton('refresh-cw', () => {
      void this.loadSelectedDataset(true);
    }, {
      title: 'Refresh graph dataset',
      ariaLabel: 'Refresh graph dataset',
    });

    this.autoRotateBtn = createIconButton('play', () => {
      this.toggleAutoRotate();
    }, {
      title: 'Toggle auto rotation',
      ariaLabel: 'Toggle auto rotation',
    });

    const sliceBtn = createButton('Slice', () => {
      const order: Array<SliceState['mode']> = ['projection', 'hyperplane', 'shadow'];
      const nextIndex = (order.indexOf(this.state.slice.mode) + 1) % order.length;
      this.state.slice.mode = order[nextIndex];
      this.showStatus(`Slice mode: ${this.state.slice.mode}`);
    }, 'Cycle through projection / hyperplane / shadow views');

    this.analysisToggleBtn = createIconButton('git-branch', () => {
      this.toggleConfigPanel(false);
      this.toggleAnalysisModal();
    }, {
      title: 'Open graph insights',
      ariaLabel: 'Open graph insights panel',
    });

    this.configToggleBtn = createIconButton('settings', () => {
      this.toggleAnalysisModal(false);
      this.toggleConfigPanel();
    }, {
      title: 'Open graph settings',
      ariaLabel: 'Open graph settings',
    });

    this.toolbarEl.appendChild(this.refreshBtn);
    this.toolbarEl.appendChild(this.autoRotateBtn);
    this.toolbarEl.appendChild(sliceBtn);
    this.toolbarEl.appendChild(this.analysisToggleBtn);
    this.toolbarEl.appendChild(this.configToggleBtn);

    this.buildConfigPanel();
    this.buildAnalysisModal();
    this.updateAutoRotateButton();
    this.updateZoomDisplay();
    this.updateSpeedDisplay();
    this.updateRepelForceDisplay();
    this.updateCenterForceDisplay();
    this.updateLinkForceDisplay();
    this.updateLinkDistanceDisplay();
    this.updateNodeSizeDisplay();

    this.imageStripEl = this.rootEl.createDiv({ cls: 'hyper-image-strip' });
    this.nodeInfoEl = this.rootEl.createDiv({ cls: 'hyper-node-info' });
    this.nodeInfoEl.style.display = 'none';

    this.renderer = new HyperRenderer(this.canvasEl);
    this.updateTheme();
    this.applyCameraPreset(this.state.camera.preset);
    this.renderer.setGraphLabelCallback((payload: GraphLabelPayload) => this.onGraphPayload(payload));

    this.controls = new HyperControls({
      canvas: this.canvasEl,
      state: this.state,
      callbacks: {
        rotation: () => {
          this.requestRender();
          this.isFocusing = false;
        },
        slice: () => this.requestRender(),
        autorotate: () => {
          this.updateAutoRotateButton();
          this.requestRender();
          this.isFocusing = false;
        },
        zoom: () => {
          this.updateCameraZoom();
          this.isFocusing = false;
        },
        onTogglePanels: () => this.toggleUI(),
      },
    });

    this.fullscreenBtn = createIconButton('maximize', () => {
      this.toggleFullscreen();
    }, {
      title: 'Enter fullscreen',
      ariaLabel: 'Enter fullscreen',
    });
    this.toolbarEl.appendChild(this.fullscreenBtn);

    document.addEventListener('fullscreenchange', () => {
      this.updateFullscreenButton();
    });

    this.canvasEl.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
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
    this.toggleConfigPanel(false);
    this.toggleAnalysisModal(false);
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  private showStatus(message: string) {
    if (this.statusEl) {
      this.statusEl.textContent = message;
    }
  }

  private buildConfigPanel() {
    this.configPanelEl = this.rootEl.createDiv({ cls: 'hyper-config-panel', attr: { 'aria-hidden': 'true' } });

    const header = this.configPanelEl.createDiv({ cls: 'hyper-config-header' });
    header.createEl('h3', { text: 'Explorer Settings' });
    const closeBtn = createIconButton('x', () => {
      this.toggleConfigPanel(false);
    }, {
      title: 'Close settings',
      ariaLabel: 'Close settings panel',
    });
    header.appendChild(closeBtn);

    const body = this.configPanelEl.createDiv({ cls: 'hyper-config-body' });
    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const datasetRow = body.createDiv({ cls: 'hyper-config-row' });
    const datasetId = `hyper-dataset-${uniqueSuffix}`;
    datasetRow.createEl('label', { text: 'Dataset', attr: { for: datasetId } });
    this.datasetSelectEl = datasetRow.createEl('select', { attr: { id: datasetId } });
    DATASET_OPTIONS.forEach((option) => createOption(this.datasetSelectEl, option));
    this.datasetSelectEl.value = this.selectedDataset;
    this.datasetSelectEl.addEventListener('change', (event) => {
      const value = (event.target as HTMLSelectElement).value;
      this.selectedDataset = value;
      void this.loadSelectedDataset();
    });

    const themeRow = body.createDiv({ cls: 'hyper-config-row' });
    const themeId = `hyper-theme-${uniqueSuffix}`;
    themeRow.createEl('label', { text: 'Theme', attr: { for: themeId } });
    this.themeSelectEl = themeRow.createEl('select', { attr: { id: themeId } });
    this.themeCycle.forEach((theme) => createOption(this.themeSelectEl, { id: theme.id, label: theme.name }));
    this.themeSelectEl.value = this.state.themeId;
    this.themeSelectEl.addEventListener('change', () => {
      this.state.themeId = this.themeSelectEl.value;
    });

    const cameraRow = body.createDiv({ cls: 'hyper-config-row' });
    const cameraId = `hyper-camera-${uniqueSuffix}`;
    cameraRow.createEl('label', { text: 'Camera view', attr: { for: cameraId } });
    this.cameraPresetSelectEl = cameraRow.createEl('select', { attr: { id: cameraId } });
    CAMERA_PRESETS.forEach((preset) => {
      createOption(this.cameraPresetSelectEl, {
        id: preset.id,
        label: preset.label,
        title: preset.description,
      });
    });
    this.cameraPresetSelectEl.value = this.state.camera.preset;
    this.cameraPresetSelectEl.addEventListener('change', (event) => {
      const value = (event.target as HTMLSelectElement).value as CameraPresetId;
      this.state.camera.preset = value;
      this.applyCameraPreset(value, { syncSelector: false });
    });

    const zoomRow = body.createDiv({ cls: 'hyper-config-row' });
    const zoomId = `hyper-zoom-${uniqueSuffix}`;
    zoomRow.createEl('label', { text: 'Zoom level', attr: { for: zoomId } });
    const zoomControl = zoomRow.createDiv({ cls: 'hyper-config-control' });
    this.zoomSliderEl = zoomControl.createEl('input', {
      attr: {
        id: zoomId,
        type: 'range',
        min: '0.4',
        max: '8',
        step: '0.01',
        value: this.state.camera.zoom.toFixed(2),
      },
    });
    this.zoomSliderEl.addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      if (!Number.isFinite(value)) return;
      this.state.camera.zoom = value;
      this.updateCameraZoom();
      this.updateZoomDisplay();
    });
    this.zoomValueEl = zoomControl.createEl('span', { cls: 'hyper-config-value' });

    const speedRow = body.createDiv({ cls: 'hyper-config-row' });
    const speedId = `hyper-speed-${uniqueSuffix}`;
    speedRow.createEl('label', { text: 'Spin speed', attr: { for: speedId } });
    const speedControl = speedRow.createDiv({ cls: 'hyper-config-control' });
    this.autoSpeedSliderEl = speedControl.createEl('input', {
      attr: {
        id: speedId,
        type: 'range',
        min: '0',
        max: '1.5',
        step: '0.01',
        value: this.state.autoSpeed.toFixed(2),
      },
    });
    this.autoSpeedSliderEl.addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      if (!Number.isFinite(value)) return;
      this.state.autoSpeed = value;
      this.updateSpeedDisplay();
    });
    this.autoSpeedValueEl = speedControl.createEl('span', { cls: 'hyper-config-value' });

    const animationsRow = body.createDiv({ cls: 'hyper-config-row' });
    const animationsId = `hyper-animations-${uniqueSuffix}`;
    animationsRow.createEl('label', { text: 'Enable animations', attr: { for: animationsId } });
    const animationsToggle = animationsRow.createEl('input', {
      attr: {
        id: animationsId,
        type: 'checkbox',
      },
    });
    animationsToggle.checked = this.enableAnimations;
    animationsToggle.addEventListener('change', (event) => {
      this.enableAnimations = (event.target as HTMLInputElement).checked;
    });

    // Force layout settings
    body.createEl('h4', { text: 'Force Layout' });

    const repelForceRow = body.createDiv({ cls: 'hyper-config-row' });
    const repelForceId = `hyper-repel-force-${uniqueSuffix}`;
    repelForceRow.createEl('label', { text: 'Repel force', attr: { for: repelForceId } });
    const repelForceControl = repelForceRow.createDiv({ cls: 'hyper-config-control' });
    this.repelForceSliderEl = repelForceControl.createEl('input', {
      attr: {
        id: repelForceId,
        type: 'range',
        min: '0',
        max: '10',
        step: '0.1',
        value: this.settings.repelForce.toFixed(1),
      },
    });
    this.repelForceSliderEl.addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      if (!Number.isFinite(value)) return;
      this.settings.repelForce = value;
      void this.plugin.handleForceSettingChange();
      this.updateRepelForceDisplay();
    });
    this.repelForceValueEl = repelForceControl.createEl('span', { cls: 'hyper-config-value' });

    const centerForceRow = body.createDiv({ cls: 'hyper-config-row' });
    const centerForceId = `hyper-center-force-${uniqueSuffix}`;
    centerForceRow.createEl('label', { text: 'Center force', attr: { for: centerForceId } });
    const centerForceControl = centerForceRow.createDiv({ cls: 'hyper-config-control' });
    this.centerForceSliderEl = centerForceControl.createEl('input', {
      attr: {
        id: centerForceId,
        type: 'range',
        min: '0',
        max: '1.5',
        step: '0.01',
        value: this.settings.centerForce.toFixed(2),
      },
    });
    this.centerForceSliderEl.addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      if (!Number.isFinite(value)) return;
      this.settings.centerForce = value;
      void this.plugin.handleForceSettingChange();
      this.updateCenterForceDisplay();
    });
    this.centerForceValueEl = centerForceControl.createEl('span', { cls: 'hyper-config-value' });

    const linkForceRow = body.createDiv({ cls: 'hyper-config-row' });
    const linkForceId = `hyper-link-force-${uniqueSuffix}`;
    linkForceRow.createEl('label', { text: 'Link force', attr: { for: linkForceId } });
    const linkForceControl = linkForceRow.createDiv({ cls: 'hyper-config-control' });
    this.linkForceSliderEl = linkForceControl.createEl('input', {
      attr: {
        id: linkForceId,
        type: 'range',
        min: '0',
        max: '4',
        step: '0.05',
        value: this.settings.linkForce.toFixed(2),
      },
    });
    this.linkForceSliderEl.addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      if (!Number.isFinite(value)) return;
      this.settings.linkForce = value;
      void this.plugin.handleForceSettingChange();
      this.updateLinkForceDisplay();
    });
    this.linkForceValueEl = linkForceControl.createEl('span', { cls: 'hyper-config-value' });

    const linkDistanceRow = body.createDiv({ cls: 'hyper-config-row' });
    const linkDistanceId = `hyper-link-distance-${uniqueSuffix}`;
    linkDistanceRow.createEl('label', { text: 'Link distance', attr: { for: linkDistanceId } });
    const linkDistanceControl = linkDistanceRow.createDiv({ cls: 'hyper-config-control' });
    this.linkDistanceSliderEl = linkDistanceControl.createEl('input', {
      attr: {
        id: linkDistanceId,
        type: 'range',
        min: '0.2',
        max: '6',
        step: '0.05',
        value: this.settings.linkDistance.toFixed(2),
      },
    });
    this.linkDistanceSliderEl.addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      if (!Number.isFinite(value)) return;
      this.settings.linkDistance = value;
      void this.plugin.handleForceSettingChange();
      this.updateLinkDistanceDisplay();
    });
    this.linkDistanceValueEl = linkDistanceControl.createEl('span', { cls: 'hyper-config-value' });

    // Visual settings
    body.createEl('h4', { text: 'Visual' });

    const nodeSizeRow = body.createDiv({ cls: 'hyper-config-row' });
    const nodeSizeId = `hyper-node-size-${uniqueSuffix}`;
    nodeSizeRow.createEl('label', { text: 'Node size', attr: { for: nodeSizeId } });
    const nodeSizeControl = nodeSizeRow.createDiv({ cls: 'hyper-config-control' });
    this.nodeSizeSliderEl = nodeSizeControl.createEl('input', {
      attr: {
        id: nodeSizeId,
        type: 'range',
        min: '0.4',
        max: '3',
        step: '0.05',
        value: this.settings.nodeSizeMultiplier.toFixed(2),
      },
    });
    this.nodeSizeSliderEl.addEventListener('input', (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      if (!Number.isFinite(value)) return;
      this.settings.nodeSizeMultiplier = value;
      this.state.graph.nodeScale = value;
      void this.plugin.handleVisualSettingChange();
      this.updateNodeSizeDisplay();
    });
    this.nodeSizeValueEl = nodeSizeControl.createEl('span', { cls: 'hyper-config-value' });

    const showLinksRow = body.createDiv({ cls: 'hyper-config-row' });
    const showLinksId = `hyper-show-links-${uniqueSuffix}`;
    showLinksRow.createEl('label', { text: 'Show connecting lines', attr: { for: showLinksId } });
    this.showLinksToggleEl = showLinksRow.createEl('input', {
      attr: {
        id: showLinksId,
        type: 'checkbox',
      },
    });
    this.showLinksToggleEl.checked = this.settings.showLinks;
    this.showLinksToggleEl.addEventListener('change', (event) => {
      const value = (event.target as HTMLInputElement).checked;
      this.settings.showLinks = value;
      this.state.graph.showLinks = value;
      void this.plugin.handleVisualSettingChange();
    });

    const showOnlyExistingFilesRow = body.createDiv({ cls: 'hyper-config-row' });
    const showOnlyExistingFilesId = `hyper-show-only-existing-files-${uniqueSuffix}`;
    showOnlyExistingFilesRow.createEl('label', { text: 'Show only existing files', attr: { for: showOnlyExistingFilesId } });
    this.showOnlyExistingFilesToggleEl = showOnlyExistingFilesRow.createEl('input', {
      attr: {
        id: showOnlyExistingFilesId,
        type: 'checkbox',
      },
    });
    this.showOnlyExistingFilesToggleEl.checked = this.settings.showOnlyExistingFiles;
    this.showOnlyExistingFilesToggleEl.addEventListener('change', (event) => {
      const value = (event.target as HTMLInputElement).checked;
      this.settings.showOnlyExistingFiles = value;
      void this.plugin.handleVisualSettingChange();
    });

    // Color rules
    body.createEl('h4', { text: 'Custom Colors' });

    const colorRulesContainer = body.createDiv({ cls: 'hyper-color-rules-container' });

    const renderColorRules = () => {
      colorRulesContainer.empty();

      if (this.settings.colorRules.length === 0) {
        colorRulesContainer.createEl('p', {
          text: 'No custom color rules. Click "Add Rule" to create one.',
          cls: 'hyper-color-rules-empty'
        });
      }

      this.settings.colorRules.forEach((rule, index) => {
        const ruleEl = colorRulesContainer.createDiv({ cls: 'hyper-color-rule' });

        const ruleHeader = ruleEl.createDiv({ cls: 'hyper-color-rule-header' });

        const toggleBtn = createIconButton(rule.enabled ? 'eye' : 'eye-off', () => {
          rule.enabled = !rule.enabled;
          void this.plugin.handleVisualSettingChange();
          renderColorRules();
        }, {
          title: rule.enabled ? 'Disable rule' : 'Enable rule',
          ariaLabel: rule.enabled ? 'Disable rule' : 'Enable rule',
        });
        toggleBtn.classList.add('hyper-color-rule-toggle');
        if (!rule.enabled) toggleBtn.classList.add('is-disabled');
        ruleHeader.appendChild(toggleBtn);

        const deleteBtn = createIconButton('trash-2', () => {
          this.settings.colorRules.splice(index, 1);
          void this.plugin.handleVisualSettingChange();
          renderColorRules();
        }, {
          title: 'Delete rule',
          ariaLabel: 'Delete rule',
        });
        deleteBtn.classList.add('hyper-color-rule-delete');
        ruleHeader.appendChild(deleteBtn);

        const ruleBody = ruleEl.createDiv({ cls: 'hyper-color-rule-body' });

        const typeRow = ruleBody.createDiv({ cls: 'hyper-color-rule-row' });
        typeRow.createEl('label', { text: 'Type' });
        const typeSelect = typeRow.createEl('select');
        (['tag', 'path', 'filename'] as ColorRuleType[]).forEach((type) => {
          const option = document.createElement('option');
          option.value = type;
          option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
          typeSelect.appendChild(option);
        });
        typeSelect.value = rule.type;
        typeSelect.addEventListener('change', () => {
          rule.type = typeSelect.value as ColorRuleType;
          void this.plugin.handleVisualSettingChange();
        });

        const patternRow = ruleBody.createDiv({ cls: 'hyper-color-rule-row' });
        patternRow.createEl('label', { text: 'Pattern' });
        const patternInput = patternRow.createEl('input', {
          attr: {
            type: 'text',
            placeholder: rule.type === 'tag' ? 'tag1, tag2 or tag1 tag2' : '/regex/ or plain text',
          },
        });
        patternInput.value = rule.pattern;
        patternInput.addEventListener('input', () => {
          rule.pattern = patternInput.value;
          void this.plugin.handleVisualSettingChange();
        });

        const colorRow = ruleBody.createDiv({ cls: 'hyper-color-rule-row' });
        colorRow.createEl('label', { text: 'Color' });
        const colorInput = colorRow.createEl('input', {
          attr: {
            type: 'color',
          },
        });
        colorInput.value = rule.color;
        colorInput.addEventListener('input', () => {
          rule.color = colorInput.value;
          void this.plugin.handleVisualSettingChange();
        });
      });

      const addRuleBtn = colorRulesContainer.createEl('button', {
        text: 'Add Rule',
        cls: 'hyper-add-rule-btn',
      });
      addRuleBtn.addEventListener('click', () => {
        const newRule: ColorRule = {
          id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          type: 'tag',
          pattern: '',
          color: '#ff6b6b',
          enabled: true,
        };
        this.settings.colorRules.push(newRule);
        void this.plugin.handleVisualSettingChange();
        renderColorRules();
      });
    };

    renderColorRules();
  }

  private buildAnalysisModal() {
    if (this.analysisModalEl) {
      this.analysisModalEl.remove();
    }

    this.analysisModalEl = this.rootEl.createDiv({
      cls: 'hyper-analysis-modal',
      attr: { 'aria-hidden': 'true' },
    });

    const modalHeader = this.analysisModalEl.createDiv({ cls: 'hyper-analysis-modal-header' });
    modalHeader.createEl('h3', { text: 'Graph Insights' });
    const closeBtn = createIconButton('x', () => {
      this.toggleAnalysisModal(false);
    }, {
      title: 'Close insights',
      ariaLabel: 'Close insights panel',
    });
    modalHeader.appendChild(closeBtn);

    const modalBody = this.analysisModalEl.createDiv({ cls: 'hyper-analysis-modal-body' });
    this.analysisContainerEl = modalBody.createDiv({ cls: 'hyper-analysis-panel' });

    const header = this.analysisContainerEl.createDiv({ cls: 'hyper-analysis-header' });
    this.analysisSummaryEl = header.createDiv({ cls: 'hyper-analysis-summary' });
    const actions = header.createDiv({ cls: 'hyper-analysis-actions' });

    this.clearHighlightBtn = createButton('Clear highlight', () => {
      this.applyGraphHighlight(null);
    }, 'Reset analysis highlight');
    this.clearHighlightBtn.classList.add('hyper-analysis-clear');
    this.clearHighlightBtn.disabled = true;
    actions.appendChild(this.clearHighlightBtn);

    this.analysisGroupsEl = this.analysisContainerEl.createDiv({ cls: 'hyper-analysis-groups' });

    this.updateAnalysisUI();
  }

  private updateAnalysisUI(): void {
    const summaryEl = this.analysisSummaryEl;
    const groupsEl = this.analysisGroupsEl;
    if (!summaryEl || !groupsEl) {
      return;
    }

    summaryEl.empty();
    groupsEl.empty();
    this.highlightLookup.clear();

    if (!this.graphInsights) {
      summaryEl.createEl('p', {
        text: 'Insights appear once a vault graph is loaded.',
        cls: 'hyper-analysis-empty',
      });
      if (this.clearHighlightBtn) {
        this.clearHighlightBtn.disabled = true;
      }
      return;
    }

    const { overview, groups } = this.graphInsights;
    const stats = [
      { label: 'Nodes', value: overview.nodeCount.toString() },
      { label: 'Links', value: overview.edgeCount.toString() },
      { label: 'Avg degree', value: overview.averageDegree.toString() },
      { label: 'Density', value: overview.density.toString() },
    ];
    if (overview.componentCount > 1) {
      stats.push({ label: 'Components', value: overview.componentCount.toString() });
    }

    const metricsRow = summaryEl.createDiv({ cls: 'hyper-analysis-metrics' });
    stats.forEach((metric) => {
      const metricEl = metricsRow.createDiv({ cls: 'hyper-analysis-metric' });
      metricEl.createEl('span', { cls: 'hyper-analysis-metric-label', text: metric.label });
      metricEl.createEl('strong', { text: metric.value });
    });

    if (groups.length === 0) {
      groupsEl.createEl('p', {
        text: 'No standout clusters detected yet—try expanding the dataset or adding links.',
        cls: 'hyper-analysis-empty',
      });
      this.updateAnalysisSelectionState();
      return;
    }

    groups.forEach((group) => {
      if (group.items.length === 0) {
        return;
      }
      const groupEl = groupsEl.createDiv({ cls: 'hyper-analysis-group' });
      const header = groupEl.createDiv({ cls: 'hyper-analysis-group-header' });
      header.createEl('h5', { text: group.title });
      if (group.description) {
        groupEl.createEl('p', { text: group.description, cls: 'hyper-analysis-group-description' });
      }
      const list = groupEl.createDiv({ cls: 'hyper-analysis-items' });
      const maxItems = group.key === 'suggestions' ? 6 : 8;
      group.items.slice(0, maxItems).forEach((item) => {
        this.highlightLookup.set(item.id, item);
        const itemEl = list.createDiv({ cls: 'hyper-analysis-item' });
        const button = itemEl.createEl('button', { text: item.label, cls: 'hyper-analysis-pill' });
        button.type = 'button';
        button.dataset.highlightId = item.id;
        if (item.description) {
          button.title = item.description;
        }
        button.addEventListener('click', () => {
          this.handleHighlightClick(item);
        });
        if (item.description) {
          itemEl.createEl('div', { text: item.description, cls: 'hyper-analysis-item-description' });
        }
      });
    });

    this.updateAnalysisSelectionState();
  }

  private updateAnalysisSelectionState(): void {
    if (!this.analysisGroupsEl) {
      return;
    }
    const buttons = this.analysisGroupsEl.querySelectorAll<HTMLButtonElement>('button[data-highlight-id]');
    buttons.forEach((button) => {
      const isActive = this.activeHighlight?.id === button.dataset.highlightId;
      button.classList.toggle('is-active', Boolean(isActive));
    });
    if (this.clearHighlightBtn) {
      this.clearHighlightBtn.disabled = !this.activeHighlight;
    }
  }

  private handleHighlightClick(item: GraphHighlight): void {
    if (this.activeHighlight && this.activeHighlight.id === item.id) {
      this.applyGraphHighlight(null);
      return;
    }
    this.applyGraphHighlight(item);
  }

  private applyGraphHighlight(item: GraphHighlight | null): void {
    const meta = this.activeObject?.meta;
    if (!meta || meta.type !== 'graph') {
      this.activeHighlight = null;
      this.state.graph.vertexVisibility = null;
      this.state.graph.edgeVisibility = null;
      this.updateAnalysisSelectionState();
      return;
    }

    if (!item) {
      this.activeHighlight = null;
      this.state.graph.vertexVisibility = null;
      this.state.graph.edgeVisibility = null;
      this.updateAnalysisSelectionState();
      return;
    }

    const nodeCount = meta.nodes.length;
    const edgeCount = meta.links.length;
    const vertexVisibility = new Array(nodeCount).fill(0.08);
    const vertexSet = new Set<number>();
    item.nodes.forEach((index) => {
      if (Number.isInteger(index) && index >= 0 && index < nodeCount) {
        vertexVisibility[index] = 1;
        vertexSet.add(index);
      }
    });

    const focusEdges = new Set(item.edges ?? []);
    const edgeVisibility = new Array(edgeCount).fill(0.05);
    meta.links.forEach((link, index) => {
      const sourceFocus = vertexSet.has(link.sourceIndex);
      const targetFocus = vertexSet.has(link.targetIndex);
      if (focusEdges.has(index) || (sourceFocus && targetFocus)) {
        edgeVisibility[index] = 1;
      } else if (sourceFocus || targetFocus) {
        edgeVisibility[index] = 0.45;
      }
    });

    this.state.graph.vertexVisibility = vertexVisibility;
    this.state.graph.edgeVisibility = edgeVisibility;
    this.activeHighlight = item;
    this.updateAnalysisSelectionState();
    this.showStatus(item.label);
  }

  private recomputeAnalysis(): void {
    const meta = this.activeObject?.meta;
    if (!meta || meta.type !== 'graph') {
      this.graphInsights = null;
      this.activeHighlight = null;
      this.state.graph.vertexVisibility = null;
      this.state.graph.edgeVisibility = null;
      this.updateAnalysisUI();
      return;
    }

    const previousId = this.activeHighlight?.id ?? null;
    this.graphInsights = analyzeGraph(meta);
    this.updateAnalysisUI();
    if (previousId) {
      const restored = this.highlightLookup.get(previousId) ?? null;
      this.applyGraphHighlight(restored ?? null);
    } else {
      this.applyGraphHighlight(null);
    }
  }

  private toggleConfigPanel(force?: boolean) {
    if (!this.configPanelEl) return;
    if (typeof force === 'boolean') {
      this.configVisible = force;
    } else {
      this.configVisible = !this.configVisible;
    }
    this.configPanelEl.classList.toggle('is-visible', this.configVisible);
    this.configPanelEl.setAttribute('aria-hidden', this.configVisible ? 'false' : 'true');
    if (this.configToggleBtn) {
      this.configToggleBtn.classList.toggle('is-active', this.configVisible);
    }
    if (this.configVisible) {
      this.updateZoomDisplay();
      this.updateSpeedDisplay();
      this.updateRepelForceDisplay();
      this.updateCenterForceDisplay();
      this.updateLinkForceDisplay();
      this.updateLinkDistanceDisplay();
      this.updateNodeSizeDisplay();
    }
  }

  private toggleAnalysisModal(force?: boolean) {
    if (!this.analysisModalEl) return;
    if (typeof force === 'boolean') {
      this.analysisVisible = force;
    } else {
      this.analysisVisible = !this.analysisVisible;
    }
    this.analysisModalEl.classList.toggle('is-visible', this.analysisVisible);
    this.analysisModalEl.setAttribute('aria-hidden', this.analysisVisible ? 'false' : 'true');
    if (this.analysisToggleBtn) {
      this.analysisToggleBtn.classList.toggle('is-active', this.analysisVisible);
    }
    if (this.analysisVisible) {
      this.updateAnalysisUI();
    }
  }

  private toggleAutoRotate(force?: boolean) {
    if (typeof force === 'boolean') {
      this.state.autoRotate = force;
    } else {
      this.state.autoRotate = !this.state.autoRotate;
    }
    this.updateAutoRotateButton();
  }

  private updateAutoRotateButton() {
    if (!this.autoRotateBtn) return;
    const isActive = this.state.autoRotate;
    const label = isActive ? 'Pause auto rotation' : 'Resume auto rotation';
    setIcon(this.autoRotateBtn, isActive ? 'pause' : 'play');
    this.autoRotateBtn.setAttribute('aria-label', label);
    this.autoRotateBtn.title = label;
  }

  private toggleUI(force?: boolean) {
    if (typeof force === 'boolean') {
      this.uiVisible = force;
    } else {
      this.uiVisible = !this.uiVisible;
    }

    const display = this.uiVisible ? '' : 'none';
    if (this.toolbarEl) this.toolbarEl.style.display = display;
    if (this.configPanelEl) this.configPanelEl.style.display = this.uiVisible && this.configVisible ? '' : 'none';
    if (this.analysisModalEl) this.analysisModalEl.style.display = this.uiVisible && this.analysisVisible ? '' : 'none';
    if (this.nodeInfoEl) this.nodeInfoEl.style.display = this.uiVisible && this.nodeInfoEl.textContent ? '' : 'none';
    if (this.imageStripEl) this.imageStripEl.style.display = this.uiVisible && this.imageStripEl.childElementCount > 0 ? '' : 'none';
  }

  private toggleFullscreen() {
    if (!this.rootEl) return;

    if (!document.fullscreenElement) {
      this.rootEl.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  private updateFullscreenButton() {
    if (!this.fullscreenBtn) return;
    const isFullscreen = !!document.fullscreenElement;
    const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
    setIcon(this.fullscreenBtn, isFullscreen ? 'minimize' : 'maximize');
    this.fullscreenBtn.setAttribute('aria-label', label);
    this.fullscreenBtn.title = label;
  }

  private updateZoomDisplay() {
    if (!this.zoomSliderEl || !this.zoomValueEl) return;
    const zoom = this.state.camera.zoom;
    this.zoomSliderEl.value = zoom.toFixed(2);
    this.zoomValueEl.textContent = `${zoom.toFixed(2)}x`;
  }

  private updateSpeedDisplay() {
    if (!this.autoSpeedSliderEl || !this.autoSpeedValueEl) return;
    const speed = this.state.autoSpeed;
    this.autoSpeedSliderEl.value = speed.toFixed(2);
    this.autoSpeedValueEl.textContent = `${speed.toFixed(2)}x`;
  }

  private updateRepelForceDisplay() {
    if (!this.repelForceSliderEl || !this.repelForceValueEl) return;
    const value = this.settings.repelForce;
    this.repelForceSliderEl.value = value.toFixed(1);
    this.repelForceValueEl.textContent = value.toFixed(1);
  }

  private updateCenterForceDisplay() {
    if (!this.centerForceSliderEl || !this.centerForceValueEl) return;
    const value = this.settings.centerForce;
    this.centerForceSliderEl.value = value.toFixed(2);
    this.centerForceValueEl.textContent = value.toFixed(2);
  }

  private updateLinkForceDisplay() {
    if (!this.linkForceSliderEl || !this.linkForceValueEl) return;
    const value = this.settings.linkForce;
    this.linkForceSliderEl.value = value.toFixed(2);
    this.linkForceValueEl.textContent = value.toFixed(2);
  }

  private updateLinkDistanceDisplay() {
    if (!this.linkDistanceSliderEl || !this.linkDistanceValueEl) return;
    const value = this.settings.linkDistance;
    this.linkDistanceSliderEl.value = value.toFixed(2);
    this.linkDistanceValueEl.textContent = value.toFixed(2);
  }

  private updateNodeSizeDisplay() {
    if (!this.nodeSizeSliderEl || !this.nodeSizeValueEl) return;
    const value = this.settings.nodeSizeMultiplier;
    this.nodeSizeSliderEl.value = value.toFixed(2);
    this.nodeSizeValueEl.textContent = value.toFixed(2);
  }

  private updateCameraZoom() {
    const camera = (this.renderer as any).camera;
    if (!camera) return;
    camera.zoom = this.state.camera.zoom;
    camera.updateProjectionMatrix();
    this.updateZoomDisplay();
  }

  private updateNodeInfoVisibility() {
    if (!this.nodeInfoEl) return;
    const text = this.nodeInfoEl.textContent?.trim() ?? '';
    const hasContent = this.nodeInfoEl.childElementCount > 0 && text.length > 0;
    this.nodeInfoEl.style.display = hasContent ? '' : 'none';
  }

  private applyCameraPreset(presetId: CameraPresetId, options: { syncSelector?: boolean; animate?: boolean } = {}) {
    const camera = (this.renderer as any)?.camera;
    if (!camera) return;
    const preset = CAMERA_PRESETS.find((item) => item.id === presetId) ?? CAMERA_PRESETS[0];
    if (!preset) return;

    const up = preset.up ?? [0, 1, 0];
    const targetPosition: [number, number, number] = preset.position;
    const targetUp: [number, number, number] = up;

    // Animate camera transition if enabled
    if (this.enableAnimations && options.animate !== false) {
      this.cameraAnimationStart = {
        position: [camera.position.x, camera.position.y, camera.position.z],
        up: [camera.up.x, camera.up.y, camera.up.z],
      };
      this.cameraAnimationTarget = {
        position: targetPosition,
        up: targetUp,
      };
      this.cameraAnimationProgress = 0;
    } else {
      camera.position.set(targetPosition[0], targetPosition[1], targetPosition[2]);
      camera.up.set(targetUp[0], targetUp[1], targetUp[2]);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }

    this.state.camera.preset = preset.id;
    if (options.syncSelector !== false && this.cameraPresetSelectEl) {
      this.cameraPresetSelectEl.value = preset.id;
    }
  }

  private requestRender() {
    // No-op placeholder: continuous loop handles rendering
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  async loadSelectedDataset(force = false) {
    const option = DATASET_OPTIONS.find((item) => item.id === this.selectedDataset) ?? DATASET_OPTIONS[0];
    try {
      this.showStatus(`Loading ${option.label}…`);
      this.lastGraphPayload = null;
      this.selectNode(null, { updateDetails: true, resetFocus: true });

      // Cache previous vertices for animation
      const shouldAnimate = this.enableAnimations && this.activeObject && this.activeObject.vertices.length > 0;
      if (shouldAnimate) {
        this.previousVertices = this.transformedVertices.map(v => v ? [...v] as Vec4 : [0, 0, 0, 0]);
        this.animationProgress = 0;
      } else {
        this.animationProgress = 1;
      }

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
            showOnlyExistingFiles: this.settings.showOnlyExistingFiles,
            colorRules: this.settings.colorRules,
          };
          if (opts.scope === 'local' && !opts.rootFile) {
            new Notice('Open a note to seed the local vault graph.');
          }
          graphData = await buildVaultGraph(this.app, opts);
        } else {
          graphData = { nodes: [], links: [], summary: '', query: '' };
        }
        this.activeObject = replaceNarrativeGraph(graphData, { graphName: option.label });
      }
      this.activeHighlight = null;
      this.renderer.setObject(this.activeObject);
      this.transformedVertices = new Array(this.activeObject.vertices.length).fill(null) as Vec4[];
      this.recomputeAnalysis();
      this.labelElements.forEach((el) => { el.style.display = 'none'; });
      this.showStatus(`${option.label}`);
      this.applyPendingFocus(true);
    } catch (error) {
      console.error('[4d-graph] Failed to load dataset', error);
      new Notice('Failed to load graph dataset. Check console for details.');
      this.showStatus('Load failed');
    }
  }

  async handleActiveFileChange(file: TFile | null): Promise<void> {
    this.pendingFocusPath = file?.path ?? null;
    if (this.selectedDataset === 'vault-local') {
      await this.loadSelectedDataset(true);
      return;
    }
    this.applyPendingFocus(true);
  }

  private applyPendingFocus(force = false) {
    if (!this.activeObject?.meta || this.activeObject.meta.type !== 'graph') {
      if (force) {
        this.selectNode(null, { resetFocus: true });
      }
      return;
    }
    const focusPath = this.pendingFocusPath;
    if (!focusPath) {
      if (force) {
        this.selectNode(null, { resetFocus: true });
      }
      return;
    }
    const index = this.activeObject.meta.nodes.findIndex((node) => node.id === focusPath);
    if (index !== -1) {
      this.selectNode(index, { resetFocus: true });
    } else if (force) {
      this.selectNode(null, { resetFocus: true });
    }
  }

  private selectNode(index: number | null, options: { resetFocus?: boolean; updateDetails?: boolean } = {}) {
    const { resetFocus = true, updateDetails = true } = options;
    this.selectedNodeIndex = index;
    if (resetFocus) {
      this.focusStrength = 0;
    }
    this.lastRenderedNodeSignature = null;

    if (updateDetails) {
      if (index === null) {
        this.nodeInfoEl.empty();
        this.imageStripEl.empty();
        this.imageStripEl.style.display = 'none';
      } else {
        this.updateNodeDetails(index);
      }
      this.updateNodeInfoVisibility();
    }

    if (this.lastGraphPayload) {
      this.renderLabels(this.lastGraphPayload);
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

    // Animate camera transitions
    // Animate camera transitions
    if (this.cameraAnimationProgress < 1) {
      this.cameraAnimationProgress = Math.min(1, this.cameraAnimationProgress + (16 / this.cameraAnimationDuration));
      const easeProgress = this.easeOutCubic(this.cameraAnimationProgress);

      if (this.cameraAnimationStart && this.cameraAnimationTarget) {
        const camera = (this.renderer as any)?.camera;
        if (camera) {
          const start = this.cameraAnimationStart;
          const target = this.cameraAnimationTarget;

          camera.position.set(
            start.position[0] + (target.position[0] - start.position[0]) * easeProgress,
            start.position[1] + (target.position[1] - start.position[1]) * easeProgress,
            start.position[2] + (target.position[2] - start.position[2]) * easeProgress
          );

          camera.up.set(
            start.up[0] + (target.up[0] - start.up[0]) * easeProgress,
            start.up[1] + (target.up[1] - start.up[1]) * easeProgress,
            start.up[2] + (target.up[2] - start.up[2]) * easeProgress
          );

          camera.lookAt(0, 0, 0);
          camera.updateProjectionMatrix();

          if (this.cameraAnimationProgress >= 1) {
            this.cameraAnimationStart = null;
            this.cameraAnimationTarget = null;
          }
        }
      }
    } else {
      // Handle persistent focus or default lookAt
      const camera = (this.renderer as any)?.camera;
      if (camera) {
        const target = new Vector3(0, 0, 0);
        if (this.isFocusing && this.selectedNodeIndex !== null && this.transformedVertices[this.selectedNodeIndex]) {
          const v = this.transformedVertices[this.selectedNodeIndex];
          target.set(v[0], v[1], v[2]);
        }
        this.currentLookAt.lerp(target, 0.1);
        camera.lookAt(this.currentLookAt);
      }
    }

    if (this.state.autoRotate) {
      const speed = this.state.autoSpeed;
      const delta = 0.016;
      this.state.rotation.xy += 0.12 * speed * delta;
      this.state.rotation.xw += 0.1 * speed * delta;
      this.state.rotation.yz += 0.08 * speed * delta;
    }

    // Advance node animation progress
    if (this.animationProgress < 1) {
      this.animationProgress = Math.min(1, this.animationProgress + (16 / this.animationDuration));
    }

    const rotationMatrix = composeRotation(this.state.rotation);
    const easeProgress = this.easeOutCubic(this.animationProgress);

    for (let i = 0; i < this.activeObject.vertices.length; i += 1) {
      const targetVertex = applyMatrix(this.activeObject.vertices[i], rotationMatrix);

      // Interpolate between previous and current positions during animation
      if (this.animationProgress < 1 && i < this.previousVertices.length) {
        const prev = this.previousVertices[i];
        this.transformedVertices[i] = [
          prev[0] + (targetVertex[0] - prev[0]) * easeProgress,
          prev[1] + (targetVertex[1] - prev[1]) * easeProgress,
          prev[2] + (targetVertex[2] - prev[2]) * easeProgress,
          prev[3] + (targetVertex[3] - prev[3]) * easeProgress,
        ];
      } else {
        this.transformedVertices[i] = targetVertex;
      }
    }

    if (this.state.projection.scaleTarget !== undefined) {
      this.state.projection.scale += (this.state.projection.scaleTarget - this.state.projection.scale) * 0.08;
      if (Math.abs(this.state.projection.scaleTarget - this.state.projection.scale) < 0.0001) {
        this.state.projection.scaleTarget = undefined;
      }
    }

    const theme = getTheme(this.state.themeId);
    const baseFocusColor = theme.pointColor({ normW: 0.2, depth: 0 });
    const focusColor: [number, number, number] = [
      Math.min(1, baseFocusColor[0] * 0.35 + 0.65),
      Math.min(1, baseFocusColor[1] * 0.35 + 0.65),
      Math.min(1, baseFocusColor[2] * 0.35 + 0.65),
    ];
    this.state.graph.focusColor = focusColor;

    if (this.state.graph.focusNode !== this.selectedNodeIndex) {
      this.state.graph.focusNode = this.selectedNodeIndex;
      this.focusStrength = 0;
    }

    const targetStrength = this.selectedNodeIndex !== null ? 1 : 0;
    const approach = this.selectedNodeIndex !== null ? 0.12 : 0.08;
    this.focusStrength += (targetStrength - this.focusStrength) * approach;
    if (Math.abs(targetStrength - this.focusStrength) < 0.001) {
      this.focusStrength = targetStrength;
    }
    this.state.graph.focusStrength = this.focusStrength;

    this.renderer.renderFrame({
      vertices4d: this.transformedVertices,
      projection: this.state.projection,
      sliceMode: this.state.slice.mode,
      sliceOffset: this.state.slice.offset,
      sliceThickness: this.state.slice.thickness,
      theme,
      graphState: this.activeObject.meta?.type === 'graph' ? this.state.graph : null,
    });

    if (this.activeObject.meta?.type !== 'graph') {
      this.nodeInfoEl.empty();
      this.imageStripEl.empty();
      this.imageStripEl.style.display = 'none';
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
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      return;
    }

    const index = this.pickNodeFromEvent(event);
    if (index === null) {
      this.selectNode(null);
      return;
    }
    this.selectNode(index);
  }

  private handleCanvasDoubleClick(event: MouseEvent) {
    const index = this.pickNodeFromEvent(event);
    if (index === null) return;
    this.selectNode(index);
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

    const returnBtn = this.nodeInfoEl.createEl('button', { text: 'Return to Node', cls: 'hyper-node-return-btn' });
    returnBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isFocusing = true;
    });

    this.imageStripEl.empty();
    const images = hero ? [hero, ...gallery.filter((url) => url !== hero)] : gallery;

    if (images.length === 0) {
      this.imageStripEl.style.display = 'none';
    } else {
      this.imageStripEl.style.display = '';
      images.forEach((url) => {
        const img = this.imageStripEl.createEl('img');
        img.src = url;
        img.alt = node.label;
        img.addEventListener('error', () => img.remove());
      });
    }

    this.updateNodeInfoVisibility();
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
    const MAX_VISIBLE_LABELS = 48;
    const MIN_VISIBILITY = 0.04;
    const MIN_OPACITY = 0.12;

    type LabelCandidate = {
      index: number;
      text: string;
      x: number;
      y: number;
      opacity: number;
      weight: number;
      fontSize: number;
      focus: boolean;
    };

    while (this.labelElements.length < labels.length) {
      const el = document.createElement('div');
      el.className = 'hyper-label';
      this.labelLayer.appendChild(el);
      this.labelElements.push(el);
    }

    for (let i = 0; i < this.labelElements.length; i += 1) {
      this.labelElements[i].style.display = 'none';
    }

    const candidates: LabelCandidate[] = [];

    for (let i = 0; i < labels.length; i += 1) {
      const node = labels[i];
      const pos = positions[i];
      if (!node || !pos) continue;
      const visibility = vertexVisibility ? vertexVisibility[i] ?? 0 : 1;
      if (visibility <= MIN_VISIBILITY) {
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

      const depthNorm = Math.min(1, Math.max(0, (this.tempVec.z + 1) * 0.5));
      const depthFactor = 1 - Math.pow(depthNorm, 1.22);
      const radialFalloff = 1 - Math.min(1, Math.hypot(ndcX, ndcY) / 1.35);
      const focusBoost = focusIndex === i ? 1.6 : 1;
      const weight = visibility * (0.45 + depthFactor * 0.55) * (0.55 + radialFalloff * 0.45) * focusBoost;
      const opacity = focusIndex === i ? 1 : Math.min(1, Math.max(MIN_OPACITY, weight));
      const baseSize = focusIndex === i ? 21 : 14;
      const fontSize = baseSize + depthFactor * 8 + visibility * 4;
      const x = (ndcX + 1) * 0.5 * width;
      const y = (1 - ndcY) * 0.5 * height;
      const text = node.emoji ? `${node.emoji} ${node.label}` : node.label;

      candidates.push({
        index: i,
        text,
        x,
        y,
        opacity,
        weight,
        fontSize,
        focus: focusIndex === i,
      });
    }

    if (candidates.length === 0) {
      return;
    }

    const focusCandidate = candidates.find((candidate) => candidate.focus) ?? null;
    const sorted = [...candidates].sort((a, b) => b.weight - a.weight);
    const visible: LabelCandidate[] = [];

    if (focusCandidate) {
      visible.push({ ...focusCandidate, weight: Math.max(focusCandidate.weight, 1.2) });
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
      if (visible.length >= MAX_VISIBLE_LABELS) {
        break;
      }
    }

    for (const candidate of visible) {
      const el = this.labelElements[candidate.index];
      if (!el) continue;
      el.textContent = candidate.text;
      el.style.left = `${candidate.x}px`;
      el.style.top = `${candidate.y}px`;
      el.style.fontSize = `${candidate.fontSize.toFixed(1)}px`;
      el.style.opacity = candidate.opacity.toFixed(2);
      el.style.zIndex = String(400 + Math.round(candidate.weight * 220));
      el.style.display = 'block';
      el.classList.toggle('hyper-label-focus', candidate.focus);
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
