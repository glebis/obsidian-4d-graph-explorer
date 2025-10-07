import type { App, CachedMetadata } from 'obsidian';
import { TFile } from 'obsidian';
import type { GraphDataPayload, RawGraphLink, RawGraphNode } from '../hyper/core/graph';
import type { ColorRule } from '../main';

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

interface DegreeMaps {
  outgoing: Map<string, number>;
  incoming: Map<string, number>;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tiff']);

function isFileExcluded(app: App, file: TFile): boolean {
  // Access Obsidian's user ignore filters from vault config
  const config = (app.vault as any).config;
  const userIgnoreFilters: string[] = config?.userIgnoreFilters ?? [];

  if (userIgnoreFilters.length === 0) return false;

  // Check if file path matches any exclusion pattern
  for (const pattern of userIgnoreFilters) {
    // Convert glob-like pattern to regex
    // Simple implementation: * becomes .*, ** becomes .*
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');

    try {
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(file.path)) {
        return true;
      }
    } catch (error) {
      console.warn('[vaultGraph] Invalid exclusion pattern:', pattern, error);
    }
  }

  return false;
}

function buildDegreeMaps(resolvedLinks: Record<string, Record<string, number>>): DegreeMaps {
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();

  Object.entries(resolvedLinks).forEach(([source, targets]) => {
    const totalOutgoing = Object.values(targets).reduce((sum, count) => sum + count, 0);
    outgoing.set(source, totalOutgoing);
    Object.entries(targets).forEach(([target, count]) => {
      incoming.set(target, (incoming.get(target) ?? 0) + count);
    });
  });

  return { outgoing, incoming };
}

