import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphMeta } from '../../src/hyper/core/graph';
import { analyzeGraph } from '../../src/hyper/analysis/graphInsights';

test('analyzeGraph uses node raw.tags in insight descriptions', () => {
  const meta: GraphMeta = {
    type: 'graph',
    nodes: [
      {
        id: 'a',
        label: 'A',
        emoji: 'A',
        category: 'note',
        size: 1,
        color: [1, 1, 1],
        importance: 1,
        summary: '',
        media: [],
        imageUrl: '',
        thumbnailUrl: '',
        raw: { tags: ['shared', 'alpha'] } as any,
      },
      {
        id: 'b',
        label: 'B',
        emoji: 'B',
        category: 'note',
        size: 1,
        color: [1, 1, 1],
        importance: 1,
        summary: '',
        media: [],
        imageUrl: '',
        thumbnailUrl: '',
        raw: { tags: ['shared', 'beta'] } as any,
      },
      {
        id: 'c',
        label: 'C',
        emoji: 'C',
        category: 'note',
        size: 1,
        color: [1, 1, 1],
        importance: 1,
        summary: '',
        media: [],
        imageUrl: '',
        thumbnailUrl: '',
        raw: { tags: ['shared'] } as any,
      },
    ],
    links: [
      {
        index: 0,
        sourceIndex: 0,
        targetIndex: 1,
        value: 1,
        type: 'reference',
        description: '',
        color: [1, 1, 1],
      },
      {
        index: 1,
        sourceIndex: 1,
        targetIndex: 2,
        value: 1,
        type: 'reference',
        description: '',
        color: [1, 1, 1],
      },
    ],
    categories: ['note'],
    vertexColors: new Float32Array(9),
    vertexSizes: new Float32Array(3),
    maxLinkValue: 1,
    adjacency: [[1], [0, 2], [1]],
    summary: '',
    query: '',
  };

  const insights = analyzeGraph(meta);
  const descriptions = insights.groups
    .flatMap((group) => group.items.map((item) => item.description ?? ''))
    .join(' ');
  assert.match(descriptions, /#shared/i);
});
