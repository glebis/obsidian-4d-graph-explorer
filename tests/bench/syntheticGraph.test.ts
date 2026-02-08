import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticGraphPayload } from '../../src/bench/syntheticGraph';

test('createSyntheticGraphPayload returns deterministic shape for same seed', () => {
  const a = createSyntheticGraphPayload({
    nodeCount: 120,
    averageDegree: 4,
    categoryCount: 5,
    seed: 777,
  });
  const b = createSyntheticGraphPayload({
    nodeCount: 120,
    averageDegree: 4,
    categoryCount: 5,
    seed: 777,
  });

  assert.equal(a.nodes?.length, 120);
  assert.equal(b.nodes?.length, 120);
  assert.equal(a.links?.length, b.links?.length);
  assert.deepEqual(a.links?.slice(0, 12), b.links?.slice(0, 12));
  assert.equal(a.summary, b.summary);
});

test('createSyntheticGraphPayload respects degree target bounds', () => {
  const payload = createSyntheticGraphPayload({
    nodeCount: 80,
    averageDegree: 6,
    seed: 12,
  });
  const expectedTarget = Math.round((80 * 6) / 2);
  assert.equal(payload.nodes?.length, 80);
  assert.equal(payload.links?.length, expectedTarget);
});
