import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const masthead = fs.readFileSync(path.resolve("layouts/partials/masthead.html"), "utf8");
const homepage = fs.readFileSync(path.resolve("layouts/index.html"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");

test("masthead removes books and shortens the Syd and Oliver label", () => {
  assert.match(masthead, />S and O</);
  assert.doesNotMatch(masthead, />Syd and Oliver</);
  assert.doesNotMatch(masthead, />Books</);
});

test("homepage no longer promotes the retired books section", () => {
  assert.doesNotMatch(homepage, /site-card--books/);
  assert.doesNotMatch(homepage, />Books</);
});

test("sticky editorial chrome pins only the compact section rail", () => {
  assert.match(css, /#main-content\{\s*scroll-margin-top:56px;\s*\}/);
  assert.match(css, /\.masthead--sticky \.nav--section-rail\{\s*position:sticky;\s*top:0;/);
  assert.doesNotMatch(css, /\.masthead--sticky\{\s*position:sticky;/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*#main-content\{\s*scroll-margin-top:0;\s*\}/);
  assert.match(css, /@media \(max-width:640px\)\{[\s\S]*\.masthead--sticky \.nav--section-rail\{\s*position:static;/);
});
