import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const lifecycle = fs.readFileSync(new URL('../assets/js/route-widget-lifecycle.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../assets/js/music-page.js', import.meta.url), 'utf8');

function fixture(count = 5) {
  const document = new EventTarget();
  class Node extends EventTarget {
    constructor(dataset = {}) {
      super(); this.dataset = dataset; this.attributes = new Map(); this.nodes = new Map();
      this.textContent = ''; this.hidden = false; this.disabled = false; this.tabIndex = -1;
    }
    querySelector(selector) { return this.nodes.get(selector)?.[0] || null; }
    querySelectorAll(selector) { return this.nodes.get(selector) || []; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    closest(selector) { return selector === '[data-music-album]' && this.dataset.musicAlbum ? this : this.parentNode?.closest(selector) || null; }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
  }
  const page = new Node(), selector = new Node(), covers = new Node();
  const nodes = Object.fromEntries(['browse-previous', 'browse-next', 'selection-title', 'selection-artist', 'selection-count', 'selection-announcement', 'status', 'now-title', 'message', 'toggle', 'volume', 'previous', 'next'].map(name => [name, new Node()]));
  const choices = Array.from({ length: count }, (_, index) => new Node({ musicAlbum: `album-${index}`, musicAlbumTitle: `Album ${index + 1}`, musicAlbumArtist: `Artist ${index + 1}` }));
  const panels = choices.map(button => new Node({ musicPanel: button.dataset.musicAlbum }));
  choices.forEach(button => { button.parentNode = covers; });
  covers.parentNode = selector;
  page.nodes.set('[data-music-selector]', [selector]); page.nodes.set('[data-music-covers]', [covers]);
  page.nodes.set('[data-music-album]', choices); page.nodes.set('[data-music-panel]', panels);
  for (const [name, node] of Object.entries(nodes)) page.nodes.set(`[data-music-${name}]`, [node]);
  const play = new Node({ musicPlayAlbum: 'album-0' });
  page.nodes.set('[data-music-play-album]', [play]);
  page.nodes.set('[data-music-command]', [play, nodes.toggle, nodes.previous, nodes.next, nodes.volume]);
  document.querySelector = selector => selector === '[data-music-page]' ? page : null;
  const calls = [], errors = [];
  let subscriptions = 0, unsubscriptions = 0, now = 1000;
  const state = { ready: true, playlistStatus: 'ready', volume: 0.5, currentTrack: { id: 'playing-track', title: 'Playing track', artist: 'Artist' }, isPlaying: true };
  const api = Object.fromEntries(['playAlbum', 'playTrack', 'pause', 'togglePlay', 'previous', 'next', 'setVolume'].map(method => [method, argument => calls.push([method, argument])]));
  api.getState = () => state;
  api.subscribe = callback => { subscriptions += 1; callback(state); return () => { unsubscriptions += 1; }; };
  const window = { oipMusic: api };
  const context = vm.createContext({ window, document, Map, Date: { now: () => now }, console: { error: (...args) => errors.push(args) } });
  vm.runInContext(lifecycle, context); vm.runInContext(source, context);
  const fire = (node, type, values = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
    node.dispatchEvent(event); return event;
  };
  return { document, choices, panels, selector, covers, nodes, play, calls, errors, fire,
    click: node => fire(node, 'click', { detail: 1 }),
    selected: () => choices.findIndex(button => button.dataset.musicPosition === 'current'),
    tick: () => { now += 1000; }, subscriptions: () => [subscriptions, unsubscriptions] };
}

test('album carousel scales beyond two albums, clamps bounds, and never invokes playback while browsing', () => {
  const f = fixture(6);
  assert.equal(f.selected(), 0);
  assert.deepEqual(f.choices.map(button => button.dataset.musicPosition), ['current', 'right', 'after', 'after', 'after', 'after']);
  assert.equal(f.nodes['browse-previous'].disabled, true);
  assert.equal(f.nodes['browse-next'].disabled, false);
  f.click(f.nodes['browse-previous']); assert.equal(f.selected(), 0);
  f.click(f.choices[1]); assert.equal(f.selected(), 1, 'Adjacent covers remain clickable');
  f.click(f.nodes['browse-next']); assert.equal(f.selected(), 2);
  assert.deepEqual(f.choices.map(button => button.dataset.musicPosition), ['before', 'left', 'current', 'right', 'after', 'after']);
  assert.deepEqual(f.choices.map(button => button.getAttribute('aria-hidden')), ['true', 'false', 'false', 'false', 'true', 'true']);
  assert.deepEqual(f.choices.map(button => button.tabIndex), [-1, -1, 0, -1, -1, -1]);
  assert.deepEqual(f.panels.map(panel => panel.hidden), [true, true, false, true, true, true]);
  assert.equal(f.nodes['selection-title'].textContent, 'Album 3');
  assert.equal(f.nodes['selection-artist'].textContent, 'Artist 3');
  assert.equal(f.nodes['selection-count'].textContent, '03 / 06');
  assert.equal(f.nodes['selection-announcement'].textContent, 'Album 3, 3 of 6.');
  for (let i = 0; i < 8; i += 1) f.click(f.nodes['browse-next']);
  assert.equal(f.selected(), 5); assert.equal(f.nodes['browse-next'].disabled, true);
  assert.deepEqual(f.calls, [], 'Selection does not call the shared audio controller');
  f.click(f.play); assert.deepEqual(f.calls, [['playAlbum', 'album-0']], 'Explicit playback remains wired to the existing controller');
  assert.deepEqual(f.errors, []);
});

test('carousel keyboard movement keeps cover focus, respects modifiers, and handles one album', () => {
  const f = fixture();
  const key = (name, target = f.choices[f.selected()], extra = {}) => f.fire(f.selector, 'keydown', { key: name, target, ...extra });
  assert.equal(key('ArrowRight').defaultPrevented, true);
  assert.equal(f.selected(), 1); assert.equal(f.document.activeElement, f.choices[1]);
  assert.equal(f.choices[1].focusOptions.preventScroll, true);
  key('End'); assert.equal(f.selected(), 4); assert.equal(f.document.activeElement, f.choices[4]);
  key('Home'); assert.equal(f.selected(), 0);
  key('ArrowRight', f.choices[0], { altKey: true }); assert.equal(f.selected(), 0);
  assert.equal(key('Tab').defaultPrevented, false);
  f.nodes['browse-next'].focus(); key('ArrowRight', f.nodes['browse-next']);
  assert.equal(f.selected(), 1); assert.equal(f.document.activeElement, f.nodes['browse-next'], 'Arrow controls do not steal focus');
  key('End', f.nodes['browse-next']); assert.equal(f.document.activeElement, f.choices[4], 'A keyboard-disabled endpoint arrow hands focus to the selected cover');
  key('ArrowLeft'); f.nodes['browse-next'].focus(); f.fire(f.nodes['browse-next'], 'click', { detail: 0 });
  assert.equal(f.selected(), 4); assert.equal(f.document.activeElement, f.choices[4], 'Enter/Space activation keeps focus inside the selector at the endpoint');
  assert.deepEqual(f.calls, []);
  const single = fixture(1);
  assert.equal(single.nodes['browse-previous'].hidden, true);
  assert.equal(single.nodes['browse-next'].hidden, true);
  assert.equal(single.nodes['browse-previous'].disabled, true);
  assert.equal(single.nodes['browse-next'].disabled, true);
  single.fire(single.selector, 'keydown', { key: 'End', target: single.choices[0] });
  assert.equal(single.selected(), 0); assert.equal(single.nodes['selection-count'].textContent, '01 / 01');
  assert.deepEqual(single.calls, []);
});

test('horizontal touch browse suppresses its click, preserves vertical scrolling, and cleans up on navigation', () => {
  const f = fixture();
  const point = (x, y, id = 7) => ({ identifier: id, clientX: x, clientY: y });
  const start = () => f.fire(f.covers, 'touchstart', { touches: [point(200, 100)] });
  const end = (x, y) => f.fire(f.covers, 'touchend', { changedTouches: [point(x, y)] });
  start(); end(100, 110); assert.equal(f.selected(), 1);
  const ghost = f.click(f.choices[0]); assert.equal(ghost.defaultPrevented, true); assert.equal(f.selected(), 1);
  f.fire(f.choices[2], 'click', { detail: 0 }); assert.equal(f.selected(), 2, 'Keyboard activation is never swallowed by a prior swipe');
  start(); const scroll = f.fire(f.covers, 'touchmove', { touches: [point(195, 180)] });
  assert.equal(scroll.defaultPrevented, false); end(100, 185); assert.equal(f.selected(), 2);
  start(); end(180, 105); assert.equal(f.selected(), 2, 'Short taps do not swipe');
  f.fire(f.covers, 'touchstart', { touches: [point(200, 100), point(220, 100, 8)] });
  end(100, 100); assert.equal(f.selected(), 2, 'Pinch/multitouch does not browse');
  start(); f.fire(f.covers, 'touchcancel'); end(100, 100); assert.equal(f.selected(), 2);
  start(); end(280, 100); assert.equal(f.selected(), 1);
  assert.deepEqual(f.calls, []);
  f.fire(f.document, 'oip:before-route');
  assert.deepEqual(f.subscriptions(), [1, 1]);
  f.tick(); f.click(f.nodes['browse-next']); f.click(f.choices[4]); start(); end(100, 100);
  assert.equal(f.selected(), 1, 'Disposed route listeners cannot update the old page');
  f.fire(f.document, 'oip:route'); assert.deepEqual(f.subscriptions(), [2, 1]);
  assert.equal(f.selected(), 0); f.click(f.nodes['browse-next']); assert.equal(f.selected(), 1, 'Remount installs exactly one browse handler');
  assert.deepEqual(f.calls, []); assert.deepEqual(f.errors, []);
});
