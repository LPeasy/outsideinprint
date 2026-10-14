// Explicit, bounded reading preferences. Conversation text cannot override the schema.
import { BobError } from './transport.js';

export const ACTIONS = new Set(['search', 'shorter', 'longer', 'more', 'relax_time', 'clear_filters']);
export const FORMATS = new Set(['essay', 'dialogue', 'affirmation']);
export function defaults() {
  return { version: 1, topic: '', mood: '', formats: [], minMinutes: null, maxMinutes: null, excludedTopics: [], discovery: false, anchorId: null };
}
const numberWords = Object.fromEntries('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty'.split(' ').map((word, i) => [word, i <= 20 ? i : (i - 18) * 10]));
const formatPatterns = {
  dialogue: /\b(?:dialogues?|dialogs?|syd\s+(?:(?:and|&)\s+)?oliver|conversations?)\b/g,
  affirmation: /\b(?:affirmations?|the things we say|mantras?)\b/g,
  essay: /\bessays?\b/g,
};
const moodPatterns = {
  hopeful: /\b(?:hopeful|uplifting|optimistic|encouraging)\b/g,
  comforting: /\b(?:comforting|comfort|soothing|gentle|reassuring|calming)\b/g,
  light: /\b(?:lighter|lighthearted|light hearted|light)\b/g,
  funny: /\b(?:funny|humorous|humour|humor|amusing)\b/g,
  accessible: /\b(?:less technical|not technical|easier to read|easy to read|accessible|simpler|simple|beginner friendly)\b/g,
  thoughtful: /\b(?:thoughtful|reflective|contemplative|musings?)\b/g,
  challenging: /\b(?:challenging|more technical|technical|in depth|deeper)\b/g,
};
const discoveryPattern = /\b(?:surprise me|anything|something interesting|help me choose|what should i read|browse|discover|pick for me|recommend something)\b/g;
export const FILLER = new Set('a an the i me my we us our you your want would like read reading about find something some please can could show tell give recommend recommendations recommendation suggest suggestions suggestion for to of in on with and or it that this those these them one ones another any more other options option pieces piece essay essays articles article content minutes minute min mins under less than at most up maximum longer shorter short long interested interest learn know only instead rather just make keep same topic subject those are too is but also not no nothing without avoid exclude all from second first third now how do have get help hello hi'.split(' '));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => new BobError(400, message, 'invalid_preferences', false);

export function validatePreferences(value) {
  const clean = defaults();
  if (!object(value) || Object.keys(value).sort().join('|') !== Object.keys(clean).sort().join('|') || value.version !== 1) {
    throw invalid('Please start a new reading subject.');
  }
  for (const [name, maximum] of [['topic', 300], ['mood', 80]]) {
    if (typeof value[name] !== 'string' || value[name].length > maximum) throw invalid('These reading preferences could not be read.');
    clean[name] = value[name].trim();
  }
  for (const [name, limit] of [['formats', 3], ['excludedTopics', 12]]) {
    const values = value[name];
    if (!Array.isArray(values) || values.length > limit || values.some(v => typeof v !== 'string' || !v.trim() || v.length > 80)) throw invalid('These reading filters could not be read.');
    if (name === 'formats' && values.some(v => !FORMATS.has(v))) throw invalid('That reading format is unavailable.');
    clean[name] = [...new Set(values.map(v => v.trim().toLowerCase()))];
  }
  for (const name of ['minMinutes', 'maxMinutes']) {
    const n = value[name];
    if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 240)) throw invalid('Please choose a reading time between 0 and 240 minutes.');
    clean[name] = n;
  }
  if (clean.minMinutes !== null && clean.maxMinutes !== null && clean.minMinutes > clean.maxMinutes) throw invalid('The minimum reading time exceeds the maximum.');
  if (typeof value.discovery !== 'boolean' || (value.anchorId !== null && (typeof value.anchorId !== 'string' || value.anchorId.length > 300))) throw invalid('These reading preferences could not be read.');
  clean.discovery = value.discovery;
  clean.anchorId = value.anchorId;
  return clean;
}

export function normalize(text) {
  return text.toLowerCase().replaceAll('’', "'").replace(/[–—]/g, '-')
    .replace(/\bhalf (?:an? )?hour\b/g, '30 minutes')
    .replace(/\ba quarter (?:of an? )?hour\b/g, '15 minutes')
    .replace(new RegExp(`\\b(${Object.keys(numberWords).join('|')})\\b`, 'g'), word => String(numberWords[word]))
    .replace(/\b(20|30|40|50|60)[ -]+([1-9])\b/g, (_, tens, units) => String(Number(tens) + Number(units)))
    .replace(/(\d)-(minutes?|mins?|hours?|hrs?)\b/g, '$1 $2');
}

