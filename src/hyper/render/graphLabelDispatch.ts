export function getGraphLabelDispatchIntervalMs(nodeCount: number): number {
  if (nodeCount > 4500) return 180;
  if (nodeCount > 2500) return 130;
  return 60;
}
