import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNarrativeGraphFromData } from '../../src/hyper/core/graph';

test('missing nodes use warning emoji and dedicated styling metadata', () => {
  const graph = buildNarrativeGraphFromData({
    nodes: [
      { id: 'note-a', label: 'Note A', category: 'note' },
      {
        id: 'missing-target.md',
        label: 'missing-target.md',
        category: 'missing',
        raw: { isMissing: true },
      },
    ],
    links: [
      {
        source: 'note-a',
        target: 'missing-target.md',
        type: 'missing-reference',
      },
    ],
  });

  const missingNode = graph.meta.nodes.find((node) => node.id === 'missing-target.md');
  assert.ok(missingNode);
  assert.equal(missingNode!.emoji, '⚠️');
  assert.equal(missingNode!.category, 'missing');
  assert.equal(missingNode!.summary, 'Unresolved link target');

  const link = graph.meta.links[0];
  assert.equal(link.type, 'missing-reference');
  assert.ok(link.color[0] > link.color[2]);
});
