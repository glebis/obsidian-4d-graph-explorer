import assert from 'node:assert/strict';
import test from 'node:test';
import { getLabelPerformanceProfile } from '../../src/view/labelPerformanceProfile';

test('small label sets keep higher fidelity defaults', () => {
  const profile = getLabelPerformanceProfile(900);
  assert.deepEqual(profile, {
    renderIntervalMs: 75,
    maxVisibleLabels: 24,
    maxCandidatePool: 160,
    minVisibility: 0.15,
    minOpacity: 0.25,
  });
});

test('large label sets increase throttling and culling', () => {
  const profile = getLabelPerformanceProfile(5200);
  assert.deepEqual(profile, {
    renderIntervalMs: 180,
    maxVisibleLabels: 18,
    maxCandidatePool: 100,
    minVisibility: 0.22,
    minOpacity: 0.24,
  });
});
