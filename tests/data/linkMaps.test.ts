import assert from 'node:assert/strict';
import test from 'node:test';
import { ResolvedLinkDerivedCache, type ResolvedLinks } from '../../src/data/linkMaps';

test('ResolvedLinkDerivedCache computes reverse and degree maps', () => {
  const cache = new ResolvedLinkDerivedCache();
  const resolvedLinks: ResolvedLinks = {
    'A.md': { 'B.md': 2, 'C.md': 1 },
    'B.md': { 'A.md': 1 },
  };
  const derived = cache.get(resolvedLinks);

  assert.equal(derived.degreeMaps.outgoing.get('A.md'), 3);
  assert.equal(derived.degreeMaps.outgoing.get('B.md'), 1);
  assert.equal(derived.degreeMaps.incoming.get('A.md'), 1);
  assert.equal(derived.degreeMaps.incoming.get('B.md'), 2);
  assert.equal(derived.degreeMaps.incoming.get('C.md'), 1);
  assert.deepEqual(Array.from(derived.reverseLinks.get('A.md') ?? []).sort(), ['B.md']);
  assert.deepEqual(Array.from(derived.reverseLinks.get('B.md') ?? []).sort(), ['A.md']);
});

test('ResolvedLinkDerivedCache reuses entries by resolvedLinks object identity', () => {
  const cache = new ResolvedLinkDerivedCache();
  const resolvedLinks: ResolvedLinks = {
    'A.md': { 'B.md': 1 },
  };
  const first = cache.get(resolvedLinks);
  const second = cache.get(resolvedLinks);
  assert.equal(first, second);

  const otherObjectSameContent: ResolvedLinks = {
    'A.md': { 'B.md': 1 },
  };
  const third = cache.get(otherObjectSameContent);
  assert.notEqual(first, third);
});
