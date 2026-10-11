import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/route-widget-lifecycle.js', import.meta.url), 'utf8');

function harness() {
  const document = new EventTarget();
  const window = {};
  const errors = [];
  const context = vm.createContext({ window, document, Map, console: { error: (...args) => errors.push(args) } });
  vm.runInContext(source, context);
  return { document, window, errors, context, dispatch: name => document.dispatchEvent(new Event(name)) };
}

test('route widgets mount once per document region and remove old listeners before replacement', () => {
  const env = harness();
  let button = new EventTarget();
  const oldButton = button;
  let mounts = 0;
  let clicks = 0;
  let cleanups = 0;
  let oldScope;
  env.window.oipRegisterRouteWidget('controls', scope => {
    mounts += 1;
    oldScope ??= scope;
    scope.on(button, 'click', () => { clicks += 1; });
    scope.cleanup(() => { cleanups += 1; });
  });
  env.window.oipRegisterRouteWidget('controls', () => assert.fail('Duplicate script registered again'));
  vm.runInContext(source, env.context);
  env.dispatch('oip:route');
  oldButton.dispatchEvent(new Event('click'));
  assert.equal(mounts, 1);
  assert.equal(clicks, 1);

  env.dispatch('oip:before-route');
  assert.equal(oldScope.active(), false, 'Late asynchronous callbacks can identify disposed routes');
  assert.equal(cleanups, 1);
  oldButton.dispatchEvent(new Event('click'));
  assert.equal(clicks, 1);
  button = new EventTarget();
  env.dispatch('oip:route');
  env.dispatch('oip:route');
  button.dispatchEvent(new Event('click'));
  oldButton.dispatchEvent(new Event('click'));
  assert.equal(mounts, 2);
  assert.equal(clicks, 2);
  assert.deepEqual(env.errors, []);
});

test('a widget first loaded after replacement mounts immediately and is not doubled by route completion', () => {
  const env = harness();
  let mounts = 0;
  env.dispatch('oip:before-route');
  env.window.oipRegisterRouteWidget('late-script', () => { mounts += 1; });
  env.dispatch('oip:route');
  assert.equal(mounts, 1);
  env.dispatch('oip:before-route');
  env.dispatch('oip:route');
  assert.equal(mounts, 2);
});

test('one failing cleanup cannot retain the remaining route listeners', () => {
  const env = harness();
  const button = new EventTarget();
  let clicks = 0;
  env.window.oipRegisterRouteWidget('cleanup', scope => {
    scope.on(button, 'click', () => { clicks += 1; });
    scope.cleanup(() => { throw new Error('fixture failure'); });
  });
  env.dispatch('oip:before-route');
  button.dispatchEvent(new Event('click'));
  assert.equal(clicks, 0);
  assert.equal(env.errors.length, 1);
});
