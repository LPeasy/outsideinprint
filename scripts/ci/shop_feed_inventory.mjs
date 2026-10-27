import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";

function frontMatter(text) {
  const match = text.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw Error("Shop page needs YAML front matter.");
  return YAML.parse(match[1], { uniqueKeys: true });
}

// Date-only catalog values use Hugo's configured America/New_York zone.
export function catalogInstant(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(value);
  const utc = Date.parse(value + "T00:00:00Z");
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(new Date(utc)).find(part => part.type === "timeZoneName").value;
  const hours = Number(zone.replace("GMT", ""));
  return utc - hours * 3_600_000;
}

export function expectedShopFeed({ inventory, catalog, clock, readSource }) {
  const now = Date.parse(clock);
  if (!Number.isFinite(now)) throw Error("Invalid feed inventory clock.");
  const entries = [];
  for (const row of inventory) {
    const source = String(row.path ?? "").replaceAll("\\", "/");
    if (!source.startsWith("content/shop/")) continue;
    const page = frontMatter(readSource(source));
    const url = new URL(row.permalink);
    if (url.origin !== "https://outsideinprint.org") throw Error("Shop inventory must use the canonical host.");
    if (!page.book_key || page.draft || page.noindex || page.redirect_to ||
        String(page.layout ?? "").toLowerCase() === "sample" || url.pathname.endsWith("/sample/")) continue;
    // Published inventory owns canonical routes; this clock check also makes
    // independent fixed-clock fixtures reject early eligibility.
    const publishedAt = page.publishDate ?? page.date;
    if (publishedAt && catalogInstant(String(publishedAt)) > now) continue;
    const product = { ...catalog.defaults, ...catalog.products?.[page.book_key] };
    const live = product.direct_offers?.some(offer => String(offer.availability_status).trim().toLowerCase() === "live" &&
      typeof offer.price_cents === "number" && offer.price_cents > 0 && /^[A-Z]{3}$/.test(String(offer.currency).trim().toUpperCase()));
    if (!live || !product.release_date) continue;
    const date = catalogInstant(String(product.release_date));
    if (!Number.isFinite(date)) throw Error("Invalid shop catalog date: " + page.book_key);
    if (date > now) continue;
    entries.push({ link: url.href, title: String(product.metadata_title || page.metadata_title || product.title || page.title).trim(), date: new Date(date).toISOString() });
  }
  if (new Set(entries.map(entry => entry.link)).size !== entries.length) throw Error("Duplicate shop inventory route.");
  return entries.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.link.localeCompare(b.link));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, clock] = process.argv.slice(2);
  const root = process.cwd();
  const entries = expectedShopFeed({ inventory: JSON.parse(fs.readFileSync(file, "utf8")),
    catalog: YAML.parse(fs.readFileSync("data/bookstore.yaml", "utf8")), clock,
    readSource: source => {
      const resolved = path.resolve(root, source);
      if (!resolved.startsWith(root + path.sep)) throw Error("Inventory source escapes repository.");
      return fs.readFileSync(resolved, "utf8");
    } });
  console.log(JSON.stringify(entries));
}
