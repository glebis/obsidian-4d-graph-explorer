import assert from 'node:assert/strict';
import test from 'node:test';
import { selectLocalScopePaths, type ResolvedLinks } from '../../src/data/localScopeSelection';

function buildReverseLinks(resolvedLinks: ResolvedLinks): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();
  Object.entries(resolvedLinks).forEach(([source, targets]) => {
    Object.keys(targets).forEach((target) => {
      if (!reverse.has(target)) reverse.set(target, new Set());
      reverse.get(target)!.add(source);
    });
  });
  return reverse;
}

test('selectLocalScopePaths expands around provided root using incoming and outgoing links', () => {
  const resolvedLinks: ResolvedLinks = {
    'root.md': { 'a.md': 1 },
    'a.md': { 'b.md': 1 },
    'inbound.md': { 'root.md': 1 },
  };

  const selected = selectLocalScopePaths({
    rootPath: 'root.md',
    depth: 1,
    minNodes: 1,
    maxDepth: 3,
    includeCanvas: true,
    fallbackPaths: ['fallback.md'],
    resolvedLinks,
    reverseLinks: buildReverseLinks(resolvedLinks),
  });

  assert.deepEqual(Array.from(selected).sort(), ['a.md', 'inbound.md', 'root.md']);
});

test('selectLocalScopePaths falls back to recent path when root is missing', () => {
  const resolvedLinks: ResolvedLinks = {
    'recent.md': { 'near.md': 1 },
    'near.md': {},
  };

  const selected = selectLocalScopePaths({
    rootPath: null,
    depth: 1,
    minNodes: 8,
    maxDepth: 3,
    includeCanvas: true,
    fallbackPaths: ['recent.md', 'extra.md'],
    resolvedLinks,
    reverseLinks: buildReverseLinks(resolvedLinks),
  });

  assert.ok(selected.has('recent.md'));
  assert.ok(selected.has('near.md'));
});

test('selectLocalScopePaths augments with fallback paths when root is missing and graph is sparse', () => {
  const resolvedLinks: ResolvedLinks = {
    'recent.md': {},
    'second.md': {},
    'third.md': {},
  };

  const selected = selectLocalScopePaths({
    rootPath: null,
    depth: 1,
    minNodes: 3,
    maxDepth: 3,
    includeCanvas: true,
    fallbackPaths: ['recent.md', 'second.md', 'third.md'],
    resolvedLinks,
    reverseLinks: buildReverseLinks(resolvedLinks),
  });

  assert.deepEqual(Array.from(selected).sort(), ['recent.md', 'second.md', 'third.md']);
});

test('selectLocalScopePaths excludes canvas paths when includeCanvas is false', () => {
  const resolvedLinks: ResolvedLinks = {
    'root.md': { 'board.canvas': 1, 'neighbor.md': 1 },
    'neighbor.md': {},
  };

  const selected = selectLocalScopePaths({
    rootPath: 'root.md',
    depth: 1,
    minNodes: 8,
    maxDepth: 3,
    includeCanvas: false,
    fallbackPaths: ['root.md'],
    resolvedLinks,
    reverseLinks: buildReverseLinks(resolvedLinks),
  });

  assert.deepEqual(Array.from(selected).sort(), ['neighbor.md', 'root.md']);
});

test('selectLocalScopePaths augments sparse rooted selection with fallback neighborhoods', () => {
  const resolvedLinks: ResolvedLinks = {
    'root.md': {},
    'recent.md': { 'nearby.md': 1 },
    'nearby.md': {},
  };

  const selected = selectLocalScopePaths({
    rootPath: 'root.md',
    depth: 1,
    minNodes: 3,
    maxDepth: 3,
    includeCanvas: true,
    fallbackPaths: ['recent.md', 'nearby.md'],
    resolvedLinks,
    reverseLinks: buildReverseLinks(resolvedLinks),
  });

  assert.deepEqual(Array.from(selected).sort(), ['nearby.md', 'recent.md', 'root.md']);
});
