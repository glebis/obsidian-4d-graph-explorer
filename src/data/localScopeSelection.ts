export type ResolvedLinks = Record<string, Record<string, number>>;

export interface LocalScopeSelectionOptions {
  rootPath: string | null;
  depth: number;
  minNodes: number;
  maxDepth: number;
  includeCanvas: boolean;
  fallbackPaths: string[];
  resolvedLinks: ResolvedLinks;
  reverseLinks: Map<string, Set<string>>;
}

function isCanvasPath(path: string): boolean {
  return path.toLowerCase().endsWith('.canvas');
}

function isPathAllowed(path: string, includeCanvas: boolean): boolean {
  if (!path) return false;
  if (!includeCanvas && isCanvasPath(path)) return false;
  return true;
}

function runBreadthFirstSelection(
  seedPaths: string[],
  depthLimit: number,
  includeCanvas: boolean,
  resolvedLinks: ResolvedLinks,
  reverseLinks: Map<string, Set<string>>
): Set<string> {
  const result = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [];

  seedPaths.forEach((seed) => {
    if (!isPathAllowed(seed, includeCanvas)) return;
    if (result.has(seed)) return;
    result.add(seed);
    queue.push({ path: seed, depth: 0 });
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= depthLimit) continue;

    const outgoing = resolvedLinks[current.path];
    if (outgoing) {
      Object.keys(outgoing).forEach((target) => {
        if (!isPathAllowed(target, includeCanvas)) return;
        if (result.has(target)) return;
        result.add(target);
        queue.push({ path: target, depth: current.depth + 1 });
      });
    }

    const incoming = reverseLinks.get(current.path);
    if (incoming) {
      incoming.forEach((source) => {
        if (!isPathAllowed(source, includeCanvas)) return;
        if (result.has(source)) return;
        result.add(source);
        queue.push({ path: source, depth: current.depth + 1 });
      });
    }
  }

  return result;
}

export function selectLocalScopePaths(options: LocalScopeSelectionOptions): Set<string> {
  const depthStart = Math.max(0, Math.round(options.depth));
  const depthMax = Math.max(depthStart, Math.round(options.maxDepth));
  const minNodes = Math.max(1, Math.round(options.minNodes));
  const fallbackSeeds = options.fallbackPaths.filter((path) => isPathAllowed(path, options.includeCanvas));
  const rootSeed = options.rootPath && isPathAllowed(options.rootPath, options.includeCanvas)
    ? options.rootPath
    : null;
  const seedPaths = rootSeed ? [rootSeed] : fallbackSeeds.slice(0, 1);

  if (seedPaths.length === 0) {
    return new Set<string>();
  }

  let best = runBreadthFirstSelection(
    seedPaths,
    depthStart,
    options.includeCanvas,
    options.resolvedLinks,
    options.reverseLinks
  );

  for (let depth = depthStart + 1; depth <= depthMax; depth += 1) {
    if (best.size >= minNodes) break;
    best = runBreadthFirstSelection(
      seedPaths,
      depth,
      options.includeCanvas,
      options.resolvedLinks,
      options.reverseLinks
    );
  }

  if (!rootSeed && best.size < minNodes) {
    for (const path of fallbackSeeds) {
      if (best.size >= minNodes) break;
      best.add(path);
    }
  }

  return best;
}
