import assert from 'node:assert/strict';
import test from 'node:test';
import { blendGraphChannel, blendGraphRgb } from '../../src/hyper/render/colorThemeMath';

test('blendGraphChannel clamps blend strength and output range', () => {
  assert.equal(blendGraphChannel(0.2, 0.8, -1), 0.2);
  assert.equal(blendGraphChannel(0.2, 0.8, 2), 0.8);
  assert.equal(blendGraphChannel(-2, 2, 0.5), 0);
});

test('blendGraphRgb shifts base color toward theme color', () => {
  const base: [number, number, number] = [1, 0, 0];
  const theme: [number, number, number] = [0, 0, 1];

  const blended = blendGraphRgb(base, theme, 0.75);
  assert.ok(blended[2] > blended[0], 'blue channel should dominate after strong theme blend');
  assert.ok(blended[1] === 0, 'green stays zero with zero inputs');
});