export function duration(input) {
  let text = normalize(input), minimum = null, maximum = null;
  const unit = '(minutes?|mins?|hours?|hrs?)\\b';
  const number = '(\\d+(?:\\.\\d+)?)';
  const amount = (value, name) => Number(value) * (/^(hour|hr)/.test(name) ? 60 : 1);
  text = text.replace(new RegExp(`\\bbetween\\s+${number}\\s+and\\s+${number}\\s*${unit}`, 'g'), (_, low, high, units) => {
    minimum = amount(low, units); maximum = amount(high, units); return ' ';
  });
  const patterns = [
    ['max', false, '(?:no more than|not more than|no longer than|not longer than|not over|at most|up to|within|max(?:imum)?(?: of)?)\\s*'],
    ['min', false, '(?:no less than|not less than|no shorter than|not shorter than|not under|no fewer than|at least)\\s*'],
    ['max', true, '(?:under|less than|fewer than)\\s*'],
    ['min', true, '(?:over|more than)\\s*'],
  ];
  for (const [side, strict, prefix] of patterns) {
    text = text.replace(new RegExp(`\\b${prefix}${number}\\s*${unit}`, 'g'), (_, n, units) => {
      const value = amount(n, units) + (strict ? (side === 'min' ? 0.001 : -0.001) : 0);
      if (side === 'min') minimum = Math.max(minimum ?? 0, value);
      else maximum = Math.min(maximum ?? 240, Math.max(0, value));
      return ' ';
    });
  }
  const suffix = (_, n, units) => { maximum = Math.min(maximum ?? 240, amount(n, units)); return ' '; };
  text = text.replace(new RegExp(`${number}\\s*${unit}\\s*(?:or less|or fewer|maximum|max)\\b`, 'g'), suffix);
  text = text.replace(new RegExp(`(?:(?:i have|i only have|about|around|roughly|a|an)\\s+)?${number}\\s*${unit}(?:\\s+(?:read|reading))?`, 'g'), suffix);
  return { minimum, maximum, text };
}
export function timeBounds(text) { const { minimum, maximum } = duration(text); return [minimum, maximum]; }

