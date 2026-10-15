// Metadata retrieval only. Hard filters are applied before model selection.
import { FILLER, resolvePreferences } from './preferences.js';

const SYNONYMS = {
  ai: ['artificial', 'intelligence', 'automation'], artificial: ['ai', 'intelligence'],
  tech: ['technology', 'science', 'innovation'], technology: ['invention', 'science', 'innovation'],
  electricity: ['energy', 'power', 'grid', 'lightning'], energy: ['electricity', 'power', 'fuel'],
  climate: ['environment', 'warming', 'weather', 'carbon'], environment: ['climate', 'nature', 'conservation'],
  work: ['labor', 'job', 'employment', 'workplace'], job: ['work', 'labor', 'employment'],
  money: ['economics', 'finance', 'cost', 'wealth'], economy: ['economic', 'economics', 'finance', 'cost'],
  economics: ['economy', 'market', 'cost', 'price'], school: ['education', 'learning', 'student'],
  education: ['school', 'learning', 'student'], government: ['politics', 'policy', 'democracy', 'public'],
  politics: ['government', 'democracy', 'policy'], society: ['culture', 'community', 'social'],
  philosophy: ['ethics', 'meaning', 'reason', 'logic'], history: ['historical', 'past', 'century'],
  water: ['flood', 'flooding', 'river', 'drought', 'storm', 'resilience', 'scarcity'],
  ordinary: ['everyday', 'daily', 'small', 'simple'], everyday: ['ordinary', 'daily', 'common', 'object'],
  object: ['invention', 'invented', 'tool', 'technology'], book: ['literature', 'reading', 'author', 'library'],
  password: ['security', 'privacy', 'identity', 'digital'], lonely: ['loneliness', 'connection', 'community'],
};
const MOODS = {
  hopeful: ['hope', 'optimism', 'kindness', 'renewal', 'gratitude', 'possibility'],
  comforting: ['comfort', 'hope', 'kindness', 'gratitude', 'love', 'connection', 'friendship'],
  light: ['everyday', 'ordinary', 'humor', 'small', 'kindness', 'joy'],
  funny: ['humor', 'satire', 'comic', 'funny', 'laugh'],
  accessible: ['simple', 'everyday', 'ordinary', 'introduction'],
  thoughtful: ['meaning', 'life', 'reflection', 'choice', 'ethics'],
  challenging: ['analysis', 'complex', 'policy', 'science', 'economics'],
};
const EXCLUSIONS = {
  politics: ['politic', 'political', 'politics', 'government', 'election', 'president', 'congress', 'congressional', 'senate', 'senator', 'republican', 'democrat', 'trump', 'biden', 'partisan', 'voting'],
  religion: ['religion', 'religious', 'faith', 'christian', 'christ', 'jesus', 'prayer', 'god', 'church', 'biblical', 'bible', 'islam', 'muslim', 'buddhist'],
  ai: ['ai', 'artificial', 'automation'],
};

