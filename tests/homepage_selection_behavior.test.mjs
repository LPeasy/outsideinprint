import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const hugo = process.env.OIP_HUGO_BIN || (fs.existsSync(".tools/hugo-0.164.0/hugo")
  ? path.resolve(".tools/hugo-0.164.0/hugo") : "hugo");
const dolphin = "/essays/the-dolphin-company/";
const dialogue = "/syd-and-oliver/what-i-had/";
const owner = "/essays/default-owner/";
const origami = "/essays/reverse-origami/";

function renderSelection(t, overrides = {}) {
  assert.match(execFileSync(hugo, ["version"], { encoding: "utf8" }), /^hugo v0\.164\.0/);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "oip-home-selection-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    fs.writeFileSync(path.join(fixture, file), content);
  };
  write("hugo.toml", 'baseURL = "https://example.test/"\ndisableKinds = ["taxonomy", "term", "RSS", "sitemap"]\n');
  for (const partial of ["home_v2_selected.html", "archive/longform-kind.html", "collections/normalize-values.html"]) {
    write(`layouts/partials/${partial}`, fs.readFileSync(`layouts/partials/${partial}`, "utf8"));
  }
  write("layouts/index.html", '{{ $paths := slice }}{{ range partial "home_v2_selected.html" . }}{{ $paths = $paths | append .RelPermalink }}{{ end }}{{ $paths | jsonify | safeHTML }}');
  write("layouts/_default/single.html", "{{ .Title }}");
  write("layouts/_default/list.html", "{{ .Title }}");
  const entries = {
    dolphin: { title: "The Dolphin Company", url: dolphin, date: "2020-01-01", section_label: "Essay" },
    dialogue: { title: "What I Had", url: dialogue, date: "2020-01-01", library_type: "dialogue" },
    owner: { title: "Default Owner", url: owner, date: "2020-01-01", section_label: "Essay" },
    origami: { title: "Reverse Origami", url: origami, date: "2020-01-01", section_label: "Musing", library_type: "musing", collections: ["musings"], source_mode: "SOURCE_FREE", external_factual_claims: "none" },
    earlier: { title: "A earlier release", date: "2020-06-01", publishDate: "2020-06-01T09:00:00Z" },
    latest: { title: "Z later release", date: "2020-06-01", publishDate: "2020-06-01T12:00:00Z" },
    draft: { title: "Draft", date: "2020-07-01", draft: true },
    future: { title: "Future date", date: "2030-01-01", publishDate: "2020-07-01" },
    queued: { title: "Future release", date: "2020-07-01", publishDate: "2030-01-01" },
    expired: { title: "Expired", date: "2020-07-01", expiryDate: "2020-08-01" },
    malformed: { title: "Invalid affirmation", date: "2020-07-01", library_type: "affirmation" },
    ...overrides,
  };
  for (const [slug, metadata] of Object.entries(entries)) {
    if (metadata === null) continue;
    const frontMatter = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
    write(`content/essays/${slug}.md`, `---\n${frontMatter}\n---\nFixture.\n`);
  }
  write("content/essays/_index.md", '---\ntitle: "Landing"\ndate: 2020-08-01\n---\n');
  write("content/shop/book.md", '---\ntitle: "Book"\ndate: 2020-08-01\n---\n');
  execFileSync(hugo, ["--source", fixture, "--clock", "2020-09-01T12:00:00Z", "--buildDrafts", "--buildFuture", "--buildExpired", "--panicOnWarning"], { encoding: "utf8" });
  return JSON.parse(fs.readFileSync(path.join(fixture, "public/index.html"), "utf8"));
}

test("latest lead uses actual release time and excludes non-public work even with preview flags", (t) => {
  assert.deepEqual(renderSelection(t), ["/essays/latest/", dolphin, dialogue, owner, origami]);
});

test("a pinned latest lead stays unique and missing supporting work receives newest eligible fallback", (t) => {
  const selection = renderSelection(t, {
    dolphin: { title: "The Dolphin Company", url: dolphin, date: "2020-06-01", publishDate: "2020-07-01" },
    dialogue: null,
  });
  assert.deepEqual(selection, [dolphin, owner, origami, "/essays/latest/", "/essays/earlier/"]);
  assert.equal(new Set(selection).size, 5);
});
