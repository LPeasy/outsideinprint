import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "deploy.yml");
const readmePath = path.join(repoRoot, "README.md");
const cssPath = path.join(repoRoot, "assets", "css", "main.css");

function commandWorks(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error && result.status === 0;
}

function makeFixtureRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFixtureContent(contentDir, slug, engine) {
  const essaysDir = path.join(contentDir, "essays");
  fs.mkdirSync(essaysDir, { recursive: true });
  fs.writeFileSync(
    path.join(essaysDir, `${slug}.md`),
    `---
title: "Rendered HTML Smoke"
date: 2026-03-15
draft: false
slug: "${slug}"
section_label: "Essay"
subtitle: "Print the actual Hugo page"
version: "1.0"
edition: "Fixture edition"
pdf: "/pdfs/${slug}.pdf"
pdf_engine: ${engine}
pdf_summary: "Fixture for browser-print integration."
---

This fixture exercises the rendered-page PDF flow.

![](/favicon.svg)

## Layout Notes

| Part | Expectation |
| --- | --- |
| masthead | hidden in print |
| imprint | visible in print |

\`\`\`
const rendered = true;
\`\`\`

> The edition metadata should remain readable.
`,
    "utf8"
  );
}

test("deploy workflow installs Node and Playwright before the PDF build", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /npm install/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /Build PDF Editions/);
});

test("deploy workflow treats the PDF audit as a blocking gate", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /- name: Audit PDF Failures/);
  assert.doesNotMatch(workflow, /- name: Audit PDF Failures[\s\S]*?continue-on-error:\s*true/);
  assert.match(workflow, /scripts\/audit_pdf_failures\.ps1/);
  assert.match(workflow, /PDF audit status:/);
});

test("README documents the browser-print workflow for html PDFs", () => {
  const readme = fs.readFileSync(readmePath, "utf8");

  assert.match(readme, /Playwright/i);
  assert.match(readme, /npx playwright install chromium/i);
  assert.match(readme, /pdf_engine: typst \| html/);
});

test("renderer script supports a bare --probe flag without consuming the next argument", async () => {
  const renderer = await import("../scripts/render_hugo_pdfs.mjs");
  const parsed = renderer.parseArgs(["--probe", "--manifest", "fixture.json"]);

  assert.equal(parsed.probe, true);
  assert.equal(parsed.manifest, "fixture.json");
});

test("print CSS hides site chrome while leaving edition metadata visible", () => {
  const css = fs.readFileSync(cssPath, "utf8");

  assert.match(css, /@media print/);
  assert.match(css, /\.site-header,/);
  assert.match(css, /\.site-footer,/);
  assert.match(css, /\.running-header,\s*[\r\n ]*\.imprint-header,\s*[\r\n ]*\.citation/);
});

test("html-engine PDFs are rendered from the built Hugo page and print chrome is suppressed", async (t) => {
  if (!commandWorks("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"])) {
    t.skip("pwsh is required for the PDF builder integration test.");
  }
  if (!commandWorks("hugo", ["version"])) {
    t.skip("hugo is required for the PDF builder integration test.");
  }

  let playwright;
  let renderer;
  try {
    playwright = await import("playwright");
    renderer = await import("../scripts/render_hugo_pdfs.mjs");
  } catch {
    t.skip("playwright must be installed to run the browser PDF integration test.");
  }

  const fixtureRoot = makeFixtureRoot("oip-pdf-html-");
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const contentDir = path.join(fixtureRoot, "content");
  const pdfRoot = path.join(fixtureRoot, "static", "pdfs");
  const tempDir = path.join(fixtureRoot, "resources", "typst_build");
  const catalogPath = path.join(fixtureRoot, "data", "pdfs", "catalog.json");
  const slug = "rendered-html-smoke";
  writeFixtureContent(contentDir, slug, "html");

  fs.mkdirSync(pdfRoot, { recursive: true });
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });

  const build = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      path.join(repoRoot, "scripts", "build_pdfs_typst_shared.ps1"),
      "-Mode",
      "Test",
      "-ContentRoot",
      contentDir,
      "-PdfOutDir",
      pdfRoot,
      "-TempDir",
      tempDir,
      "-PdfCatalogPath",
      catalogPath
    ],
    { cwd: repoRoot, encoding: "utf8" }
  );

  assert.equal(build.status, 0, build.stderr || build.stdout);
  assert.ok(fs.existsSync(path.join(pdfRoot, `${slug}.pdf`)));

  const meta = JSON.parse(fs.readFileSync(path.join(tempDir, `${slug}.pdfmeta.json`), "utf8"));
  assert.equal(meta.engine, "html");
  assert.equal(meta.render_status, "primary");
  assert.equal(meta.source_path, `/essays/${slug}/`);
  assert.match(meta.source_url, /^http:\/\/127\.0\.0\.1:\d+\/essays\/rendered-html-smoke\/$/);

  const siteDir = path.join(tempDir, "__html_site");
  const baseUrl = meta.source_url.replace(`/essays/${slug}/`, "/");
  const server = await renderer.serveStatic(siteDir, Number(new URL(baseUrl).port));
  const browser = await playwright.chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1900 } });
    await page.emulateMedia({ media: "print" });
    await page.goto(meta.source_url, { waitUntil: "networkidle" });

    const visibility = await page.evaluate(() => {
      const display = (selector) => getComputedStyle(document.querySelector(selector)).display;
      return {
        header: display(".site-header"),
        footer: display(".site-footer"),
        editionDownload: display(".edition-download"),
        imprint: display(".imprint-header"),
        citation: display(".citation")
      };
    });

    assert.equal(visibility.header, "none");
    assert.equal(visibility.footer, "none");
    assert.equal(visibility.editionDownload, "none");
    assert.notEqual(visibility.imprint, "none");
    assert.notEqual(visibility.citation, "none");
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("typst builds still succeed when the toolchain exists, otherwise they fail with actionable guidance", (t) => {
  if (!commandWorks("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"])) {
    t.skip("pwsh is required for the typst-path integration test.");
  }

  const fixtureRoot = makeFixtureRoot("oip-pdf-typst-");
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const contentDir = path.join(fixtureRoot, "content");
  const pdfRoot = path.join(fixtureRoot, "static", "pdfs");
  const tempDir = path.join(fixtureRoot, "resources", "typst_build");
  const catalogPath = path.join(fixtureRoot, "data", "pdfs", "catalog.json");
  const slug = "typst-fixture";
  writeFixtureContent(contentDir, slug, "typst");

  fs.mkdirSync(pdfRoot, { recursive: true });
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });

  const build = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      path.join(repoRoot, "scripts", "build_pdfs_typst_shared.ps1"),
      "-Mode",
      "Test",
      "-ContentRoot",
      contentDir,
      "-PdfOutDir",
      pdfRoot,
      "-TempDir",
      tempDir,
      "-PdfCatalogPath",
      catalogPath
    ],
    { cwd: repoRoot, encoding: "utf8" }
  );

  if (build.status === 0) {
    assert.ok(fs.existsSync(path.join(pdfRoot, `${slug}.pdf`)));
    const meta = JSON.parse(fs.readFileSync(path.join(tempDir, `${slug}.pdfmeta.json`), "utf8"));
    assert.equal(meta.engine, "typst");
    return;
  }

  const combinedOutput = `${build.stdout}\n${build.stderr}`;
  assert.match(combinedOutput, /Missing required command '(pandoc|typst)'/);
  assert.match(combinedOutput, /Install it and ensure it is in PATH/);
});
