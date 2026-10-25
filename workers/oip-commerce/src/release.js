import { HttpError } from "./http.js";

const CANONICAL_ORIGIN = "https://outsideinprint.org";
const MAX_PAGE_BYTES = 512 * 1024;
const RELEASE_CHECK_TIMEOUT_MS = 5000;

function unavailable() {
  return new HttpError(503, "EPUB_RELEASE_NOT_READY", "This e-book is not available yet. Please try again later.");
}

function htmlText(value) {
  return value.replace(/<[^>]*>/gu, "").replace(/&#(x[0-9a-f]+|[0-9]+);/giu, (_, code) => {
    const number = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
  }).replace(/&(amp|quot|apos|nbsp|rsquo|lsquo|ndash|mdash);/gu, (_, name) => ({
    amp: "&", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—",
  })[name]).replace(/\s+/gu, " ").trim();
}

function attribute(tag, name) {
  const match = new RegExp(`(?:\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "iu").exec(tag);
  return match ? htmlText(match[1] ?? match[2] ?? match[3]) : "";
}

async function readBoundedHtml(response) {
  if (Number(response.headers.get("content-length")) > MAX_PAGE_BYTES || !response.body) throw unavailable();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return html + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > MAX_PAGE_BYTES) throw unavailable();
      html += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

async function verifyPublication(publication, fetcher, signal) {
  const url = new URL(publication.url);
  if (url.origin !== CANONICAL_ORIGIN || url.username || url.password || url.search || url.hash ||
      !url.pathname.endsWith("/") || !publication.title) throw unavailable();
  const response = await fetcher(url.href, {
    method: "GET",
    redirect: "manual",
    headers: { accept: "text/html", "cache-control": "no-cache" },
    signal,
  });
  if (response.status !== 200 || response.redirected ||
      (response.url && response.url !== url.href) ||
      !/^text\/html(?:;|$)/iu.test(response.headers.get("content-type") || "")) throw unavailable();
  const html = await readBoundedHtml(response);
  const canonicals = [...html.matchAll(/<link\b[^>]*>/giu)]
    .map(([tag]) => tag)
    .filter((tag) => attribute(tag, "rel").toLowerCase().split(/\s+/u).includes("canonical"));
  const titles = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu)].map((match) => htmlText(match[1]));
  const expected = htmlText(publication.title);
  if (canonicals.length !== 1 || attribute(canonicals[0], "href") !== url.href ||
      !titles.some((title) => title === expected || title.startsWith(`${expected}: `))) throw unavailable();
}

// Only server-owned catalog products reach this gate. Request data never supplies URLs.
// Recheck each checkout intent, including cached-link retrieval; do not cache a release proof.
export async function requireEpubRelease(product, {
  nowSeconds = Math.floor(Date.now() / 1000),
  fetcher = globalThis.fetch,
  timeoutMs = RELEASE_CHECK_TIMEOUT_MS,
} = {}) {
  if (!Object.hasOwn(product, "releaseNotBefore") && !Object.hasOwn(product, "requiredPublications")) return;
  const releaseMs = Date.parse(product.releaseNotBefore);
  const publications = product.requiredPublications;
  if (!Number.isFinite(releaseMs) || !Number.isSafeInteger(nowSeconds) || nowSeconds * 1000 < releaseMs) {
    throw unavailable();
  }
  if (!Array.isArray(publications) || publications.length < 1 || publications.length > 3) throw unavailable();

  const controller = new AbortController();
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs);
    });
    await Promise.race([
      Promise.all(publications.map((publication) => verifyPublication(publication, fetcher, controller.signal))),
      deadline,
    ]);
  } catch {
    throw unavailable();
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
