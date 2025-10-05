import { Plugin, WorkspaceLeaf } from 'obsidian';
import { GraphExplorerView, HYPER_VIEW_TYPE } from './view/graphExplorerView';

export default class GraphExplorerPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(HYPER_VIEW_TYPE, (leaf) => new GraphExplorerView(leaf));

    this.addRibbonIcon('network', 'Open 4D Graph Explorer', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-4d-graph-explorer',
      name: 'Open 4D Graph Explorer',
      callback: () => this.activateView(),
    });

    this.registerEvent(this.app.workspace.on('file-open', () => {
      const leaves = this.app.workspace.getLeavesOfType(HYPER_VIEW_TYPE);
      leaves.forEach((leaf) => {
        const view = leaf.view;
        if (view instanceof GraphExplorerView) {
          void view.loadSelectedDataset(true);
        }
      });
    }));
  }

  onunload(): void {
    this.app.workspace.getLeavesOfType(HYPER_VIEW_TYPE).forEach((leaf) => leaf.detach());
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
