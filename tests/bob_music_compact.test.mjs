import test from 'node:test';
import assert from 'node:assert/strict';
import { initialCompactState, compactTransition, compactVisible, compactPlacement } from '../assets/js/bob-music-state.js';

const playback = (state, playing) => compactTransition(state, { type: 'playback', playing });
const cabinet = (state, open, playing = false, reason = 'user') => compactTransition(state, { type: 'cabinet', open, playing, reason });

test('compact controls obey the playback and explicit paused-dismissal contract', () => {
  let state = initialCompactState();
  assert.equal(compactVisible(state), false);
  state = playback(state, true);
  assert.equal(compactVisible(state), true);
  state = playback(state, false);
  assert.equal(compactVisible(state), true, 'pausing from compact retains controls');
  state = cabinet(state, true);
  assert.equal(compactVisible(state), false);
  state = cabinet(state, false);
  assert.equal(compactVisible(state), false, 'explicit paused cabinet close dismisses');
  state = cabinet(cabinet(state, true), false);
  assert.equal(compactVisible(state), false, 'opening again does not reset dismissal');
  state = playback(state, true);
  assert.equal(compactVisible(state), true, 'actual playback clears dismissal');
  state = cabinet(cabinet(state, true, true), false, true);
  assert.equal(compactVisible(state), true, 'playing cabinet close reveals compact');
});

test('temporary typing/menu/navigation concealment and Hide preserve paused controls', () => {
  const paused = playback(playback(initialCompactState(), true), false);
  assert.equal(compactVisible(paused, { concealed: true }), false);
  assert.equal(compactVisible(paused), true);
  for (const reason of ['home', 'hide']) {
    const state = cabinet(cabinet(paused, true), false, false, reason);
    assert.equal(compactVisible(state), true, `${reason} does not dismiss`);
  }
  assert.equal(compactVisible(cabinet(paused, true), { bobHidden: true }), true);
  const dismissed = cabinet(cabinet(paused, true), false);
  assert.equal(compactVisible(dismissed, { bobHidden: true }), false, 'Hide cannot resurrect dismissed controls');
});

test('compact placement fits narrow, offset and edge viewports; hidden Bob uses bottom right', () => {
  const size = { width: 250, height: 86 };
  for (const view of [{ left: 0, top: 0, width: 320, height: 568 }, { left: 43, top: 182, width: 390, height: 260 }, { left: 0, top: 0, width: 1440, height: 900 }]) {
    for (const pet of [{ x: view.left, y: view.top, width: 100, height: 100 }, { x: view.left + view.width - 100, y: view.top + view.height - 100, width: 100, height: 100 }]) {
      const point = compactPlacement(view, size, pet);
      assert.ok(point.left >= view.left && point.top >= view.top);
      assert.ok(point.left + size.width <= view.left + view.width);
      assert.ok(point.top + size.height <= view.top + view.height);
    }
    assert.deepEqual(compactPlacement(view, size, null, true), { left: view.left + view.width - size.width - 12, top: view.top + view.height - size.height - 12 });
    const restoreTop = view.top + view.height - 52;
    assert.equal(compactPlacement(view, size, null, true, 52).top + size.height, restoreTop - 12, 'Show Bob keeps its own unobstructed target');
  }
});
