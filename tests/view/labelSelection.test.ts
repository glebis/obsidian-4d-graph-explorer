import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pickVisibleLabels,
  pushCandidateToPool,
  type LabelCandidate,
} from '../../src/view/labelSelection';

function candidate(overrides: Partial<LabelCandidate> = {}): LabelCandidate {
  return {
    index: 0,
    text: 'Node',
    x: 0,
    y: 0,
    opacity: 1,
    weight: 0.5,
    fontSize: 16,
    focus: false,
    missing: false,
    ...overrides,
  };
}

test('pushCandidateToPool keeps only highest-weight candidates within max size', () => {
  const pool: LabelCandidate[] = [];
  pushCandidateToPool(pool, candidate({ index: 0, weight: 0.1 }), 3);
  pushCandidateToPool(pool, candidate({ index: 1, weight: 0.4 }), 3);
  pushCandidateToPool(pool, candidate({ index: 2, weight: 0.2 }), 3);
  pushCandidateToPool(pool, candidate({ index: 3, weight: 0.05 }), 3);
  assert.deepEqual(pool.map((item) => item.index).sort(), [0, 1, 2]);

  pushCandidateToPool(pool, candidate({ index: 4, weight: 0.9 }), 3);
  assert.equal(pool.length, 3);
  assert.ok(pool.some((item) => item.index === 4));
});

test('pickVisibleLabels always keeps focus node and removes overlapping labels', () => {
  const selected = pickVisibleLabels([
    candidate({ index: 1, x: 100, y: 100, weight: 0.2, focus: true }),
    candidate({ index: 2, x: 105, y: 100, weight: 0.95, focus: false }),
    candidate({ index: 3, x: 320, y: 260, weight: 0.8, focus: false }),
  ], 2);

  assert.equal(selected.length, 2);
  assert.ok(selected.some((item) => item.index === 1));
  assert.ok(selected.some((item) => item.index === 3));
  assert.ok(!selected.some((item) => item.index === 2));
});

test('pickVisibleLabels keeps mandatory labels even when overlapping', () => {
  const selected = pickVisibleLabels([
    candidate({ index: 1, x: 100, y: 100, weight: 0.2, mandatory: true }),
    candidate({ index: 2, x: 104, y: 100, weight: 0.9, mandatory: true }),
    candidate({ index: 3, x: 320, y: 260, weight: 0.8 }),
  ], 3);

  assert.equal(selected.length, 3);
  assert.ok(selected.some((item) => item.index === 1));
  assert.ok(selected.some((item) => item.index === 2));
  assert.ok(selected.some((item) => item.index === 3));
});

test('pickVisibleLabels supports denser placement via overlapScale', () => {
  const sample = [
    candidate({ index: 1, x: 100, y: 100, weight: 0.9 }),
    candidate({ index: 2, x: 118, y: 100, weight: 0.8 }),
    candidate({ index: 3, x: 136, y: 100, weight: 0.7 }),
  ];

  const sparse = pickVisibleLabels(sample, 3, { overlapScale: 1.5 });
  const dense = pickVisibleLabels(sample, 3, { overlapScale: 0.55 });

  assert.ok(dense.length >= sparse.length);
});
