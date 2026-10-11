export const VISITOR_KEY = 'oip-bob-visitor:v1';
export const PREFERENCES_KEY = 'oip-bob-preferences:v1';
export const VISIT_GAP_MS = 30 * 60 * 1000;

// Only first-party presentation state. No reader identity or network requests.
export function createBobStorage() {
  const memory = new Map();
  let backend;
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const candidate = window[name];
      const probe = 'oip-bob-storage-probe';
      candidate.setItem(probe, '1');
      candidate.removeItem(probe);
      backend = candidate;
      break;
    } catch { /* Try per-tab storage, then in-memory display state. */ }
  }
  return {
    read(key) {
      try { return JSON.parse(backend?.getItem(key) ?? 'null') ?? memory.get(key) ?? null; }
      catch { return memory.get(key) ?? null; }
    },
    write(key, value) {
      memory.set(key, value);
      try { backend?.setItem(key, JSON.stringify(value)); }
      catch {
        // A readable but unwritable backend must not override our newer memory
        // value and repeatedly classify this same page as a returning visit.
        backend = undefined;
      }
    },
  };
}

export function validVisitor(value, now = Date.now()) {
  return value?.version === 1 && value.seen === true &&
    Number.isFinite(value.lastActiveAt) && value.lastActiveAt > 0 && value.lastActiveAt <= now + 60000;
}

export function claimVisit(storage, now = Date.now()) {
  const previous = storage.read(VISITOR_KEY);
  const known = validVisitor(previous, now);
  const greeting = !known ? 'Hi!' : now - previous.lastActiveAt >= VISIT_GAP_MS ? 'Welcome back!' : null;
  storage.write(VISITOR_KEY, {
    version: 1, seen: true, lastActiveAt: now,
    lastGreetingAt: greeting ? now : Number(previous.lastGreetingAt) || 0,
  });
  return greeting;
}
