import test from 'node:test';
import assert from 'node:assert/strict';
import { createBobStorage, claimVisit, VISITOR_KEY, VISIT_GAP_MS } from '../assets/js/companion-bob-visit.js';

const NOW = 2_000_000_000_000;
const knownVisitor = (lastActiveAt) => ({ version: 1, seen: true, lastActiveAt, lastGreetingAt: lastActiveAt });

function browserStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  let writable = true;
  return {
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) {
      if (!writable) throw Object.assign(new Error('Storage is full.'), { name: 'QuotaExceededError' });
      entries.set(key, String(value));
    },
    removeItem(key) { entries.delete(key); },
    failWrites() { writable = false; },
  };
}

// The implementation consults window only when choosing storage. Restore the
// global immediately so this test can also run inside the aggregate suite.
function openStorage(browserWindow) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  try { return createBobStorage(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  }
}

function deniedStorage() {
  throw Object.assign(new Error('Storage access denied.'), { name: 'SecurityError' });
}

test('Bob says Hi once, and ordinary activity extends the same visit', () => {
  const storage = openStorage({ localStorage: browserStorage() });
  assert.equal(claimVisit(storage, NOW), 'Hi!');
  assert.deepEqual(storage.read(VISITOR_KEY), knownVisitor(NOW));
  assert.equal(claimVisit(storage, NOW + 15_000), null);
  assert.equal(storage.read(VISITOR_KEY).lastGreetingAt, NOW);
  assert.equal(storage.read(VISITOR_KEY).lastActiveAt, NOW + 15_000);
  assert.equal(claimVisit(storage, NOW + VISIT_GAP_MS), null);
});

for (const [name, gap, expected] of [
  ['just before thirty minutes', 30 * 60 * 1000 - 1, null],
  ['at thirty minutes', 30 * 60 * 1000, 'Welcome back!'],
  ['after thirty minutes', 30 * 60 * 1000 + 1, 'Welcome back!'],
]) {
  test(`Bob classifies a return ${name}`, () => {
    assert.equal(VISIT_GAP_MS, 30 * 60 * 1000);
    const backend = browserStorage({ [VISITOR_KEY]: JSON.stringify(knownVisitor(NOW - gap)) });
    const storage = openStorage({ localStorage: backend });
    assert.equal(claimVisit(storage, NOW), expected);
    assert.equal(claimVisit(storage, NOW + 1000), null, 'The return greeting must not repeat on the next action.');
  });
}

test('Navigation and a recent second tab share the existing visit', () => {
  const backend = browserStorage();
  const firstPage = openStorage({ localStorage: backend });
  const secondTab = openStorage({ localStorage: backend });
  assert.equal(claimVisit(firstPage, NOW), 'Hi!');
  assert.equal(claimVisit(secondTab, NOW + 1), null);
  const nextPage = openStorage({ localStorage: backend });
  assert.equal(claimVisit(nextPage, NOW + 5000), null);
  assert.equal(firstPage.read(VISITOR_KEY).lastActiveAt, NOW + 5000);
  assert.equal(claimVisit(secondTab, NOW + 5000 + VISIT_GAP_MS), 'Welcome back!');
  assert.equal(claimVisit(firstPage, NOW + 5001 + VISIT_GAP_MS), null);
});

for (const [name, raw] of [
  ['invalid JSON', '{broken'],
  ['null', 'null'],
  ['a stale schema', JSON.stringify({ ...knownVisitor(NOW), version: 2 })],
  ['an unseen record', JSON.stringify({ ...knownVisitor(NOW), seen: false })],
  ['a nonnumeric timestamp', JSON.stringify({ ...knownVisitor(NOW), lastActiveAt: String(NOW) })],
  ['a timestamp too far in the future', JSON.stringify(knownVisitor(NOW + 60_001))],
  ['an absent timestamp', JSON.stringify({ version: 1, seen: true })],
]) {
  test(`Bob recovers from ${name} without repeating the greeting`, () => {
    const storage = openStorage({ localStorage: browserStorage({ [VISITOR_KEY]: raw }) });
    assert.equal(claimVisit(storage, NOW), 'Hi!');
    assert.equal(claimVisit(storage, NOW + 1000), null);
    assert.equal(storage.read(VISITOR_KEY).lastActiveAt, NOW + 1000);
  });
}

test('Blocked persistent storage falls back to session storage across navigation', () => {
  const session = browserStorage();
  const browserWindow = { get localStorage() { return deniedStorage(); }, sessionStorage: session };
  assert.equal(claimVisit(openStorage(browserWindow), NOW), 'Hi!');
  assert.equal(claimVisit(openStorage(browserWindow), NOW + 1000), null);
  assert.equal(claimVisit(openStorage(browserWindow), NOW + 1000 + VISIT_GAP_MS), 'Welcome back!');
});

test('When both storage APIs are unavailable, one page keeps a usable visit in memory', () => {
  const browserWindow = {
    get localStorage() { return deniedStorage(); },
    get sessionStorage() { return deniedStorage(); },
  };
  const storage = openStorage(browserWindow);
  assert.equal(claimVisit(storage, NOW), 'Hi!');
  assert.equal(claimVisit(storage, NOW + 1000), null);
  assert.equal(claimVisit(storage, NOW + 1000 + VISIT_GAP_MS), 'Welcome back!');
  assert.equal(claimVisit(storage, NOW + 1001 + VISIT_GAP_MS), null);
  // Without any browser storage, a new document cannot recognize that visit.
  assert.equal(claimVisit(openStorage(browserWindow), NOW + 2000 + VISIT_GAP_MS), 'Hi!');
});

test('A readable backend that fails writes after probing cannot repeat a return greeting', () => {
  const oldRecord = JSON.stringify(knownVisitor(NOW - VISIT_GAP_MS - 1));
  const backend = browserStorage({ [VISITOR_KEY]: oldRecord });
  const storage = openStorage({ localStorage: backend });
  backend.failWrites();

  assert.equal(claimVisit(storage, NOW), 'Welcome back!');
  assert.equal(backend.getItem(VISITOR_KEY), oldRecord, 'The stale value remains readable in the failed backend.');
  assert.equal(storage.read(VISITOR_KEY).lastActiveAt, NOW, 'The newer memory value must take precedence.');
  assert.equal(claimVisit(storage, NOW + 15_001), null);
  assert.equal(claimVisit(storage, NOW + 30_002), null);
});
