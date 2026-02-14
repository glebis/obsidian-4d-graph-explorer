import { App, Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { GraphExplorerView, HYPER_VIEW_TYPE } from './view/graphExplorerView';
import { updateForceLayoutConfig } from './hyper/core/graph';
import { GraphRefreshScheduler } from './settings/graphRefreshScheduler';

export type ColorRuleType = 'tag' | 'path' | 'filename';

export interface ColorRule {
  id: string;
  type: ColorRuleType;
  pattern: string;
  color: string;
  enabled: boolean;
}

export interface GraphExplorerPresetSettings {
  repelForce: number;
  centerForce: number;
  linkForce: number;
  linkDistance: number;
  nodeSizeMultiplier: number;
  nodeSizeMode: 'fixed' | 'connections';
  nodeSizeMinScale: number;
  nodeSizeMaxScale: number;
  nodeSizeIncomingWeight: number;
  nodeSizeOutgoingWeight: number;
  nodeSizeCurve: 'linear' | 'sqrt' | 'log';
  showLinks: boolean;
  autoPerformanceMode: boolean;
  labelRankingMode: 'depth' | 'importance' | 'hybrid';
  labelFontScaling: 'fixed' | 'proportional';
  labelScaleSource: 'depth' | 'importance' | 'hybrid';
  labelMinFontSize: number;
  labelMaxFontSize: number;
  labelDensity: number;
  labelPinnedContext: boolean;
  labelPinnedImportantCount: number;
  labelShowChrome: boolean;
  labelShowEmoji: boolean;
  showOnlyExistingFiles: boolean;
  colorRules: ColorRule[];
  theme: string;
  labelFont: string;
}

export interface GraphExplorerPreset {
  name: string;
  settings: GraphExplorerPresetSettings;
}

export interface GraphExplorerSettings extends GraphExplorerPresetSettings {
  customPresets: GraphExplorerPreset[];
  activePresetName: string;
}

const DEFAULT_PRESET_SETTINGS: GraphExplorerPresetSettings = {
  repelForce: 0,
  centerForce: 0,
  linkForce: 0,
  linkDistance: 1.6,
  nodeSizeMultiplier: 1,
  nodeSizeMode: 'fixed',
  nodeSizeMinScale: 0.75,
  nodeSizeMaxScale: 2.25,
  nodeSizeIncomingWeight: 1,
  nodeSizeOutgoingWeight: 1,
  nodeSizeCurve: 'sqrt',
  showLinks: true,
  autoPerformanceMode: true,
  labelRankingMode: 'hybrid',
  labelFontScaling: 'proportional',
  labelScaleSource: 'hybrid',
  labelMinFontSize: 11,
  labelMaxFontSize: 22,
  labelDensity: 1,
  labelPinnedContext: true,
  labelPinnedImportantCount: 6,
  labelShowChrome: false,
  labelShowEmoji: false,
  showOnlyExistingFiles: true,
  colorRules: [],
  theme: 'neon',
  labelFont: 'default',
};

const DEFAULT_SETTINGS: GraphExplorerSettings = {
  ...DEFAULT_PRESET_SETTINGS,
  customPresets: [],
  activePresetName: '',
};

const REOPEN_VIEW_SESSION_KEY = 'obsidian-4d-graph-explorer:reopen-view';

export default class GraphExplorerPlugin extends Plugin {
  settings: GraphExplorerSettings = { ...DEFAULT_SETTINGS };
  private refreshScheduler: GraphRefreshScheduler | null = null;
  private isWindowClosing = false;

  async onload(): Promise<void> {
    this.isWindowClosing = false;
    await this.loadSettings();
    this.applyForceLayoutSettings();
    this.refreshScheduler = new GraphRefreshScheduler({
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (timerId) => window.clearTimeout(timerId),
      onRefresh: (reloadGraph) => {
        void this.refreshGraphViews(reloadGraph);
      },
    });

    this.registerView(HYPER_VIEW_TYPE, (leaf) => new GraphExplorerView(leaf, this));

    this.addRibbonIcon('network', 'Open 4D Graph Explorer', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-4d-graph-explorer',
      name: 'Open 4D Graph Explorer',
      callback: () => this.activateView(),
    });

    this.registerEvent(this.app.workspace.on('file-open', (file: TFile | null) => {
      const leaves = this.app.workspace.getLeavesOfType(HYPER_VIEW_TYPE);
      leaves.forEach((leaf) => {
        const view = leaf.view;
        if (view instanceof GraphExplorerView) {
          void view.handleActiveFileChange(file);
        }
      });
    }));

    this.registerDomEvent(window, 'beforeunload', () => {
      this.isWindowClosing = true;
    });

    this.app.workspace.onLayoutReady(() => {
      void this.restoreViewAfterReloadIfNeeded();
    });
  }

  onunload(): void {
    this.refreshScheduler?.dispose();
    this.refreshScheduler = null;
    const openLeafCount = this.app.workspace.getLeavesOfType(HYPER_VIEW_TYPE).length;
    if (openLeafCount > 0) {
      try {
        window.sessionStorage.setItem(REOPEN_VIEW_SESSION_KEY, '1');
      } catch (error) {
        console.debug('[4d-graph] Failed to persist reopen marker', error);
      }
    }

    // Keep leaves intact when the app window is reloading/closing so Obsidian can restore them.
    // For plugin disable/reload in-session, close custom leaves and restore them on next load.
    if (!this.isWindowClosing) {
      this.app.workspace.detachLeavesOfType(HYPER_VIEW_TYPE);
    }
  }

  private applyForceLayoutSettings(): void {
    updateForceLayoutConfig({
      repelForce: this.settings.repelForce,
      centerForce: this.settings.centerForce,
      linkForce: this.settings.linkForce,
      linkDistance: this.settings.linkDistance,
    });
  }

  async loadSettings(): Promise<void> {
    const stored = await this.loadData() as Partial<GraphExplorerSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(stored ?? {}),
      customPresets: Array.isArray(stored?.customPresets) ? stored.customPresets : [],
      activePresetName: typeof stored?.activePresetName === 'string' ? stored.activePresetName : '',
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async handleForceSettingChange(): Promise<void> {
    this.applyForceLayoutSettings();
    await this.saveSettings();
    this.scheduleGraphRefresh(true);
  }

  async handleVisualSettingChange(options: { reloadGraph?: boolean } = {}): Promise<void> {
    const { reloadGraph = false } = options;
    await this.saveSettings();
    this.scheduleGraphRefresh(reloadGraph);
  }

  async handleBulkSettingChange(options: { reloadGraph?: boolean } = {}): Promise<void> {
    const { reloadGraph = false } = options;
    this.applyForceLayoutSettings();
    await this.saveSettings();
    this.scheduleGraphRefresh(reloadGraph);
  }

  private scheduleGraphRefresh(reloadGraph: boolean): void {
    if (!this.refreshScheduler) {
      void this.refreshGraphViews(reloadGraph);
      return;
    }
    this.refreshScheduler.schedule(reloadGraph);
  }

  async refreshGraphViews(reloadGraph: boolean): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(HYPER_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof GraphExplorerView) {
        view.applySettings(this.settings);
        if (reloadGraph) {
          await view.loadSelectedDataset(true);
        }
      }
    }
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(HYPER_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
    if (!leaf) return;
    await leaf.setViewState({ type: HYPER_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async restoreViewAfterReloadIfNeeded(): Promise<void> {
    let shouldReopen = false;
    try {
      shouldReopen = window.sessionStorage.getItem(REOPEN_VIEW_SESSION_KEY) === '1';
      if (shouldReopen) {
        window.sessionStorage.removeItem(REOPEN_VIEW_SESSION_KEY);
      }
    } catch (error) {
      console.debug('[4d-graph] Failed to read reopen marker', error);
      return;
    }
    if (!shouldReopen) {
      return;
    }
    const existingLeaves = this.app.workspace.getLeavesOfType(HYPER_VIEW_TYPE);
    if (existingLeaves.length > 0) {
      return;
    }
    await this.activateView();
  }
}
