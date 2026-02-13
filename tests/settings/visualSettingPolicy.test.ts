import assert from 'node:assert/strict';
import test from 'node:test';
import { visualSettingRefreshOptions, visualSettingRequiresGraphReload } from '../../src/settings/visualSettingPolicy';

test('visualSettingPolicy keeps theme and label font changes as visual-only refreshes', () => {
  assert.equal(visualSettingRequiresGraphReload('theme'), false);
  assert.equal(visualSettingRequiresGraphReload('label-font'), false);
  assert.equal(visualSettingRequiresGraphReload('auto-performance-mode'), false);
  assert.equal(visualSettingRequiresGraphReload('label-display'), false);
  assert.deepEqual(visualSettingRefreshOptions('theme'), { reloadGraph: false });
});

test('visualSettingPolicy requires graph reload for color rules and existing-file filter', () => {
  assert.equal(visualSettingRequiresGraphReload('color-rules'), true);
  assert.equal(visualSettingRequiresGraphReload('show-only-existing-files'), true);
  assert.deepEqual(visualSettingRefreshOptions('show-only-existing-files'), { reloadGraph: true });
});
