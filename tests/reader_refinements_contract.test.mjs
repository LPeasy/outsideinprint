import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("gallery captions link to resolved published writing without changing the image viewer", () => {
  const gallery = read("layouts/gallery/list.html");
  const resolver = read("layouts/partials/editorial/linked-reading-page.html");
  const link = read("layouts/partials/editorial/gallery-reading-link.html");
  assert.equal(gallery.match(/partial "editorial\/gallery-reading-link.html" \$readingPage/g).length, 2);
  assert.equal(gallery.match(/partial "editorial\/linked-reading-page.html" \./g).length, 2);
  for (const guard of ["not .Draft", ".Date.Unix", ".PublishDate.Unix", ".ExpiryDate.IsZero", "$policy.indexable"]) assert.ok(resolver.includes(guard));
  assert.match(resolver, /where site.RegularPages "RelPermalink"/);
  assert.match(link, /href="{{ \.RelPermalink }}"/);
  assert.match(link, /Read &ldquo;{{ \.Title }}&rdquo;/);
  assert.match(gallery, /data-cartoon-lightbox-trigger/);
  assert.match(gallery, /window.location.href = activeEssay/);
});

test("author selection substitutes dialogue in place and preserves canonical routes", () => {
  const data = read("data/authors.yaml");
  const selected = data.split("featured_work:")[1].split("latest_limit:")[0];
  const routes = [...selected.matchAll(/- (\/\S+)/g)].map((match) => match[1]);
  assert.deepEqual(routes, [
    "/essays/what-is-risk-a-four-part-framework/",
    "/essays/the-world-is-back-at-the-poker-table/",
    "/essays/what-happened-at-camp-mystic/",
    "/syd-and-oliver/what-i-had/",
    "/essays/in-the-image-of-god/",
    "/essays/jack-stratton-and-the-vulfpeck-model/",
  ]);
  const author = read("layouts/authors/dossier.html");
  assert.match(author, /these pieces are a few places to begin/);
  assert.match(author, /where site.RegularPages "RelPermalink"/);
  assert.match(author, /not \(isset \$selectedPaths \$candidate.RelPermalink\)/);
});