export function parseIntent(message) {
  const original = normalize(message);
  let { minimum, maximum, text } = duration(original);
  let action = 'search';
  if (/\b(?:shorter|briefer|quicker|shortest|too long)\b/.test(text)) action = 'shorter';
  else if (/\b(?:longer|too short)\b/.test(text)) action = 'longer';
  else if (/\b(?:more like|more of these|more of those|another|others|different ones|what else|next|more)\b/.test(text)) action = 'more';
  const formats = [];
  for (const [name, pattern] of Object.entries(formatPatterns)) {
    if (text.search(pattern) >= 0) { formats.push(name); text = text.replace(pattern, ' '); }
  }
  let mood = '';
  for (const [name, pattern] of Object.entries(moodPatterns)) {
    if (text.search(pattern) >= 0) { mood ||= name; text = text.replace(pattern, ' '); }
  }
  const excluded = [], aliases = { political: 'politics', religious: 'religion', religion: 'religion', politics: 'politics' };
  text = text.replace(/\b(?:nothing|no|not|without|avoid|exclude)\s+(?:about\s+)?([^,.!?;]+?)(?=\s+but\b|\s+and\b|[,!?;.]|$)/g, (_, phrase) => {
    const words = (phrase.match(/[a-z]+/g) || []).filter(w => !FILLER.has(w)).join(' ');
    if (words) excluded.push(aliases[words] || words);
    return ' ';
  });
  const ordinalMatch = original.match(/\b(first|1st|second|2nd|third|3rd)\b/);
  const ordinal = ordinalMatch ? { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2 }[ordinalMatch[1]] : null;
  const explanation = /\b(?:why|explain|what is|what's|tell me about|summari[sz]e|summary of)\b/.test(original) && (ordinal !== null || /\b(?:that (?:one|1)|this (?:one|1)|this piece|that piece)\b/.test(original));
  text = text.replace(/\b(?:first|1st|second|2nd|third|3rd|why|explain)\b/g, ' ');
  const discovery = original.search(discoveryPattern) >= 0;
  if (discovery) text = text.replace(discoveryPattern, ' ');
  let topic = (text.match(/[a-z0-9]+/g) || []).filter(word => !FILLER.has(word) && !/^\d+$/.test(word)).join(' ');
  if (ordinal !== null || explanation) topic = '';
  if (topic) action = 'search';
  return { topic, mood, formats, excluded, minimum, maximum, action, refinement: !topic && !discovery, discovery, ordinal, explanation,
    invalidTime: /(?<!\w)(?:-\s*|minus\s+)\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b/.test(original) };
}
export function isRefinement(message) { return parseIntent(message).refinement; }

export function applyIntent(preferences, message, action, current, { legacy = false } = {}) {
  const old = validatePreferences(preferences);
  let prefs = { ...old, formats: [...old.formats], excludedTopics: [...old.excludedTopics] };
  const intent = parseIntent(message);
  let effective = action !== 'search' ? action : intent.action;
  if (action === 'search' && intent.topic) {
    if (legacy) prefs = defaults();
    Object.assign(prefs, { topic: intent.topic.slice(0, 300), discovery: false, anchorId: null });
  }
  if (intent.discovery) Object.assign(prefs, { topic: '', discovery: true, anchorId: null });
  if (intent.mood) prefs.mood = intent.mood;
  if (intent.formats.length) prefs.formats = intent.formats;
  prefs.excludedTopics = [...new Set([...prefs.excludedTopics, ...intent.excluded])].slice(0, 12);
  if (action === 'clear_filters') Object.assign(prefs, { mood: '', formats: [], minMinutes: null, maxMinutes: null, excludedTopics: [] });
  else if (action === 'relax_time') Object.assign(prefs, { minMinutes: null, maxMinutes: null });
  else {
    if (intent.minimum !== null) prefs.minMinutes = intent.minimum;
    if (intent.maximum !== null) prefs.maxMinutes = intent.maximum;
    const times = current.map(item => item.readingTime).filter(n => typeof n === 'number' && Number.isFinite(n) && n > 0);
    if (effective === 'shorter') {
      prefs.minMinutes = intent.minimum;
      if (times.length) prefs.maxMinutes = Math.min(prefs.maxMinutes ?? 240, Math.max(...times) - 0.001);
    } else if (effective === 'longer') {
      prefs.maxMinutes = intent.maximum;
      if (times.length) prefs.minMinutes = Math.max(prefs.minMinutes ?? 0, Math.min(...times) + 0.001);
    }
  }
  let clarification = '';
  if (intent.invalidTime) return [old, { ...intent, action: effective, clarification: 'Please use a positive reading time, such as five minutes.' }];
  if (intent.ordinal !== null) {
    if (intent.ordinal >= current.length) clarification = 'Which reading choice did you mean? Choose one of the titles currently shown.';
    else { prefs.anchorId = current[intent.ordinal].id; if (!intent.explanation) effective = 'more'; }
  } else if (intent.explanation && current.length) prefs.anchorId = current[0].id;
  if (prefs.minMinutes !== null && prefs.maxMinutes !== null && prefs.minMinutes > prefs.maxMinutes) {
    clarification = 'Those reading-time limits conflict. What is the longest piece you would like?'; prefs = old;
  }
  if ([prefs.minMinutes, prefs.maxMinutes].some(n => n !== null && n > 240)) {
    clarification = 'Please choose a reading time of 240 minutes or less.'; prefs = old;
  }
  if (!prefs.topic && !prefs.anchorId && (prefs.formats.length || prefs.mood || prefs.excludedTopics.length)) prefs.discovery = true;
  return [prefs, { ...intent, action: effective, clarification }];
}

export function resolvePreferences(request, catalog) {
  const byId = new Map(catalog.map(item => [item.id, item]));
  let prefs = request.preferences;
  if (prefs != null) {
    if (prefs.anchorId && !byId.has(prefs.anchorId)) throw invalid('That reading choice is no longer in the catalog. Start a new subject.');
  } else {
    prefs = defaults();
    let previous = [];
    for (const turn of request.history || []) {
      if (turn.role === 'user') [prefs] = applyIntent(prefs, turn.content, 'search', previous, { legacy: true });
      else previous = [...turn.content.matchAll(/\[([^\]\s]+)\]/g)].map(match => byId.get(match[1])).filter(Boolean);
    }
  }
  const current = (request.currentIds || []).map(id => byId.get(id)).filter(Boolean);
  return applyIntent(prefs, request.message, request.action || 'search', current, { legacy: request.preferences == null });
}
