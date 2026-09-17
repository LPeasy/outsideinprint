import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const read = (file) => fs.readFileSync(file, "utf8");
const partial = read("layouts/partials/article/contents.html");
const hugo = process.env.OIP_HUGO_BIN || (fs.existsSync(".tools/hugo-0.164.0/hugo") ? path.resolve(".tools/hugo-0.164.0/hugo") : "hugo");

test("contents is native, initially closed, and uses the unchanged rendered article body", () => {
  assert.match(partial, /<details class="piece-contents">/);
  assert.match(partial, /<summary>In this article<\/summary>/);
  assert.match(partial, /<nav aria-label="Article sections">/);
  assert.doesNotMatch(partial, /<script|\bopen[ =>]|onclick|\.RawContent/);
  const single = read("layouts/_default/single.html");
  assert.match(single, /\$articleBody := partial "render_article_body.html" \./);
  assert.match(single, /partial "article\/contents.html" \(dict "page" \. "body" \$articleBody\)/);
  assert.match(single, /<div class="piece-body">\s*{{ \$articleBody }}/);
});

test("contents eligibility and heading selection run through pinned Hugo", {skip:!process.env.OIP_HUGO_BIN && !fs.existsSync(".tools/hugo-0.164.0/hugo")}, (t) => {
  assert.match(execFileSync(hugo, ["version"], {encoding:"utf8"}), /^hugo v0\.164\.0/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oip-contents-test-"));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive:true});
    fs.writeFileSync(path.join(root, file), value);
  };
  const recordTitles = ["References", "Sources checked", "Author’s Note", "Author's Note", "Notes", "Source ledger", "Footnotes", "Version note", "Series Note"];
  const body = '<h2 id="one">One &amp; <em>two</em></h2><h3 id="minor">Minor</h3><h2 id="second">Second</h2><h2 id="third">The field sources</h2>' + recordTitles.map((title,i)=>`<h2 id="record-${i}">${title}</h2>`).join("");
  const page = {IsPage:true, Section:"essays", ReadingTime:8, Params:{}};
  const fixtures = {
    long: {page, body},
    report: {page:{...page, Section:"reports"}, body},
    paper: {page:{...page, Section:"working-papers"}, body},
    legacy: {page, body:'<h3 id="a">First</h3><h4 id="aside">Aside</h4><h3 id="b">Second</h3><h3 id="c">Third</h3>'},
    short: {page:{...page, ReadingTime:7}, body},
    dialogue: {page:{...page, Params:{library_type:"dialogue"}}, body},
    fiction: {page:{...page, Params:{section_label:"Fiction"}}, body},
    musing: {page:{...page, Params:{library_type:"musing"}}, body},
    affirmation: {page:{...page, Params:{library_type:"affirmation"}}, body},
    sourcefree: {page:{...page, Params:{source_mode:"SOURCE_FREE"}}, body},
    optedout: {page:{...page, Params:{article_contents:false}}, body},
    shop: {page:{...page, Section:"shop"}, body},
    landing: {page:{...page, IsPage:false}, body},
    few: {page, body:'<h2 id="a">First</h2><h2 id="b">Second</h2>'},
    duplicates: {page, body:'<h2 id="a">First</h2><h2 id="a">Repeat</h2><h2 id="b">Second</h2>'},
    noanchors: {page, body:'<h2>First</h2><h2>Second</h2><h2>Third</h2>'},
  };
  write("hugo.toml", 'baseURL="https://example.test/"\ndisableKinds=["taxonomy","term","RSS","sitemap"]\n');
  write("data/cases.json", JSON.stringify(fixtures));
  write("layouts/partials/article/contents.html", partial);
  write("layouts/partials/article/variant-key.html", read("layouts/partials/article/variant-key.html"));
  write("layouts/index.html", '{{ range $key, $case := hugo.Data.cases }}<section data-case="{{ $key }}">{{ partial "article/contents.html" $case }}</section>{{ end }}');
  execFileSync(hugo, ["--source",root,"--panicOnWarning"], {encoding:"utf8"});
  const html = read(path.join(root,"public/index.html"));
  const cases = Object.fromEntries([...html.matchAll(/<section data-case="([^"]+)">([\s\S]*?)<\/section>/g)].map(m=>[m[1],m[2]]));
  for (const key of ["long","report","paper","legacy"]) assert.match(cases[key], /<details/, key);
  for (const key of Object.keys(fixtures).filter(key=>!["long","report","paper","legacy"].includes(key))) assert.doesNotMatch(cases[key], /<details/, key);
  assert.deepEqual([...cases.long.matchAll(/href="([^"]+)"/g)].map(m=>m[1]), ["#one","#second","#third"]);
  assert.match(cases.long, />One &amp; two<\/a>/);
  assert.doesNotMatch(cases.long, /<em>|#minor|#record-/);
  assert.deepEqual([...cases.legacy.matchAll(/href="([^"]+)"/g)].map(m=>m[1]), ["#a","#b","#c"]);
});

test("published contents menus target existing major headings, while short pieces and fiction stay unchanged", {skip:!process.env.OIP_SITE_DIR}, () => {
  const root = path.resolve(process.env.OIP_SITE_DIR);
  const page = (route) => read(path.join(root,route,"index.html"));
  for (const route of ["essays/the-dolphin-company"]) {
    const html = page(route);
    const contents = html.match(/<details class=(?:"piece-contents"|piece-contents)>([\s\S]*?)<\/details>/)?.[1];
    assert.ok(contents, route);
    const body = html.match(/<div class=(?:"piece-body"|piece-body)>([\s\S]*?)<div class=(?:"piece-aftermatter"|piece-aftermatter)>/)?.[1];
    assert.ok(body);
    const headings = [...body.matchAll(/<h([23])\b[^>]*\bid=(?:"([^"]+)"|([^\s>]+))[^>]*>/g)].map(m=>m[2]||m[3]);
    const anchors = [...contents.matchAll(/href=(?:"#([^"]+)"|#([^\s>]+))/g)].map(m=>m[1]||m[2]);
    assert.ok(anchors.length>=3);
    assert.equal(new Set(anchors).size,anchors.length);
    for (const anchor of anchors) assert.ok(headings.includes(anchor),`${route}#${anchor}`);
    assert.ok(html.indexOf(contents)<html.indexOf(body));
  }
  for (const route of ["essays/default-owner","essays/reverse-origami","essays/we-dont-miss","syd-and-oliver/what-i-had","shop/2045/sample","contribute"]) assert.doesNotMatch(page(route), /class=(?:"piece-contents"|piece-contents)/,route);
});
