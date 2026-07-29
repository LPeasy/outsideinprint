import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

test("affirmations require the exact The Things We Say content contract", () => {
  const kindPartial = read("layouts/partials/archive/longform-kind.html");

  assert.match(kindPartial, /partial "collections\/normalize-values\.html"/);
  assert.match(kindPartial, /\$sectionLabel := lower/);
  assert.match(kindPartial, /\$sourceMode := lower/);
  assert.match(kindPartial, /\$externalClaims := lower/);
  assert.match(kindPartial, /\(eq \$libraryType "affirmation"\)/);
  assert.match(kindPartial, /\(eq \$sectionLabel "affirmation"\)/);
  assert.match(kindPartial, /\(eq \$sourceMode "source_free"\)/);
  assert.match(kindPartial, /\(eq \$externalClaims "none"\)/);
  assert.match(kindPartial, /\(eq \(len \$collections\) 1\)/);
  assert.match(kindPartial, /\(index \$collections 0\) "the-things-we-say"/);
  assert.match(kindPartial, /\$kind = "affirmation"/);
  assert.match(kindPartial, /else if eq \$libraryType "affirmation"/);
  assert.match(kindPartial, /\$kind = ""/);

  const affirmationBranch = kindPartial.indexOf("else if $isAffirmation");
  const essayBranch = kindPartial.indexOf('else if eq $page.Section "essays"');
  assert.ok(affirmationBranch >= 0 && affirmationBranch < essayBranch);
});

test("affirmations are visible in the archive, library, and homepage", () => {
  const resolvePages = read("layouts/partials/archive/resolve-pages.html");
  const library = read("layouts/library/list.html");
  const homeSelected = read("layouts/partials/home_selected.html");
  const homeCopy = read("layouts/partials/home_front_page_copy.html");

  assert.match(resolvePages, /slice "essay" "dialogue" "affirmation"/);
  assert.match(resolvePages, /eq \$mode "affirmation"/);
  assert.match(resolvePages, /eq \$kind "affirmation"/);

  assert.match(library, /"key" "affirmation" "title" "Affirmations"/);
  assert.match(library, /Source-free reflections from The Things We Say, each built around one affirmation/);

  assert.match(homeSelected, /slice "essay" "affirmation" "dialogue"/);
  assert.match(homeCopy, /eq \$kind "affirmation"/);
  assert.match(homeCopy, /\$sectionLabel = "Affirmation"/);
  assert.match(homeCopy, /\$latestLabel = "Latest Affirmation"/);
  assert.match(homeCopy, /\$readLabel = "Read affirmation"/);
});
