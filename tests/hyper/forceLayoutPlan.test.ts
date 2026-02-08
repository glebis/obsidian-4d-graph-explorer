import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRepulsionOffsets, planForceLayoutExecution } from '../../src/hyper/core/forceLayoutPlan';

test('planForceLayoutExecution keeps exact pairwise repulsion for small graphs', () => {
  const plan = planForceLayoutExecution(120, 48);
  assert.equal(plan.useApproximateRepulsion, false);
  assert.equal(plan.repulsionOffsets.length, 0);
  assert.equal(plan.estimatedPairChecksPerIteration, (120 * 119) / 2);
  assert.equal(plan.iterations, 48);
});

test('planForceLayoutExecution switches to approximate repulsion for large graphs', () => {
  const plan = planForceLayoutExecution(5000, 48);
  assert.equal(plan.useApproximateRepulsion, true);
  assert.ok(plan.repulsionOffsets.length > 0);
  assert.ok(plan.estimatedPairChecksPerIteration < (5000 * 4999) / 2);
  assert.ok(plan.iterations < 48);
  assert.ok(plan.iterations >= 6);
});

test('buildRepulsionOffsets returns unique bounded offsets', () => {
  const offsets = buildRepulsionOffsets(1000, 24);
  assert.equal(offsets.length, 24);
  const unique = new Set(offsets);
  assert.equal(unique.size, offsets.length);
  offsets.forEach((offset) => {
    assert.ok(offset > 0);
    assert.ok(offset < 1000);
  });
});
