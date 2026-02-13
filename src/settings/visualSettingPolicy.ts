export type VisualSettingAction =
  | 'theme'
  | 'node-size'
  | 'show-links'
  | 'auto-performance-mode'
  | 'label-display'
  | 'show-only-existing-files'
  | 'color-rules'
  | 'label-font';

const RELOAD_REQUIRED_ACTIONS = new Set<VisualSettingAction>([
  'show-only-existing-files',
  'color-rules',
]);

export function visualSettingRequiresGraphReload(action: VisualSettingAction): boolean {
  return RELOAD_REQUIRED_ACTIONS.has(action);
}

export function visualSettingRefreshOptions(action: VisualSettingAction): { reloadGraph: boolean } {
  return {
    reloadGraph: visualSettingRequiresGraphReload(action),
  };
}
