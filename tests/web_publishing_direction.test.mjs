import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("deploy workflow is web-only and no longer builds PDFs", () => {
  const workflow = read(".github/workflows/deploy.yml");

  assert.match(workflow, /Build Hugo/);
  assert.match(workflow, /Remove public PDF artifacts/);
  assert.match(workflow, /Test Public HTML Output/);
  assert.doesNotMatch(workflow, /Build PDF Editions/);
  assert.doesNotMatch(workflow, /Verify PDF Pipeline/);
  assert.doesNotMatch(workflow, /Audit PDF Failures/);
  assert.doesNotMatch(workflow, /setup-typst/i);
  assert.doesNotMatch(workflow, /Install Pandoc/);
  assert.doesNotMatch(workflow, /scripts\/preflight\.ps1/);
  assert.doesNotMatch(workflow, /scripts\/build_pdfs_typst/i);
  assert.match(workflow, /rm -rf \.\/public\/pdfs/);
});

test("publishing docs treat the site as web-first and PDFs as paused", () => {
  const readme = read("README.md");
  const policy = read("PUBLISHING_POLICY.md");

  assert.match(readme, /PDF generation is paused/i);
  assert.doesNotMatch(readme, /build_pdfs_typst_local/i);
  assert.doesNotMatch(readme, /verify_pdf_pipeline/i);
  assert.doesNotMatch(readme, /durable web editions/i);
  assert.match(policy, /web-first publishing/i);
  assert.match(policy, /PDF workflow is paused/i);
  assert.doesNotMatch(policy, /web page \+ PDF/i);
  assert.doesNotMatch(policy, /static\/pdfs/i);
});

test("archetypes and public templates no longer depend on pdf front matter", () => {
  for (const relativePath of [
    "archetypes/default.md",
    "archetypes/essays.md",
    "archetypes/literature.md",
    "archetypes/reports.md",
    "archetypes/working-papers.md"
  ]) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /^pdf:/m, relativePath);
    assert.match(source, /First web edition/, relativePath);
    assert.doesNotMatch(source, /First digital edition/, relativePath);
  }

  assert.doesNotMatch(read("layouts/_default/single.html"), /pdf_button\.html/);
  assert.doesNotMatch(read("layouts/_default/single.html"), /data-pdf-render-root/);
  assert.doesNotMatch(read("layouts/_default/list.html"), /Params\.pdf|Read PDF|data-analytics-format="pdf"/);
  assert.doesNotMatch(read("layouts/collections/single.html"), /Params\.pdf|Read PDF|data-analytics-format="pdf"/);
  assert.doesNotMatch(read("layouts/library/list.html"), /Params\.pdf|Read PDF|data-analytics-format="pdf"/);
  assert.doesNotMatch(read("layouts/random/single.html"), /Params\.pdf/);
  assert.doesNotMatch(read("assets/js/analytics.js"), /pdf_download|isPdfLink|analyticsFormat|analyticsEngine|analyticsVariant|analyticsLengthBucket/);
  assert.equal(fs.existsSync(path.join(repoRoot, "layouts", "partials", "pdf_button.html")), false);
});
