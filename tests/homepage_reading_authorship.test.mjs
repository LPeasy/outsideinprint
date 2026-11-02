import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { isBobAuthoredReadingWork } from "../scripts/ci/homepage_reading_authorship.mjs";

const bob = { "@id": "https://outsideinprint.org/#author-robert-v-ussley" };
const guest = { "@id": "https://outsideinprint.org/#author-other-writer" };

test("homepage output accepts Bob's ShortStory dialogues alongside articles", () => {
  for (const type of ["ShortStory", ["ShortStory", "CreativeWork"], "Article", "CreativeWork"]) {
    assert.equal(isBobAuthoredReadingWork([
      { "@type": "WebPage" }, { "@type": type, author: bob },
    ]), true, JSON.stringify(type));
  }
  assert.equal(isBobAuthoredReadingWork([{ "@type": "ShortStory", author: {
    "@id": "https://outsideinprint.org/#author-robert-v.-ussley",
  } }]), true);
});

test("recognizing dialogues preserves missing, guest and mixed-author exclusions", () => {
  for (const author of [undefined, [], guest, [bob, guest]]) {
    assert.equal(isBobAuthoredReadingWork([{ "@type": "ShortStory", author }]), false);
  }
  assert.equal(isBobAuthoredReadingWork([{ "@type": "WebPage", author: bob }]), false);
  assert.equal(isBobAuthoredReadingWork([]), false);
});

test("the independent PowerShell HTML validator recognizes dialogues with the same author exclusions", () => {
  const result = execFileSync(process.env.OIP_PWSH_BIN || "pwsh", ["-NoLogo", "-NoProfile", "-File",
    "tests/test_homepage_reading_authorship.ps1"], { encoding: "utf8" });
  assert.match(result, /PowerShell homepage reading authorship regression: PASS/);
});