export function stem(word) {
  if (word.endsWith('ies') && word.length > 5) return word.slice(0, -3) + 'y';
  if (word.endsWith('s') && word.length > 4 && !/(ss|ics|ous)$/.test(word)) return word.slice(0, -1);
  return word;
}
export function tokens(text) { return (text.toLowerCase().match(/[a-z0-9]+/g) || []).map(stem); }
export function readingMinutes(item) { const n = item.readingTime; return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null; }
const collections = item => [...(item.collectionSlugs || []), ...(item.collectionTitles || [])];
export function itemWords(item) { return new Set(tokens([item.title, item.summary || '', item.type || '', ...(item.topics || []), ...(item.tags || []), ...collections(item)].join(' '))); }
const counter = words => { const result = new Map(); for (const word of words) result.set(word, (result.get(word) || 0) + 1); return result; };
const catalogIndexes = new WeakMap();
const characterCounts = word => {
  const counts = new Uint16Array(123);
  for (let i = 0; i < word.length; i++) counts[word.charCodeAt(i)]++;
  return counts;
};
function catalogIndex(catalog) {
  let cached = catalogIndexes.get(catalog);
  if (cached) return cached;
  // loadCatalog retains this immutable items array until its next refresh.
  // A new array builds a new index; WeakMap does not retain expired catalogs.
  const rows = catalog.map((item, index) => {
    const title = tokens(item.title), summary = tokens(item.summary || ''), type = tokens(item.type || '');
    const topics = tokens((item.topics || []).join(' ')), tags = tokens((item.tags || []).join(' ')), groups = tokens(collections(item).join(' '));
    return {
      item, index, words: new Set([...title, ...summary, ...type, ...topics, ...tags, ...groups]),
      title: counter(title), metadata: counter([...topics, ...tags, ...groups, ...type]), summary: counter(summary),
      anchorTerms: new Set([...title, ...summary, ...tags, ...topics, ...groups].filter(word => !FILLER.has(word) && word.length > 2)),
    };
  });
  const df = counter(rows.flatMap(row => [...row.words]));
  const vocabularyByLength = new Map();
  for (const word of df.keys()) {
    if (!vocabularyByLength.has(word.length)) vocabularyByLength.set(word.length, []);
    vocabularyByLength.get(word.length).push({ word, counts: characterCounts(word) });
  }
  cached = { rows, byId: new Map(rows.map(row => [row.item.id, row])), df, vocabularyByLength };
  catalogIndexes.set(catalog, cached);
  return cached;
}

function positionsOf(word) {
  const positions = new Map();
  for (let j = 0; j < word.length; j++) { if (!positions.has(word[j])) positions.set(word[j], []); positions.get(word[j]).push(j); }
  return positions;
}

// Matching-block ratio, equivalent to difflib.SequenceMatcher for these short
// ASCII words (no junk/autojunk). Tie-breaking matches get_close_matches.
export function similarity(a, b) {
  return matchingRatio(a, b, positionsOf(b));
}
function matchingRatio(a, b, positions) {
  if (!a.length && !b.length) return 1;
  const ranges = [[0, a.length, 0, b.length]];
  let previous = new Uint16Array(b.length + 1), current = new Uint16Array(b.length + 1);
  let matched = 0;
  while (ranges.length) {
    const [alo, ahi, blo, bhi] = ranges.pop();
    let bestI = alo, bestJ = blo, bestSize = 0;
    previous.fill(0);
    for (let i = alo; i < ahi; i++) {
      current.fill(0);
      for (const j of positions.get(a[i]) || []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const size = previous[j] + 1;
        current[j + 1] = size;
        if (size > bestSize) { bestI = i - size + 1; bestJ = j - size + 1; bestSize = size; }
      }
      [previous, current] = [current, previous];
    }
    if (!bestSize) continue;
    matched += bestSize;
    if (alo < bestI && blo < bestJ) ranges.push([alo, bestI, blo, bestJ]);
    if (bestI + bestSize < ahi && bestJ + bestSize < bhi) ranges.push([bestI + bestSize, ahi, bestJ + bestSize, bhi]);
  }
  return 2 * matched / (a.length + b.length);
}

export function matchesHardFilters(item, prefs, words = itemWords(item), excludedWords = exclusionWords(prefs)) {
  const minutes = readingMinutes(item);
  if (prefs.collectionId && !item.collectionSlugs?.includes(prefs.collectionId)) return false;
  if (prefs.formats.length && !prefs.formats.includes(item.type)) return false;
  if (prefs.minMinutes !== null && (minutes === null || minutes < prefs.minMinutes)) return false;
  if (prefs.maxMinutes !== null && (minutes === null || minutes > prefs.maxMinutes)) return false;
  for (const word of excludedWords) if (words.has(word)) return false;
  return true;
}
function exclusionWords(prefs) {
  const result = new Set();
  for (const excluded of prefs.excludedTopics) {
    const words = tokens(excluded);
    for (const word of words) result.add(word);
    for (const key of [excluded, ...words]) for (const word of EXCLUSIONS[key] || []) result.add(stem(word));
  }
  return result;
}

