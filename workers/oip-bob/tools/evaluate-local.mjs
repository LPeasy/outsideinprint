// Explicit, bounded paid acceptance. Stops on the first failure; never retries.
import fs from 'node:fs';
import assert from 'node:assert/strict';
if (!process.argv.includes('--allow-live')) throw new Error('Pass --allow-live to authorize up to three live local recommendation requests.');
const catalog = await (await fetch('http://127.0.0.1:8769/companion-bob/catalog.json')).json();
const records = [];
const resumeIndex = process.argv.indexOf('--resume');
let previous = [];
if (resumeIndex >= 0) {
  const receipt = JSON.parse(fs.readFileSync(process.argv[resumeIndex + 1], 'utf8'));
  assert.equal(receipt.catalogVersion, catalog.catalogVersion, 'Cannot reuse checks from a different catalog.');
  previous = receipt.records;
}
const file = 'output/live-worker-review-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
const save = () => fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), catalogVersion: catalog.catalogVersion, catalogCount: catalog.count, model: 'gpt-6-luna', records }, null, 2));
async function call(name, body, allowEmpty = false) {
  const reused = previous.find(record => record.name === name);
  if (reused) {
    assert.equal(reused.status, 200); assert.deepEqual(reused.request, body);
    assert.ok(Array.isArray(reused.items) && reused.items.length <= 3 && (allowEmpty || reused.items.length > 0));
    assert.ok(reused.items.every(x => catalog.items.some(y => y.id === x.id && y.url === x.url)));
    records.push({ ...reused, reused: true }); save(); return reused;
  }
  const start = performance.now();
  const response = await fetch('http://127.0.0.1:8787/api/bob/recommend', { method: 'POST',
    headers: { origin: 'http://127.0.0.1:8769', 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, catalogVersion: catalog.catalogVersion }), signal: AbortSignal.timeout(25000) });
  const data = await response.json();
  records.push({ name, request: body, status: response.status, elapsedMs: Math.round(performance.now() - start), outcome: data.outcome, error: data.code,
    items: data.items?.map(({ id, title, url, readingTime, type }) => ({ id, title, url, readingTime, type })), preferences: data.preferences, usage: data.usage });
  save();
  assert.equal(response.status, 200, 'Live request failed; no automatic retry.');
  assert.ok(data.items.length <= 3 && (data.items.length > 0 || (allowEmpty && data.outcome === 'empty')));
  assert.equal(new Set(data.items.map(x => x.id)).size, data.items.length);
  assert.ok(data.items.every(x => catalog.items.some(y => y.id === x.id && y.url === x.url)));
  console.log(JSON.stringify({ scenario: name, milliseconds: records.at(-1).elapsedMs, count: data.items.length, tokens: data.usage }));
  return data;
}
try {
  const first = await call('water-under-five', { message: 'Water scarcity and flooding, no more than five minutes.', action: 'search', history: [], currentIds: [], seenIds: [] });
  assert.ok(first.items.every(x => x.readingTime <= 5));
  const anchor = first.items.length > 1 ? 1 : 0;
  const followup = await call('reference-and-memory', { message: `More like the ${anchor ? 'second' : 'first'} one.`, action: 'search',
    preferences: first.preferences, currentIds: first.items.map(x => x.id), seenIds: first.items.map(x => x.id),
    history: [{ role: 'user', content: 'Water scarcity and flooding, no more than five minutes.' },
      { role: 'assistant', content: first.items.map((x, i) => `${i + 1}. ${x.title}`).join('\n') }] }, true);
  assert.equal(followup.preferences.anchorId, first.items[anchor].id);
  assert.ok(followup.items.every(x => x.readingTime <= 5 && !first.items.some(y => y.id === x.id)));
  const dialogue = await call('dialogue-under-six', { message: 'A Syd and Oliver dialogue under six minutes.', action: 'search', history: [], currentIds: [], seenIds: [] });
  assert.ok(dialogue.items.every(x => x.type === 'dialogue' && x.readingTime <= 6));
  for (const record of records) record.passed = true;
  save(); console.log('Three acceptance cases covered (any reused results explicitly marked). Receipt: ' + file);
} catch (error) { save(); console.error(error.message); process.exitCode = 1; }
