import test from "node:test";
import assert from "node:assert/strict";
import { expectedShopFeed, catalogInstant } from "../scripts/ci/shop_feed_inventory.mjs";

function fixture(clock, change = () => {}) {
  const inventory = Array.from({ length: 5 }, (_, i) => ({ path: `content/shop/book-${i}/_index.md`, permalink: `https://outsideinprint.org/shop/book-${i}/` }));
  const products = Object.fromEntries(inventory.map((_, i) => [`book-${i}`, { metadata_title: `Book & ${i}`, release_date: "2026-11-01",
    direct_offers: [{ availability_status: "live", price_cents: 999, currency: "USD" }] }]));
  change({ inventory, products });
  return expectedShopFeed({ clock, inventory, catalog: { products }, readSource: source => {
    const i = Number(source.match(/book-(\d)/)[1]);
    return `---\ntitle: Book\nbook_key: book-${i}\npublishDate: "${i === 4 ? "2026-11-01T09:00:00-05:00" : "2026-11-01T00:00:00-04:00"}"\n---\n`;
  } });
}
test("a fifth scheduled book appears automatically at its approved Eastern instant", () => {
  assert.equal(fixture("2026-11-01T13:59:59Z", () => {}).length, 4);
  const entries = fixture("2026-11-01T14:00:00Z", () => {});
  assert.equal(entries.length, 5);
  assert.equal(entries[4].title, "Book & 4");
  assert.equal(entries[0].date, "2026-11-01T04:00:00.000Z");
  assert.equal(catalogInstant("2026-11-02"), Date.parse("2026-11-02T05:00:00Z"));
});
test("disabled offers, samples and duplicate canonical routes cannot leak into the feed", () => {
  assert.equal(fixture("2026-11-01T14:00:00Z", ({ products, inventory }) => {
    products["book-1"].direct_offers[0].availability_status = "coming_soon";
    products["book-2"].direct_offers[0].price_cents = "999";
    inventory[3].permalink += "sample/";
  }).length, 2);
  assert.throws(() => fixture("2026-11-01T14:00:00Z", ({ inventory }) => inventory.push(inventory[0])), /Duplicate/);
});
