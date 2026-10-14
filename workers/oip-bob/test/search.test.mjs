import test from 'node:test';
import assert from 'node:assert/strict';
import { shortlist, similarity } from '../src/search.js';
import { validateRequest } from '../src/recommender.js';
import { defaults } from '../src/preferences.js';

const piece = (id, title, summary = '') => ({ id: `/essays/${id}/`, title, summary, type: 'essay', readingTime: 4, topics: [], tags: [] });
const find = (catalog, topic) => shortlist(catalog, validateRequest({ message: 'More like these', action: 'more', preferences: { ...defaults(), topic } }))[0].map(item => item.id);

// The previous Map-based matching-block implementation serves as an independent
// oracle for the reusable-array implementation, including asymmetric ties.
function referenceRatio(a, b) {
  if (!a.length && !b.length) return 1;
  const positions = new Map();
  for (let j = 0; j < b.length; j++) { if (!positions.has(b[j])) positions.set(b[j], []); positions.get(b[j]).push(j); }
  const ranges = [[0, a.length, 0, b.length]];
  let matched = 0;
  while (ranges.length) {
    const [alo, ahi, blo, bhi] = ranges.pop();
    let bestI = alo, bestJ = blo, bestSize = 0, previous = new Map();
    for (let i = alo; i < ahi; i++) {
      const current = new Map();
      for (const j of positions.get(a[i]) || []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const size = (previous.get(j - 1) || 0) + 1;
        current.set(j, size);
        if (size > bestSize) { bestI = i - size + 1; bestJ = j - size + 1; bestSize = size; }
      }
      previous = current;
    }
    if (!bestSize) continue;
    matched += bestSize;
    if (alo < bestI && blo < bestJ) ranges.push([alo, bestI, blo, bestJ]);
    if (bestI + bestSize < ahi && bestJ + bestSize < bhi) ranges.push([bestI + bestSize, ahi, bestJ + bestSize, bhi]);
  }
  return 2 * matched / (a.length + b.length);
}

test('matching-block storage optimization preserves asymmetric and repeated-character matches', () => {
  const words = ['', 'a', 'b', 'c', 'tide', 'diet', 'aaaaabbbbb', 'abababbaba', 'a'.repeat(100)];
  let state = 41673;
  for (let n = 0; n < 100; n++) {
    let word = '';
    for (let i = 0; i < n % 16; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; word += 'abcd'[(state >>> 16) % 4]; }
    words.push(word);
  }
  for (const a of words) for (const b of words) assert.equal(similarity(a, b), referenceRatio(a, b), `${a}/${b}`);
});

test('length and character-count bounds preserve inclusive cutoff and lexical ties', () => {
  const exactCutoff = 'a'.repeat(21), query = exactCutoff + 'b'.repeat(8);
  assert.equal(referenceRatio(exactCutoff, query), 0.84);
  assert.deepEqual(find([piece('cutoff', exactCutoff)], query), ['/essays/cutoff/']);

  const vocabulary = ['abcdee', 'abcddf', 'abcded', 'abcdff', 'abbcde', 'abccde', 'abcdef', 'abbdef', 'abadef'];
  const catalog = vocabulary.map((word, i) => piece(`word-${i}`, word));
  for (const typo of ['abcdde', 'abcddg', 'abbcdd', 'abccdf', 'abcdfe', 'abcdefff', 'xyzxyz', 'abbadef']) {
    let closest = typo, best = 0.84;
    for (const candidate of vocabulary) {
      const score = referenceRatio(candidate, typo);
      if (score > best || (score === best && (closest === typo || candidate > closest))) { best = score; closest = candidate; }
    }
    assert.deepEqual(find(catalog, typo), vocabulary.includes(closest) ? [catalog[vocabulary.indexOf(closest)].id] : [], typo);
  }
});

test('memoized duplicate corrections retain query frequency and synonym weights', () => {
  const catalog = [piece('power', 'power power'), piece('electricity', 'electricity'), piece('water', 'water')];
  assert.deepEqual(find(catalog, 'electrcity electrcity water'), find(catalog, 'electricity electricity water'));
  assert.notDeepEqual(find(catalog, 'electrcity water'), find(catalog, 'electrcity electrcity water'));
  assert.deepEqual(find(catalog, 'electrcity electrcity water'), ['/essays/electricity/', '/essays/power/', '/essays/water/']);
});

test('immutable catalog indexes reuse metadata but a refreshed array rebuilds it', () => {
  let titleReads = 0, summaryReads = 0;
  const item = { ...piece('old', 'water'), get title() { titleReads++; return 'water'; }, get summary() { summaryReads++; return 'river'; } };
  const catalog = Object.freeze([Object.freeze(item)]);
  assert.deepEqual(find(catalog, 'water'), ['/essays/old/']);
  const reads = [titleReads, summaryReads];
  assert.deepEqual(find(catalog, 'river'), ['/essays/old/']);
  assert.deepEqual([titleReads, summaryReads], reads);
  const refreshed = Object.freeze([Object.freeze(piece('new', 'electricity'))]);
  assert.deepEqual(find(refreshed, 'water'), []);
  assert.deepEqual(find(refreshed, 'electricity'), ['/essays/new/']);
  assert.deepEqual(find(catalog, 'water'), ['/essays/old/']);
});
