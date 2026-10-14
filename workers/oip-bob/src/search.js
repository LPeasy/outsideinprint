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

// Matching-block ratio, equivalent to difflib.SequenceMatcher for these short
// ASCII words (no junk/autojunk). Tie-breaking matches get_close_matches.
export function similarity(a, b) {
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

export function matchesHardFilters(item, prefs) {
  const minutes = readingMinutes(item);
  if (prefs.formats.length && !prefs.formats.includes(item.type)) return false;
  if (prefs.minMinutes !== null && (minutes === null || minutes < prefs.minMinutes)) return false;
  if (prefs.maxMinutes !== null && (minutes === null || minutes > prefs.maxMinutes)) return false;
  const words = itemWords(item);
  for (const excluded of prefs.excludedTopics) {
    const excludedWords = new Set(tokens(excluded));
    for (const key of [excluded, ...tokens(excluded)]) for (const word of EXCLUSIONS[key] || []) excludedWords.add(stem(word));
    if ([...excludedWords].some(word => words.has(word))) return false;
  }
  return true;
}

export function shortlist(catalog, request, limit = 40) {
  const [prefs, intent] = resolvePreferences(request, catalog);
  const constraints = { preferences: prefs, intent, refinement: intent.refinement, more: intent.action === 'more', minimumMinutes: prefs.minMinutes, maximumMinutes: prefs.maxMinutes, topic: prefs.topic };
  if (intent.clarification) return [[], constraints];
  const byId = new Map(catalog.map(item => [item.id, item]));
  const anchor = byId.get(prefs.anchorId);
  const documents = new Map(catalog.map(item => [item.id, itemWords(item)]));
  const vocabulary = new Set([...documents.values()].flatMap(words => [...words]));
  const query = tokens(prefs.topic).filter(word => !FILLER.has(word) && !/^\d+$/.test(word));
  const corrected = query.map(word => {
    if (vocabulary.has(word) || SYNONYMS[word] || word.length < 5) return word;
    let closest = word, best = 0.84;
    for (const candidate of vocabulary) {
      // difflib compares candidate to query, which matters for matching-block ties.
      const score = similarity(candidate, word);
      if (score > best || (score === best && (closest === word || candidate > closest))) { best = score; closest = candidate; }
    }
    return closest;
  });
  const expanded = counter(corrected);
  for (const word of corrected) for (const related of SYNONYMS[word] || []) { const token = stem(related); expanded.set(token, (expanded.get(token) || 0) + 0.4); }
  if (anchor) {
    const anchorTerms = new Set(tokens([anchor.title, anchor.summary || '', ...(anchor.tags || []), ...(anchor.topics || []), ...collections(anchor)].join(' ')).filter(word => !FILLER.has(word) && word.length > 2));
    for (const word of anchorTerms) expanded.set(word, (expanded.get(word) || 0) + 0.6);
  }
  const moodTerms = new Set((MOODS[prefs.mood] || tokens(prefs.mood)).map(stem));
  const df = counter([...documents.values()].flatMap(words => [...words]));
  const excludedIds = intent.action === 'more' ? new Set([...(request.seenIds || []), ...(request.currentIds || []), ...(prefs.anchorId ? [prefs.anchorId] : [])]) : new Set();
  let ranked = [];
  for (const [index, item] of catalog.entries()) {
    if (excludedIds.has(item.id) || !matchesHardFilters(item, prefs)) continue;
    const title = counter(tokens(item.title));
    const metadata = counter(tokens([...(item.topics || []), ...(item.tags || []), ...collections(item), item.type || ''].join(' ')));
    const summary = counter(tokens(item.summary || ''));
    let score = 0;
    for (const [word, weight] of expanded) score += weight * (Math.log((catalog.length + 1) / ((df.get(word) || 0) + 1)) + 1) * (Math.min(title.get(word) || 0, 2) * 5 + Math.min(metadata.get(word) || 0, 2) * 4 + Math.min(summary.get(word) || 0, 2));
    if (expanded.size && score === 0) continue;
    let moodScore = 0;
    for (const word of moodTerms) if (documents.get(item.id).has(word)) moodScore += title.has(word) || metadata.has(word) ? 3 : 1;
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
