import assert from 'node:assert/strict';
import test from 'node:test';
import type { ColorRule } from '../../src/main';
import {
  collectMissingTargetPaths,
  compileIgnorePattern,
  getCustomColorForFile,
  matchColorRule,
} from '../../src/data/vaultGraphRules';

test('compileIgnorePattern supports single and double star globs', () => {
  const single = compileIgnorePattern('Templates/*.md');
  assert.ok(single);
  assert.equal(single!.test('Templates/daily.md'), true);
  assert.equal(single!.test('Templates/nested/daily.md'), false);

  const deep = compileIgnorePattern('Projects/**');
  assert.ok(deep);
  assert.equal(deep!.test('Projects/2026/plan.md'), true);
});

test('matchColorRule matches tag, path, and filename patterns', () => {
  const tagRule: ColorRule = {
    id: '1',
    type: 'tag',
    pattern: 'person,project',
    color: '#ff0000',
    enabled: true,
  };
  assert.equal(matchColorRule(tagRule, 'People/Alice.md', ['person'], 'Alice.md'), true);

  const pathRule: ColorRule = {
    id: '2',
    type: 'path',
    pattern: '/people\\//i',
    color: '#00ff00',
    enabled: true,
  };
  assert.equal(matchColorRule(pathRule, 'vault/People/Alice.md', [], 'Alice.md'), true);

  const filenameRule: ColorRule = {
    id: '3',
    type: 'filename',
    pattern: 'index',
    color: '#0000ff',
    enabled: true,
  };
  assert.equal(matchColorRule(filenameRule, 'vault/notes/my-index.md', [], 'my-index.md'), true);
});

test('getCustomColorForFile returns first matched rule color', () => {
  const rules: ColorRule[] = [
    { id: 'r1', type: 'tag', pattern: 'person', color: '#112233', enabled: true },
    { id: 'r2', type: 'path', pattern: 'People', color: '#ff0000', enabled: true },
  ];

  const color = getCustomColorForFile('People/Alice.md', ['person'], rules);
  assert.equal(color, 0x112233);
});

test('collectMissingTargetPaths returns unresolved targets and respects limits', () => {
  const resolvedLinks = {
    'A.md': { 'B.md': 1, 'C.canvas': 1, 'Missing.md': 2 },
    'B.md': { 'Missing-2.md': 1 },
  };

  const missing = collectMissingTargetPaths({
    includeCanvas: false,
    maxCount: 1,
    sourcePaths: ['A.md', 'B.md'],
    resolvedLinks,
    knownPaths: new Set(['A.md', 'B.md']),
    hasPath: (path) => path === 'B.md',
  });

  assert.deepEqual(missing, ['Missing.md']);
});