export function shortlist(catalog, request, limit = 40, collectionDirectory) {
  const [prefs, intent] = resolvePreferences(request, catalog, collectionDirectory);
  const constraints = { preferences: prefs, intent, refinement: intent.refinement, more: intent.action === 'more', minimumMinutes: prefs.minMinutes, maximumMinutes: prefs.maxMinutes, topic: prefs.topic };
  if (intent.clarification) return [[], constraints];
  const { rows, byId, df, vocabularyByLength } = catalogIndex(catalog);
  const anchor = byId.get(prefs.anchorId);
  const query = tokens(prefs.topic).filter(word => !FILLER.has(word) && !/^\d+$/.test(word));
  const corrections = new Map();
  const corrected = query.map(word => {
    if (df.has(word) || SYNONYMS[word] || word.length < 5) return word;
    if (corrections.has(word)) return corrections.get(word);
    const counts = characterCounts(word), codes = [...new Set([...word].map(char => char.charCodeAt(0)))];
    const positions = positionsOf(word);
    let closest = word, best = 0.84;
    for (const [length, candidates] of vocabularyByLength) {
      const total = length + word.length;
      if (2 * Math.min(length, word.length) / total < best) continue;
      for (const candidate of candidates) {
        let shared = 0;
        for (const code of codes) shared += Math.min(counts[code], candidate.counts[code]);
        // Both upper bounds are >= the matching-block ratio. Only strictly
        // lower values are skipped, preserving the cutoff and lexical ties.
        if (2 * shared / total < best) continue;
        // difflib compares candidate to query; preserve that asymmetric order.
        const score = matchingRatio(candidate.word, word, positions);
        if (score > best || (score === best && (closest === word || candidate.word > closest))) { best = score; closest = candidate.word; }
      }
    }
    corrections.set(word, closest);
    return closest;
  });
  const expanded = counter(corrected);
  for (const word of corrected) for (const related of SYNONYMS[word] || []) { const token = stem(related); expanded.set(token, (expanded.get(token) || 0) + 0.4); }
  if (anchor) {
    for (const word of anchor.anchorTerms) expanded.set(word, (expanded.get(word) || 0) + 0.6);
  }
  const moodTerms = new Set((MOODS[prefs.mood] || tokens(prefs.mood)).map(stem));
  const excludedWords = exclusionWords(prefs);
  const weightedTerms = [...expanded].map(([word, weight]) => [word, weight * (Math.log((catalog.length + 1) / ((df.get(word) || 0) + 1)) + 1)]);
  const excludedIds = new Set(prefs.anchorId && !intent.explanation ? [prefs.anchorId] : []);
  if (intent.action === 'more') for (const id of [...(request.seenIds || []), ...(request.currentIds || [])]) excludedIds.add(id);
  let ranked = [];
  for (const { index, item, words, title, metadata, summary } of rows) {
    if (excludedIds.has(item.id) || !matchesHardFilters(item, prefs, words, excludedWords)) continue;
    let score = 0;
    for (const [word, weight] of weightedTerms) score += weight * (Math.min(title.get(word) || 0, 2) * 5 + Math.min(metadata.get(word) || 0, 2) * 4 + Math.min(summary.get(word) || 0, 2));
    if (expanded.size && score === 0) continue;
    let moodScore = 0;
    for (const word of moodTerms) if (words.has(word)) moodScore += title.has(word) || metadata.has(word) ? 3 : 1;
    ranked.push([score + moodScore * 2, index, item]);
  }
  ranked.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  if (!expanded.size && !prefs.mood) {
    const groups = new Map();
    for (const row of ranked) { const key = row[2].type || 'essay'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
    ranked = [];
    while ([...groups.values()].some(rows => rows.length) && ranked.length < limit) for (const rows of groups.values()) if (rows.length) ranked.push(rows.shift());
  }
  return [ranked.slice(0, limit).map(row => row[2]), constraints];
}
