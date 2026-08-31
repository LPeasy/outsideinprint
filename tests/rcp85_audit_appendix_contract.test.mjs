import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const appendixPath = path.resolve("content/working-papers/rcp85-bibliometrics-methods-and-tables.md");
const essayPath = path.resolve("content/essays/the-scenario-that-ate-the-future.md");
const dataDirectory = path.resolve("static/data/rcp85-bibliometrics");

const appendix = fs.readFileSync(appendixPath, "utf8");
const essay = fs.readFileSync(essayPath, "utf8");

const retainedFiles = [
  "checksums.sha256",
  "framing-classifications.csv",
  "framing-summary.csv",
  "query-log.csv"
];

test("RCP8.5 audit appendix remains direct-only and noindex", () => {
  assert.match(appendix, /^section_label: "Audit Appendix"$/m);
  assert.match(appendix, /^noindex: true$/m);
  assert.match(appendix, /^build:\s*\r?\n\s+list: never$/m);
  assert.match(appendix, /Its purpose is to explain why the provisional results are not used as evidence in the essay\./);
  assert.match(appendix, /It is not proof of the essay's thesis\./);
});

test("RCP8.5 public data package stays compact", () => {
  assert.deepEqual(fs.readdirSync(dataDirectory).sort(), retainedFiles);
  assert.doesNotMatch(appendix, /deduped-records\.csv|duplicate-map\.csv/);
  assert.match(appendix, /The full search and deduplication records[\s\S]*available on request/);
  assert.match(appendix, /^## Compact audit downloads$/m);

  const checksumLines = fs.readFileSync(path.join(dataDirectory, "checksums.sha256"), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/);
      assert.ok(match, `Invalid checksum line: ${line}`);
      return { digest: match[1], filename: match[2] };
    });

  assert.deepEqual(
    checksumLines.map(({ filename }) => filename).sort(),
    retainedFiles.filter((filename) => filename !== "checksums.sha256").sort()
  );

  for (const { digest, filename } of checksumLines) {
    const actual = crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(dataDirectory, filename)))
      .digest("hex");
    assert.equal(actual, digest, `${filename} checksum must match checksums.sha256`);
  }
});

test("Scenario essay describes the compact appendix honestly", () => {
  assert.match(essay, /companion audit appendix records the method and limitations/);
  assert.match(essay, /retains the full search and deduplication records and makes them available on request/);
  assert.match(essay, /#compact-audit-downloads/);
  assert.doesNotMatch(essay, /search and deduplication records are public/);
});
