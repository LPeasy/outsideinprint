import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync("content/contribute/index.md", "utf8");
const shortcode = fs.readFileSync("layouts/shortcodes/contributor-pitch.html", "utf8");
const subject = "Contributor pitch for Outside In Print";
const prompts = [
  "Working title:",
  "Question or argument (two or three sentences):",
  "Draft or brief outline:",
  "Short bio and why you want to write it:",
];
const body = prompts.join("\r\n\r\n") + "\r\n";
const explanation = "Opens a draft in your email app with these four prompts. Nothing is sent automatically.";

test("contributor action preserves the four existing requirements, editorial policy, and visible email fallback", () => {
  for (const copy of [
    "## What Fits", "## Start With a Pitch",
    "- the working title;",
    "- the question or argument in two or three sentences;",
    "- a draft or a brief outline; and",
    "- a short note about who you are and why you want to write it.",
    "We are not looking for sponsored posts, search-engine filler, press releases, or partisan talking points.",
    "Every accepted piece is edited for clarity, sourcing, and fit with the imprint. Sending a pitch does not guarantee publication.",
    "Email [support@outsideinprint.org](mailto:support@outsideinprint.org?subject=Contributor%20pitch%20for%20Outside%20In%20Print)",
  ]) assert.ok(page.includes(copy), copy);
  assert.equal((page.match(/\{\{< contributor-pitch >\}\}/g) || []).length, 1);
  assert.ok(page.indexOf("{{< contributor-pitch >}}") > page.indexOf("- a short note"));
  assert.ok(page.indexOf("{{< contributor-pitch >}}") < page.indexOf("Email [support@outsideinprint.org]"));
});

test("pitch enhancement uses one encoded native mailto link and never submits information", () => {
  assert.ok(shortcode.includes(`$subject := "${subject}"`));
  for (const prompt of prompts) assert.ok(shortcode.includes(prompt));
  assert.ok(shortcode.includes('replace (urlquery $subject) "+" "%20"'));
  assert.ok(shortcode.includes('replace (urlquery $body) "+" "%20"'));
  assert.ok(shortcode.includes('printf "mailto:support@outsideinprint.org?subject=%s&body=%s"'));
  assert.match(shortcode, /href="\{\{ \$mailto \| safeURL \}\}" aria-describedby="contributor-pitch-help">Draft your pitch<\/a>/);
  assert.match(shortcode, /id="contributor-pitch-help"/);
  assert.ok(shortcode.includes(explanation));
  assert.equal((shortcode.match(/<a\b/g) || []).length, 1);
  assert.doesNotMatch(shortcode, /<script|<form|<input|<button|role="button"|onclick|data-analytics|fetch\(/i);
});

const siteDir = process.env.OIP_SITE_DIR;
const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").replace(/&amp;/g, "&");
};

test("rendered contributor pitch has exact subject, CRLF prompts, and a working no-JavaScript fallback", { skip: !siteDir }, () => {
  const html = fs.readFileSync(path.join(siteDir, "contribute/index.html"), "utf8");
  const matches = [...html.matchAll(/(<a\b[^>]*>)\s*Draft your pitch\s*<\/a>/g)];
  assert.equal(matches.length, 1);
  const tag = matches[0][1];
  assert.equal(attr(tag, "class"), "contributor-pitch__button");
  assert.equal(attr(tag, "aria-describedby"), "contributor-pitch-help");
  const href = attr(tag, "href");
  assert.doesNotMatch(href, /\+|\s|#ZgotmplZ/);
  assert.match(href, /%0D%0A%0D%0A/);
  assert.ok(href.includes("subject=Contributor%20pitch%20for%20Outside%20In%20Print"));
  const mailto = new URL(href);
  assert.equal(mailto.protocol, "mailto:");
  assert.equal(mailto.pathname, "support@outsideinprint.org");
  assert.deepEqual([...mailto.searchParams.keys()], ["subject", "body"]);
  assert.equal(mailto.searchParams.get("subject"), subject);
  assert.equal(mailto.searchParams.get("body"), body);
  assert.equal((html.match(/id=(?:"contributor-pitch-help"|contributor-pitch-help)(?=[\s>])/g) || []).length, 1);
  assert.ok(html.includes(explanation));
  const emailFallback = [...html.matchAll(/(<a\b[^>]*>)\s*support@outsideinprint\.org\s*<\/a>/g)].find((match) => {
    const fallback = attr(match[1], "href");
    return fallback === "mailto:support@outsideinprint.org?subject=Contributor%20pitch%20for%20Outside%20In%20Print";
  });
  assert.ok(emailFallback, "keep the visible email and existing subject-only fallback");
  const module = html.match(/<div\b[^>]*class=(?:"contributor-pitch"|contributor-pitch)[\s\S]*?<\/div>/)?.[0];
  assert.ok(module);
  assert.doesNotMatch(module, /<script|<form|<input|\bhidden\b|onclick|data-analytics/i);
});
