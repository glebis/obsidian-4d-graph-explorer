import { App, Plugin, WorkspaceLeaf, TFile, PluginSettingTab, Setting } from 'obsidian';
import { GraphExplorerView, HYPER_VIEW_TYPE } from './view/graphExplorerView';
import { updateForceLayoutConfig } from './hyper/core/graph';

export interface GraphExplorerSettings {
  repelForce: number;
  centerForce: number;
  linkForce: number;
  linkDistance: number;
  nodeSizeMultiplier: number;
  showLinks: boolean;
  showOnlyExistingFiles: boolean;
}

const DEFAULT_SETTINGS: GraphExplorerSettings = {
  repelForce: 0,
  centerForce: 0,
  linkForce: 0,
  linkDistance: 1.6,
  nodeSizeMultiplier: 1,
  showLinks: true,
  showOnlyExistingFiles: true,
};

export default class GraphExplorerPlugin extends Plugin {
  settings: GraphExplorerSettings = { ...DEFAULT_SETTINGS };
  private refreshDebounce: number | null = null;

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

    this.addSettingTab(new GraphExplorerSettingTab(this.app, this));
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

  async handleVisualSettingChange(): Promise<void> {
    await this.saveSettings();
    this.scheduleGraphRefresh(false);
  }

  private scheduleGraphRefresh(reloadGraph: boolean): void {
    const trigger = () => {
      this.refreshDebounce = null;
      void this.refreshGraphViews(reloadGraph);
    };

    if (this.refreshDebounce !== null) {
      window.clearTimeout(this.refreshDebounce);
    }
    this.refreshDebounce = window.setTimeout(trigger, reloadGraph ? 600 : 200);
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

class GraphExplorerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: GraphExplorerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '4D Graph Explorer Settings' });

    new Setting(containerEl)
      .setName('Repel force')
      .setDesc('Pushes nodes away from each other. Increase to reduce clustering.')
      .addSlider((slider) => {
        slider.setLimits(0, 10, 0.1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.repelForce);
        slider.onChange(async (value) => {
          this.plugin.settings.repelForce = Math.round(value * 100) / 100;
          await this.plugin.handleForceSettingChange();
        });
      });

    new Setting(containerEl)
      .setName('Center force')
      .setDesc('Pulls the layout toward the origin to keep clusters in frame.')
      .addSlider((slider) => {
        slider.setLimits(0, 1.5, 0.01)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.centerForce);
        slider.onChange(async (value) => {
          this.plugin.settings.centerForce = Math.round(value * 100) / 100;
          await this.plugin.handleForceSettingChange();
        });
      });

    new Setting(containerEl)
      .setName('Link force')
      .setDesc('Strengthens the attraction between linked nodes.')
      .addSlider((slider) => {
        slider.setLimits(0, 4, 0.05)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.linkForce);
        slider.onChange(async (value) => {
          this.plugin.settings.linkForce = Math.round(value * 100) / 100;
          await this.plugin.handleForceSettingChange();
        });
      });

    new Setting(containerEl)
      .setName('Link distance')
      .setDesc('Target spacing between linked nodes in the force layout.')
      .addSlider((slider) => {
        slider.setLimits(0.2, 6, 0.05)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.linkDistance);
        slider.onChange(async (value) => {
          this.plugin.settings.linkDistance = Math.round(value * 100) / 100;
          await this.plugin.handleForceSettingChange();
        });
      });

    new Setting(containerEl)
      .setName('Node size')
      .setDesc('Multiplies the visual point size of graph nodes.')
      .addSlider((slider) => {
        slider.setLimits(0.4, 3, 0.05)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.nodeSizeMultiplier);
        slider.onChange(async (value) => {
          this.plugin.settings.nodeSizeMultiplier = Math.round(value * 100) / 100;
          await this.plugin.handleVisualSettingChange();
        });
      });

    new Setting(containerEl)
      .setName('Show connecting lines')
      .setDesc('Toggle visibility of link segments between nodes.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showLinks);
        toggle.onChange(async (value) => {
          this.plugin.settings.showLinks = value;
          await this.plugin.handleVisualSettingChange();
        });
      });

    new Setting(containerEl)
      .setName('Show only existing files')
      .setDesc('Hide nodes for non-existent files (unresolved links).')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showOnlyExistingFiles);
        toggle.onChange(async (value) => {
          this.plugin.settings.showOnlyExistingFiles = value;
          await this.plugin.handleVisualSettingChange();
        });
      });
  }
}
