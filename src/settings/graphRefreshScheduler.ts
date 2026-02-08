export interface GraphRefreshSchedulerBindings {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
  onRefresh(reloadGraph: boolean): void;
}

export interface GraphRefreshSchedulerConfig {
  visualRefreshDelayMs: number;
  reloadRefreshDelayMs: number;
}

const DEFAULT_CONFIG: GraphRefreshSchedulerConfig = {
  visualRefreshDelayMs: 200,
  reloadRefreshDelayMs: 600,
};

export class GraphRefreshScheduler {
  private pendingReloadGraph = false;
  private refreshDebounce: number | null = null;
  private config: GraphRefreshSchedulerConfig;

  constructor(
    private readonly bindings: GraphRefreshSchedulerBindings,
    config: Partial<GraphRefreshSchedulerConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  schedule(reloadGraph: boolean): void {
    if (reloadGraph) {
      this.pendingReloadGraph = true;
    }

    if (this.refreshDebounce !== null) {
      this.bindings.clearTimeout(this.refreshDebounce);
    }

    const delay = this.pendingReloadGraph
      ? this.config.reloadRefreshDelayMs
      : this.config.visualRefreshDelayMs;

    this.refreshDebounce = this.bindings.setTimeout(() => {
      const shouldReload = this.pendingReloadGraph;
      this.pendingReloadGraph = false;
      this.refreshDebounce = null;
      this.bindings.onRefresh(shouldReload);
    }, delay);
  }

  dispose(): void {
    if (this.refreshDebounce !== null) {
      this.bindings.clearTimeout(this.refreshDebounce);
      this.refreshDebounce = null;
    }
    this.pendingReloadGraph = false;
  }
}
