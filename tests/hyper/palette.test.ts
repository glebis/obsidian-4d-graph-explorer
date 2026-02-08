import assert from 'node:assert/strict';
import test from 'node:test';
import { getTheme, themeList } from '../../src/hyper/render/palette';

test('all themes include UI palette values', () => {
  const themes = themeList();
  assert.ok(themes.length > 0);
  themes.forEach((theme) => {
    assert.equal(theme.ui.mode === 'dark' || theme.ui.mode === 'light', true);
    assert.equal(typeof theme.ui.background, 'string');
    assert.equal(typeof theme.ui.surfaceShadow, 'string');
    assert.equal(typeof theme.ui.deepShadow, 'string');
    assert.equal(typeof theme.ui.controlShadow, 'string');
    assert.equal(typeof theme.ui.insetShadow, 'string');
    assert.equal(typeof theme.ui.inputAccent, 'string');
    assert.equal(typeof theme.ui.checkboxAccent, 'string');
    assert.equal(typeof theme.ui.toolbarBackground, 'string');
    assert.equal(typeof theme.ui.panelBackground, 'string');
    assert.equal(typeof theme.ui.controlBackground, 'string');
    assert.equal(typeof theme.ui.imageBorder, 'string');
    assert.equal(typeof theme.ui.imageShadow, 'string');
    assert.equal(typeof theme.ui.divider, 'string');
  });
});

test('project includes at least one light interface theme', () => {
  const themes = themeList();
  const lightThemes = themes.filter((theme) => theme.ui.mode === 'light');
  assert.ok(lightThemes.length >= 1);
  assert.ok(lightThemes.some((theme) => theme.id === 'daylight' || theme.id === 'pastel'));
});

test('daylight theme is available and resolves from getTheme', () => {
  const theme = getTheme('daylight');
  assert.equal(theme.name, 'Daylight');
  assert.equal(theme.ui.mode, 'light');
});