function collectReverseLinks(resolvedLinks: Record<string, Record<string, number>>): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();
  Object.entries(resolvedLinks).forEach(([source, targets]) => {
    Object.keys(targets).forEach((target) => {
      if (!reverse.has(target)) reverse.set(target, new Set());
      reverse.get(target)!.add(source);
    });
  });
  return reverse;
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

  try {
    const content = await app.vault.cachedRead(file);
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    if (lines.length === 0) return '';
    return trimSummary(lines[0]);
  } catch (error) {
    console.warn('[vaultGraph] Failed to read file for summary', file.path, error);
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

function matchColorRule(rule: ColorRule, filePath: string, tags: string[], filename: string): boolean {
  if (!rule.enabled || !rule.pattern) return false;

  try {
    if (rule.type === 'tag') {
      const patterns = rule.pattern
        .split(/[,\s]+/)
        .map(p => p.trim().toLowerCase())
        .filter(p => p.length > 0);

      return patterns.some(pattern => tags.some(tag => tag.toLowerCase() === pattern));
    } else if (rule.type === 'path') {
      if (rule.pattern.startsWith('/') && rule.pattern.lastIndexOf('/') > 0) {
        const lastSlash = rule.pattern.lastIndexOf('/');
        const regexPattern = rule.pattern.slice(1, lastSlash);
        const flags = rule.pattern.slice(lastSlash + 1);
        const regex = new RegExp(regexPattern, flags || 'i');
        return regex.test(filePath);
      } else {
        return filePath.toLowerCase().includes(rule.pattern.toLowerCase());
      }
    } else if (rule.type === 'filename') {
      if (rule.pattern.startsWith('/') && rule.pattern.lastIndexOf('/') > 0) {
        const lastSlash = rule.pattern.lastIndexOf('/');
        const regexPattern = rule.pattern.slice(1, lastSlash);
        const flags = rule.pattern.slice(lastSlash + 1);
        const regex = new RegExp(regexPattern, flags || 'i');
        return regex.test(filename);
      } else {
        return filename.toLowerCase().includes(rule.pattern.toLowerCase());
      }
    }
  } catch (error) {
    console.warn('[vaultGraph] Invalid color rule pattern:', rule, error);
    return false;
  }

  return false;
}

function getCustomColorForFile(filePath: string, tags: string[], colorRules: ColorRule[]): number | null {
  const filename = filePath.split('/').pop() ?? '';

  for (const rule of colorRules) {
    if (matchColorRule(rule, filePath, tags, filename)) {
      // Convert hex color to integer
      const hex = rule.color.replace('#', '');
      const colorInt = parseInt(hex, 16);
      return colorInt;
    }
  }

  return null;
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

function pickFilesForLocalScope(
  options: VaultGraphOptions,
  resolvedLinks: Record<string, Record<string, number>>,
  reverseLinks: Map<string, Set<string>>
): Set<string> {
  const root = options.rootFile;
  const includeCanvas = options.includeCanvas ?? true;
  const depthLimit = options.depth ?? 2;

  const result = new Set<string>();
  if (!root) return result;

  const queue: Array<{ path: string; depth: number }> = [{ path: root.path, depth: 0 }];
  result.add(root.path);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= depthLimit) continue;

    const outgoing = resolvedLinks[current.path];
    if (outgoing) {
      Object.keys(outgoing).forEach((target) => {
        if (!includeCanvas && !target.toLowerCase().endsWith('.md')) return;
        if (!result.has(target)) {
          result.add(target);
          queue.push({ path: target, depth: current.depth + 1 });
        }
      });
    }

    const incoming = reverseLinks.get(current.path);
    if (incoming) {
      incoming.forEach((source) => {
        if (!includeCanvas && !source.toLowerCase().endsWith('.md')) return;
        if (!result.has(source)) {
          result.add(source);
          queue.push({ path: source, depth: current.depth + 1 });
        }
      });
    }
  }

  return result;
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
  const reverseLinks = collectReverseLinks(resolvedLinks);
  const degreeMaps = buildDegreeMaps(resolvedLinks);

  let targetFiles: TFile[] = [];
  if (options.scope === 'global') {
    targetFiles = gatherGlobalFiles(app, includeCanvas, maxNodes);
  } else {
    const paths = pickFilesForLocalScope(options, resolvedLinks, reverseLinks);
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
  const colorRules = options.colorRules ?? [];

  for (const file of filtered) {
    const cache = app.metadataCache.getFileCache(file) ?? null;
    const summary = await extractNoteSummary(app, file, cache);
    const { image, gallery } = gatherNodeMedia(app, file, cache);
    const importance = scoreNodeImportance(file.path, degreeMaps);
    const tags = extractTags(cache);
    const isMoc = tags.includes('moc');
    const nodeId = file.path;

    nodeIdByPath.set(file.path, nodeId);

    // Apply custom color if matching rule exists
    const customColor = getCustomColorForFile(file.path, tags, colorRules);
    const nodeData: RawGraphNode = {
      id: nodeId,
      label: file.basename,
      category: getCategoryForFile(file),
      summary,
      importance,
      size: importance * 2.5,
      imageUrl: image,
      media: gallery,
      raw: { isMoc, tags },
    };

    if (customColor !== null) {
      nodeData.color = customColor;
    }

    nodes.push(nodeData);
  }

  const links: RawGraphLink[] = [];

  filtered.forEach((file) => {
    const sourceId = nodeIdByPath.get(file.path);
    if (!sourceId) return;
    const outgoing = resolvedLinks[file.path];
    if (!outgoing) return;

    Object.entries(outgoing).forEach(([targetPath, count]) => {
      const targetId = nodeIdByPath.get(targetPath);
      if (!targetId) return;
      links.push({
        source: sourceId,
        target: targetId,
        value: count,
        type: isCanvasFile(file) ? 'canvas' : 'reference',
      });
    });
  });

  const scopeLabel = options.scope === 'global'
    ? 'Vault (global)'
    : `Vault • ${options.rootFile?.basename ?? 'selection'}`;

  return {
    nodes,
    links,
    summary: `${nodes.length} nodes · ${links.length} links`,
    query: scopeLabel,
  };
}
