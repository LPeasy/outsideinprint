const cache = new Map();
const canonical = value => {
  try {
    const url = new URL(value);
    return url.origin === 'https://outsideinprint.org' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
};
export function validateCatalog(value) {
  if (value?.version !== 1 || !/^[a-f0-9]{64}$/.test(value.catalogVersion ?? '')
      || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 5000
      || !Array.isArray(value.collections)) throw new Error('INVALID_CATALOG');
  const ids = new Set();
  for (const item of value.items) {
    if (!item || typeof item.id !== 'string' || !item.id.startsWith('/') || item.id.length > 500 || ids.has(item.id)
        || !canonical(item.url) || new URL(item.url).pathname !== item.id
        || typeof item.title !== 'string' || !item.title || item.title.length > 400
        || typeof item.summary !== 'string' || item.summary.length > 4000
        || !Number.isSafeInteger(item.readingTime) || item.readingTime < 0
        || !['essay', 'affirmation', 'dialogue', 'musing'].includes(item.type)
        || (item.image?.src && !canonical(item.image.src))) throw new Error('INVALID_CATALOG_ITEM');
    for (const key of ['tags', 'topics', 'collectionSlugs']) if (item[key] !== undefined &&
      (!Array.isArray(item[key]) || item[key].length > 100 || item[key].some(v => typeof v !== 'string' || v.length > 200))) throw new Error('INVALID_CATALOG_METADATA');
    ids.add(item.id);
  }
  for (const collection of value.collections) {
    if (!collection || !canonical(collection.url) || !Array.isArray(collection.itemIds)
        || collection.itemIds.some(id => !ids.has(id))) throw new Error('INVALID_COLLECTION');
  }
  return value;
}
export async function readBounded(request, maxBytes) {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) throw new Error('BODY_TOO_LARGE');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
export async function loadCatalog(env, fetchImpl = fetch, force = false) {
  const url = new URL(env.CATALOG_URL);
  const local = env.ENVIRONMENT === 'local' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!canonical(url.href) || url.pathname !== '/companion-bob/catalog.json') && !local) throw new Error('INVALID_CATALOG_URL');
  const cached = cache.get(url.href);
  if (!force && cached && cached.until > Date.now()) return cached.value;
  const response = await fetchImpl(url.href, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('CATALOG_UNAVAILABLE');
  const value = validateCatalog(JSON.parse(await readBounded(response, 3000000)));
  cache.set(url.href, { value, until: Date.now() + 300000 });
  return value;
}
export function clearCatalogCache() { cache.clear(); }
