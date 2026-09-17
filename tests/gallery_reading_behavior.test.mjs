import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const hugo = process.env.OIP_HUGO_BIN || path.resolve(".tools/hugo-0.164.0/hugo");

test("gallery resolves canonical dialogue URLs and omits unavailable associations even in previews", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oip-gallery-links-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  write("hugo.toml", 'baseURL = "https://example.test/"\ndisableKinds = ["taxonomy", "term", "RSS", "sitemap"]\n');
  for (const partial of ["editorial/linked-reading-page.html", "editorial/gallery-reading-link.html", "metadata/policy.html", "metadata/route.html", "collections/lookup-definition.html"]) {
    write(`layouts/partials/${partial}`, fs.readFileSync(`layouts/partials/${partial}`, "utf8"));
  }
  write("layouts/index.html", '{{ range hugo.Data.links }}{{ partial "editorial/gallery-reading-link.html" (partial "editorial/linked-reading-page.html" .) }}{{ end }}');
  write("layouts/_default/single.html", "{{ .Title }}");
  write("layouts/_default/list.html", "{{ .Title }}");
  const entries = {
    dialogue: { title: "The Story & Its Question", url: "/syd-and-oliver/the-story/", date: "2020-01-01" },
    draft: { title: "Draft", date: "2020-01-01", draft: true },
    future: { title: "Future", date: "2030-01-01", publishDate: "2020-01-01" },
    queued: { title: "Queued", date: "2020-01-01", publishDate: "2030-01-01" },
    expired: { title: "Expired", date: "2020-01-01", expiryDate: "2020-03-01" },
    noindex: { title: "Private", date: "2020-01-01", noindex: true },
  };
  for (const [slug, fields] of Object.entries(entries)) {
    write(`content/essays/${slug}.md`, `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\nFixture.\n`);
  }
  write("data/links.json", JSON.stringify([
    { title: "Different illustration title", essay: "/syd-and-oliver/the-story/" },
    ...["draft", "future", "queued", "expired", "noindex", "missing"].map((slug) => ({ essay: `/essays/${slug}/` })),
    {},
  ]));
  execFileSync(hugo, ["--source", root, "--clock", "2020-09-01T12:00:00Z", "--buildDrafts", "--buildFuture", "--buildExpired", "--panicOnWarning"], { encoding: "utf8" });
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.match(html, /href="\/syd-and-oliver\/the-story\/"/);
  assert.match(html, /The Story &amp; Its Question/);
  assert.doesNotMatch(html, /Different illustration|Draft|Future|Queued|Expired|Private/);
});
