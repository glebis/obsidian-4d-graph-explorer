import { App, Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { GraphExplorerView, HYPER_VIEW_TYPE } from './view/graphExplorerView';
import { updateForceLayoutConfig } from './hyper/core/graph';

export type ColorRuleType = 'tag' | 'path' | 'filename';

export interface ColorRule {
  id: string;
  type: ColorRuleType;
  pattern: string;
  color: string;
  enabled: boolean;
}

export interface GraphExplorerSettings {
  repelForce: number;
  centerForce: number;
  linkForce: number;
  linkDistance: number;
  nodeSizeMultiplier: number;
  showLinks: boolean;
  showOnlyExistingFiles: boolean;
  colorRules: ColorRule[];
  theme: string;
}

const DEFAULT_SETTINGS: GraphExplorerSettings = {
  repelForce: 0,
  centerForce: 0,
  linkForce: 0,
  linkDistance: 1.6,
  nodeSizeMultiplier: 1,
  showLinks: true,
  showOnlyExistingFiles: true,
  colorRules: [],
  theme: 'neon',
};

export default class GraphExplorerPlugin extends Plugin {
  settings: GraphExplorerSettings = { ...DEFAULT_SETTINGS };
  private refreshDebounce: number | null = null;
  private pendingReloadGraph = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.applyForceLayoutSettings();

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
  }

  onunload(): void {
    this.app.workspace.getLeavesOfType(HYPER_VIEW_TYPE).forEach((leaf) => leaf.detach());
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
    const stored = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(stored ?? {}),
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

  private scheduleGraphRefresh(reloadGraph: boolean): void {
    if (reloadGraph) {
      this.pendingReloadGraph = true;
    }
    const trigger = () => {
      const shouldReload = this.pendingReloadGraph;
      this.pendingReloadGraph = false;
      this.refreshDebounce = null;
      void this.refreshGraphViews(shouldReload);
    };

    if (this.refreshDebounce !== null) {
      window.clearTimeout(this.refreshDebounce);
    }
    const delay = this.pendingReloadGraph ? 600 : 200;
    this.refreshDebounce = window.setTimeout(trigger, delay);
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
}
