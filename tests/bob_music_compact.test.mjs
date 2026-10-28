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

test('speaker placement fits narrow, offset and edge viewports without covering Bob or Show Bob', () => {
  for (const size of [{ width: 44, height: 145 }, { width: 48, height: 198 }]) {
  for (const view of [{ left: 0, top: 0, width: 320, height: 568 }, { left: 43, top: 182, width: 390, height: 260 }, { left: 0, top: 0, width: 1440, height: 900 }]) {
    for (const pet of [{ x: view.left, y: view.top, width: 100, height: 100 }, { x: view.left + view.width - 100, y: view.top + view.height - 100, width: 100, height: 100 }]) {
      const point = compactPlacement(view, size, pet);
      assert.ok(point.left >= view.left && point.top >= view.top);
      assert.ok(point.left + size.width <= view.left + view.width);
      assert.ok(point.top + size.height <= view.top + view.height);
      assert.ok(point.left >= pet.x + pet.width || point.left + size.width <= pet.x || point.top >= pet.y + pet.height || point.top + size.height <= pet.y, 'The speaker does not cover the sprite');
    }
    assert.deepEqual(compactPlacement(view, size, null, true), { left: view.left + view.width - size.width - 12, top: view.top + view.height - size.height - 12 });
    const restoreTop = view.top + view.height - 52;
    const restored = compactPlacement(view, size, null, true, 52);
    assert.ok(restored.top + size.height <= restoreTop - 12 || restored.left + size.width <= view.left + view.width - 100, 'Show Bob keeps its own unobstructed bottom-right target, including short touch viewports');
  }
  }
});

test('speaker stays six pixels right of Bob and bottom aligned; only horizontal edges trigger a fallback', () => {
  const view = { left: 0, top: 0, width: 1024, height: 900 }, size = { width: 44, height: 145 };
  assert.deepEqual(compactPlacement(view, size, { x: 400, y: 500, width: 100, height: 100 }), { left: 506, top: 455 });
  assert.deepEqual(compactPlacement(view, size, { x: 400, y: 0, width: 100, height: 100 }), { left: 506, top: 12 }, 'Clamping at the top does not send the speaker above or left of Bob');
  assert.deepEqual(compactPlacement(view, size, { x: 900, y: 500, width: 100, height: 100 }), { left: 850, top: 455 }, 'The right edge falls back to the left with the same six-pixel gap');
  const widePet = { x: 12, y: 300, width: 1000, height: 100 };
  const above = compactPlacement(view, size, widePet);
  assert.equal(above.top + size.height, widePet.y - 6, 'If neither side fits, use clear space above the sprite');
  assert.ok(above.left >= 12 && above.left + size.width <= 1012);
});
