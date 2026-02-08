import assert from 'node:assert/strict';
import test from 'node:test';
import { getGraphLabelDispatchIntervalMs } from '../../src/hyper/render/graphLabelDispatch';

test('getGraphLabelDispatchIntervalMs scales with graph size', () => {
  assert.equal(getGraphLabelDispatchIntervalMs(1200), 60);
  assert.equal(getGraphLabelDispatchIntervalMs(3000), 130);
  assert.equal(getGraphLabelDispatchIntervalMs(6000), 180);
});
