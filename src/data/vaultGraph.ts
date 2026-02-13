import type { App, CachedMetadata } from 'obsidian';
import { TFile } from 'obsidian';
import type { GraphDataPayload, RawGraphLink, RawGraphNode } from '../hyper/core/graph';
import type { ColorRule } from '../main';
import {
  collectMissingTargetPaths,
  compileIgnorePattern,
  getCustomColorForFile,
} from './vaultGraphRules';
import { type DegreeMaps, resolvedLinkDerivedCache } from './linkMaps';
import { selectLocalScopePaths } from './localScopeSelection';

export type VaultGraphScope = 'global' | 'local';

export interface VaultGraphOptions {
  scope: VaultGraphScope;
  rootFile?: TFile | null;
  includeCanvas?: boolean;
  includeAttachments?: boolean;
  maxNodes?: number;
  depth?: number;
  showOnlyExistingFiles?: boolean;
  colorRules?: ColorRule[];
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tiff']);
const noteSummaryCache = new Map<string, { mtime: number; summary: string }>();
const nodeSnapshotCache = new Map<string, { mtime: number; snapshot: NodeSnapshot }>();

interface NodeSnapshot {
  label: string;
  category: string;
  summary: string;
  imageUrl: string;
  media: string[];
  tags: string[];
  isMoc: boolean;
}

function isFileExcluded(app: App, file: TFile): boolean {
  // Access Obsidian's user ignore filters from vault config
  const config = (app.vault as any).config;
  const userIgnoreFilters: string[] = config?.userIgnoreFilters ?? [];

  if (userIgnoreFilters.length === 0) return false;

  // Check if file path matches any exclusion pattern
  for (const pattern of userIgnoreFilters) {
    const regex = compileIgnorePattern(pattern);
    if (!regex) continue;
    if (regex.test(file.path)) {
      return true;
    }
  }

  return false;
}

function isCanvasFile(file: TFile): boolean {
  return file.extension.toLowerCase() === 'canvas';
}

function isMarkdown(file: TFile): boolean {
  return file.extension.toLowerCase() === 'md';
}

function getCategoryForFile(file: TFile): string {
  if (isMarkdown(file)) return 'note';
  if (isCanvasFile(file)) return 'canvas';
  if (IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) return 'image';
  return file.extension.toLowerCase();
}

function trimSummary(summary: string, maxLength = 220): string {
  if (!summary) return '';
  if (summary.length <= maxLength) return summary;
  return `${summary.slice(0, maxLength - 1).trim()}…`;
}

async function extractNoteSummary(app: App, file: TFile, cache: CachedMetadata | null): Promise<string> {
  if (!isMarkdown(file)) {
    return `${file.basename}.${file.extension}`;
  }

  const fm = cache?.frontmatter;
  const summaryField = (fm?.summary ?? fm?.description ?? fm?.abstract);
  if (summaryField && typeof summaryField === 'string') {
    return trimSummary(summaryField);
  }

  if (cache?.headings?.length) {
    const heading = cache.headings[0].heading;
    if (heading) return trimSummary(heading.trim());
  }

  const cached = noteSummaryCache.get(file.path);
  if (cached && cached.mtime === file.stat.mtime) {
    return cached.summary;
  }

  try {
    const content = await app.vault.cachedRead(file);
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    const summary = lines.length === 0 ? '' : trimSummary(lines[0]);
    noteSummaryCache.set(file.path, { mtime: file.stat.mtime, summary });
    return summary;
  } catch (error) {
    console.warn('[vaultGraph] Failed to read file for summary', file.path, error);
    if (cached) {
      return cached.summary;
    }
    return '';
  }
}

function resolveEmbedResource(app: App, source: TFile, link: string): string | null {
  const target = app.metadataCache.getFirstLinkpathDest(link, source.path);
  if (!target) return null;
  if (!IMAGE_EXTENSIONS.has(target.extension.toLowerCase())) return null;
  return app.vault.getResourcePath(target);
}

function gatherNodeMedia(app: App, file: TFile, cache: CachedMetadata | null): { image?: string; gallery: string[] } {
  const media = new Set<string>();
  let hero: string | undefined;

  cache?.embeds?.forEach((embed) => {
    const resource = resolveEmbedResource(app, file, embed.link);
    if (resource) {
      if (!hero) hero = resource;
      media.add(resource);
    }
  });

  cache?.links?.forEach((link) => {
    const resource = resolveEmbedResource(app, file, link.link);
    if (resource) {
      if (!hero) hero = resource;
      media.add(resource);
    }
  });

  return {
    image: hero,
    gallery: Array.from(media),
  };
}

async function buildNodeSnapshot(app: App, file: TFile): Promise<NodeSnapshot> {
  const cached = nodeSnapshotCache.get(file.path);
  if (cached && cached.mtime === file.stat.mtime) {
    return cached.snapshot;
  }

  const cache = app.metadataCache.getFileCache(file) ?? null;
  const summary = await extractNoteSummary(app, file, cache);
  const { image, gallery } = gatherNodeMedia(app, file, cache);
  const tags = extractTags(cache);
  const snapshot: NodeSnapshot = {
    label: file.basename,
    category: getCategoryForFile(file),
    summary,
    imageUrl: image ?? '',
    media: gallery,
    tags,
    isMoc: tags.includes('moc'),
  };
  nodeSnapshotCache.set(file.path, {
    mtime: file.stat.mtime,
    snapshot,
  });
  return snapshot;
}

function scoreNodeImportance(path: string, maps: DegreeMaps): number {
  const outgoing = maps.outgoing.get(path) ?? 0;
  const incoming = maps.incoming.get(path) ?? 0;
  const base = outgoing + incoming;
  if (base === 0) return 1;
  return Math.min(6, 2 + Math.log2(base + 1));
}

function extractTags(cache: CachedMetadata | null): string[] {
  if (!cache) return [];
  const tags = new Set<string>();

  // Extract from frontmatter tags
  if (cache.frontmatter?.tags) {
    const fmTags = cache.frontmatter.tags;
    if (Array.isArray(fmTags)) {
      fmTags.forEach(tag => tags.add(String(tag).toLowerCase()));
    } else if (typeof fmTags === 'string') {
      tags.add(fmTags.toLowerCase());
    }
  }

  // Extract from inline tags
  if (cache.tags) {
    cache.tags.forEach(tagInfo => {
      const tag = tagInfo.tag.replace(/^#/, '').toLowerCase();
      tags.add(tag);
    });
  }

  return Array.from(tags);
}

function gatherGlobalFiles(app: App, includeCanvas: boolean, maxNodes: number): TFile[] {
  const markdown = app.vault.getMarkdownFiles();
  const canvases = includeCanvas
    ? app.vault.getFiles().filter((file) => isCanvasFile(file))
    : [];
  const combined = [...markdown, ...canvases];
  combined.sort((a, b) => b.stat.mtime - a.stat.mtime);
  return combined.slice(0, maxNodes);
}

function gatherRecentPaths(app: App, includeCanvas: boolean, maxNodes: number): string[] {
  return gatherGlobalFiles(app, includeCanvas, maxNodes).map((file) => file.path);
}

function pickFilesForLocalScope(
  app: App,
  options: VaultGraphOptions,
  resolvedLinks: Record<string, Record<string, number>>,
  reverseLinks: Map<string, Set<string>>
): Set<string> {
  const root = options.rootFile;
  const includeCanvas = options.includeCanvas ?? true;
  const depthLimit = options.depth ?? 2;
  const maxNodes = options.maxNodes ?? 360;
  const minNodes = Math.max(8, Math.min(maxNodes, 48));

  return selectLocalScopePaths({
    rootPath: root?.path ?? null,
    depth: depthLimit,
    minNodes,
    maxDepth: Math.max(depthLimit, 4),
    includeCanvas,
    fallbackPaths: gatherRecentPaths(app, includeCanvas, maxNodes),
    resolvedLinks,
    reverseLinks,
  });
}

function materializePaths(app: App, paths: Set<string>): TFile[] {
  const files: TFile[] = [];
  paths.forEach((path) => {
    const entry = app.vault.getAbstractFileByPath(path);
    if (entry instanceof TFile) {
      files.push(entry);
    }
  });
  return files;
}

export async function buildVaultGraph(app: App, options: VaultGraphOptions): Promise<GraphDataPayload> {
  const includeCanvas = options.includeCanvas ?? true;
  const includeAttachments = options.includeAttachments ?? false;
  const maxNodes = options.maxNodes ?? 360;
  const showOnlyExistingFiles = options.showOnlyExistingFiles ?? true;

  const resolvedLinks = app.metadataCache.resolvedLinks;
  const derivedLinks = resolvedLinkDerivedCache.get(resolvedLinks);
  const reverseLinks = derivedLinks.reverseLinks;
  const degreeMaps = derivedLinks.degreeMaps;

  let targetFiles: TFile[] = [];
  if (options.scope === 'global') {
    targetFiles = gatherGlobalFiles(app, includeCanvas, maxNodes);
  } else {
    const paths = pickFilesForLocalScope(app, options, resolvedLinks, reverseLinks);
    targetFiles = materializePaths(app, paths).slice(0, maxNodes);
  }

  const filtered: TFile[] = [];
  const seen = new Set<string>();
  targetFiles.forEach((file) => {
    if (seen.has(file.path)) return;
    if (isFileExcluded(app, file)) return;
    const category = getCategoryForFile(file);
    if (category === 'image' && !includeAttachments) return;
    seen.add(file.path);
    filtered.push(file);
  });

  const nodes: RawGraphNode[] = [];
  const nodeIdByPath = new Map<string, string>();
  const missingNodesByPath = new Map<string, RawGraphNode>();
  const colorRules = options.colorRules ?? [];
  const includedPaths = new Set(filtered.map((file) => file.path));

  const missingNodePaths = showOnlyExistingFiles
    ? []
    : collectMissingTargetPaths({
      includeCanvas,
      maxCount: Math.max(0, maxNodes - filtered.length),
      sourcePaths: filtered.map((file) => file.path),
      resolvedLinks,
      knownPaths: includedPaths,
      hasPath: (path) => {
        const entry = app.vault.getAbstractFileByPath(path);
        return entry instanceof TFile;
      },
    });

  const existingNodeData = await Promise.all(
    filtered.map(async (file) => {
      const snapshot = await buildNodeSnapshot(app, file);
      const importance = scoreNodeImportance(file.path, degreeMaps);
      const nodeId = file.path;

      const customColor = getCustomColorForFile(file.path, snapshot.tags, colorRules);
      const nodeData: RawGraphNode = {
        id: nodeId,
        label: snapshot.label,
        category: snapshot.category,
        summary: snapshot.summary,
        importance,
        size: importance * 2.5,
        imageUrl: snapshot.imageUrl,
        media: [...snapshot.media],
        raw: { isMoc: snapshot.isMoc, tags: [...snapshot.tags] },
      };
      if (customColor !== null) {
        nodeData.color = customColor;
      }
      return { path: file.path, nodeData };
    })
  );

  existingNodeData.forEach(({ path, nodeData }) => {
    nodeIdByPath.set(path, String(nodeData.id ?? path));
    nodes.push(nodeData);
  });

  missingNodePaths.forEach((missingPath) => {
    const nodeId = missingPath;
    const missingNode: RawGraphNode = {
      id: nodeId,
      label: missingPath.split('/').pop() ?? missingPath,
      category: 'missing',
      summary: 'Unresolved link target',
      importance: 1,
      size: 2.5,
      raw: {
        isMissing: true,
        tags: [],
        incomingReferences: 0,
        incomingSources: 0,
      },
    };
    nodeIdByPath.set(missingPath, nodeId);
    missingNodesByPath.set(missingPath, missingNode);
    nodes.push(missingNode);
  });

  const links: RawGraphLink[] = [];

  filtered.forEach((file) => {
    const sourceId = nodeIdByPath.get(file.path);
    if (!sourceId) return;
    const outgoing = resolvedLinks[file.path];
    if (!outgoing) return;

    Object.entries(outgoing).forEach(([targetPath, count]) => {
      const targetId = nodeIdByPath.get(targetPath);
      if (!targetId) return;
      const missingNode = missingNodesByPath.get(targetPath);
      if (missingNode && missingNode.raw && typeof missingNode.raw === 'object') {
        const raw = missingNode.raw as { incomingReferences?: number; incomingSourcePaths?: Set<string>; incomingSources?: number };
        raw.incomingReferences = (raw.incomingReferences ?? 0) + count;
        if (!raw.incomingSourcePaths) {
          raw.incomingSourcePaths = new Set<string>();
        }
        raw.incomingSourcePaths.add(file.path);
        raw.incomingSources = raw.incomingSourcePaths.size;
      }
      links.push({
        source: sourceId,
        target: targetId,
        value: count,
        type: missingNode ? 'missing-reference' : (isCanvasFile(file) ? 'canvas' : 'reference'),
      });
    });
  });

  missingNodesByPath.forEach((node) => {
    if (!node.raw || typeof node.raw !== 'object') return;
    const raw = node.raw as { incomingSourcePaths?: Set<string> };
    if (raw.incomingSourcePaths) {
      delete raw.incomingSourcePaths;
    }
  });

  const scopeLabel = options.scope === 'global'
    ? 'Vault (global)'
    : `Vault • ${options.rootFile?.basename ?? 'selection'}`;

  return {
    nodes,
    links,
    summary: `${nodes.length} nodes · ${links.length} links${missingNodePaths.length > 0 ? ` · ${missingNodePaths.length} unresolved` : ''}`,
    query: scopeLabel,
  };
}

export const __vaultGraphInternals = {
  clearCaches(): void {
    noteSummaryCache.clear();
    nodeSnapshotCache.clear();
    resolvedLinkDerivedCache.clear();
  },
};
