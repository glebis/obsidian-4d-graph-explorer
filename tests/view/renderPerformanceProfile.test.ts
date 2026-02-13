import test from 'node:test';
import assert from 'node:assert/strict';
import { getRenderPerformanceProfile } from '../../src/view/renderPerformanceProfile';

test('getRenderPerformanceProfile keeps high quality for small graphs', () => {
  assert.deepEqual(getRenderPerformanceProfile(800, 2200), {
    maxPixelRatio: 2,
    edgeStride: 1,
  });
});

test('getRenderPerformanceProfile reduces pixel ratio for medium graphs', () => {
  assert.deepEqual(getRenderPerformanceProfile(2000, 3000), {
    maxPixelRatio: 1.5,
    edgeStride: 1,
  });
});

test('getRenderPerformanceProfile decimates edges and pixel ratio for large graphs', () => {
  assert.deepEqual(getRenderPerformanceProfile(3200, 8000), {
    maxPixelRatio: 1.25,
    edgeStride: 2,
  });
  assert.deepEqual(getRenderPerformanceProfile(5000, 16000), {
    maxPixelRatio: 1,
    edgeStride: 3,
  });
});

