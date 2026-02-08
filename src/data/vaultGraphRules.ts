import type { ColorRule } from '../main';

function escapeRegexChar(ch: string): string {
  return /[\\^$+?.()|[\]{}]/.test(ch) ? `\\${ch}` : ch;
}

export function compileIgnorePattern(pattern: string): RegExp | null {
  if (!pattern) return null;
  let regex = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      const isDouble = pattern[i + 1] === '*';
      if (isDouble) {
        regex += '.*';
        i += 1;
      } else {
        regex += '[^/]*';
      }
      continue;
    }
    regex += escapeRegexChar(ch);
  }
  regex += '$';
  try {
    return new RegExp(regex);
  } catch {
    return null;
  }
}

export function matchColorRule(rule: ColorRule, filePath: string, tags: string[], filename: string): boolean {
  if (!rule.enabled || !rule.pattern) return false;

  try {
    if (rule.type === 'tag') {
      const patterns = rule.pattern
        .split(/[,\s]+/)
        .map((p) => p.trim().toLowerCase())
        .filter((p) => p.length > 0);

      return patterns.some((pattern) => tags.some((tag) => tag.toLowerCase() === pattern));
    }
    if (rule.type === 'path') {
      if (rule.pattern.startsWith('/') && rule.pattern.lastIndexOf('/') > 0) {
        const lastSlash = rule.pattern.lastIndexOf('/');
        const regexPattern = rule.pattern.slice(1, lastSlash);
        const flags = rule.pattern.slice(lastSlash + 1);
        const regex = new RegExp(regexPattern, flags || 'i');
        return regex.test(filePath);
      }
      return filePath.toLowerCase().includes(rule.pattern.toLowerCase());
    }
    if (rule.type === 'filename') {
      if (rule.pattern.startsWith('/') && rule.pattern.lastIndexOf('/') > 0) {
        const lastSlash = rule.pattern.lastIndexOf('/');
        const regexPattern = rule.pattern.slice(1, lastSlash);
        const flags = rule.pattern.slice(lastSlash + 1);
        const regex = new RegExp(regexPattern, flags || 'i');
        return regex.test(filename);
      }
      return filename.toLowerCase().includes(rule.pattern.toLowerCase());
    }
  } catch {
    return false;
  }

  return false;
}

export function getCustomColorForFile(filePath: string, tags: string[], colorRules: ColorRule[]): number | null {
  const filename = filePath.split('/').pop() ?? '';

  for (const rule of colorRules) {
    if (matchColorRule(rule, filePath, tags, filename)) {
      const hex = rule.color.replace('#', '');
      const colorInt = parseInt(hex, 16);
      if (Number.isFinite(colorInt)) {
        return colorInt;
      }
      return null;
    }
  }

  return null;
}

interface CollectMissingTargetPathsOptions {
  includeCanvas: boolean;
  maxCount: number;
  sourcePaths: string[];
  resolvedLinks: Record<string, Record<string, number>>;
  hasPath: (path: string) => boolean;
  knownPaths: Set<string>;
}

export function collectMissingTargetPaths(options: CollectMissingTargetPathsOptions): string[] {
  const {
    includeCanvas,
    maxCount,
    sourcePaths,
    resolvedLinks,
    hasPath,
    knownPaths,
  } = options;

  const missing: string[] = [];
  const seen = new Set<string>();

  for (const sourcePath of sourcePaths) {
    const outgoing = resolvedLinks[sourcePath];
    if (!outgoing) continue;

    for (const targetPath of Object.keys(outgoing)) {
      if (!includeCanvas && !targetPath.toLowerCase().endsWith('.md')) continue;
      if (knownPaths.has(targetPath) || seen.has(targetPath)) continue;
      if (hasPath(targetPath)) continue;
      seen.add(targetPath);
      missing.push(targetPath);
      if (missing.length >= maxCount) {
        return missing;
      }
    }
  }

  return missing;
}
