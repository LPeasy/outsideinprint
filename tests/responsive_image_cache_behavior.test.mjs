import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const hugo = process.env.OIP_HUGO_BIN || "hugo";
const repository = process.cwd();
const sourceManifest = JSON.parse(fs.readFileSync("data/image-assets.json", "utf8"));
const examples = Object.values(sourceManifest.assets).filter(asset => asset.review_state === "approved" && asset.source.endsWith(".jpg")).slice(0, 2);
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const snapshot = root => Object.fromEntries(fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => {
  const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
  return [path.relative(root, absolute).replaceAll("\\", "/"), digest(fs.readFileSync(absolute))];
}).sort(([a], [b]) => a.localeCompare(b)));
function prepare(root, manifest) {
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "hugo.toml"), 'baseURL="https://example.test/"\ndisableKinds=["taxonomy","term","RSS","sitemap"]\n');
  fs.writeFileSync(path.join(root, "data/image-assets.json"), JSON.stringify(manifest));
  fs.mkdirSync(path.join(root, "layouts"), { recursive: true });
  fs.cpSync(path.join(repository, "layouts/partials/images"), path.join(root, "layouts/partials/images"), { recursive: true });
  fs.writeFileSync(path.join(root, "layouts/index.html"), '{{ $result := dict }}{{ range $id, $entry := (index hugo.Data "image-assets").assets }}{{ if eq $entry.review_state "approved" }}{{ $model := partial "images/model.html" (dict "ref" $id "social" true) }}{{ $result = merge $result (dict $id (dict "avif" $model.avif_srcset "webp" $model.webp_srcset "social" $model.social_url)) }}{{ end }}{{ end }}{{ $result | jsonify | safeHTML }}');
  for (const entry of Object.values(manifest.assets).filter(asset => asset.review_state === "approved")) {
    const target = path.join(root, "assets", entry.source);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repository, "assets", entry.source), target);
  }
}
test("compatible resources agree with cold renders after image and recipe changes", () => {
  assert.equal(examples.length, 2);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "oip-image-cache-"));
  try {
    const manifest = { schema_version: "1.0", defaults: { ...sourceManifest.defaults, widths: [32, 64], max_render_width: 96, social_max_width: 64 }, assets: { "books/fixture/first": { ...examples[0], id: "books/fixture/first" } }, aliases: {} };
    const warm = path.join(temp, "warm");
    const cases = [
      ["original", () => {}],
      ["added", () => { manifest.assets["books/fixture/second"] = { ...examples[1], id: "books/fixture/second" }; }],
      ["replaced", () => { manifest.assets["books/fixture/first"] = { ...examples[1], id: "books/fixture/first" }; }],
      ["removed", () => { delete manifest.assets["books/fixture/second"]; }],
      ["quality", () => { manifest.assets["books/fixture/first"].quality_override = { webp_quality: 50, avif_quality: 40 }; }],
      ["widths", () => { manifest.defaults.widths = [24, 48]; manifest.defaults.max_render_width = 80; }],
      ["note-only", () => { manifest.assets.quarantine = { review_state: "rejected_corrupt_source", processing_state: "source_only_unprocessable", processing_note: "Updated quarantine explanation." }; }],
    ];
    for (const [name, mutate] of cases) {
      mutate();
      const cold = path.join(temp, name);
      prepare(warm, manifest); prepare(cold, manifest);
      const render = (root, output) => execFileSync(hugo, ["--source", root, "--destination", output, "--clock", "2026-10-09T12:00:00Z", "--gc", "--minify", "--panicOnWarning"], { encoding: "utf8" });
      const warmOutput = path.join(warm, "output-" + name), coldOutput = path.join(cold, "output");
      render(warm, warmOutput); render(cold, coldOutput);
      assert.deepEqual(snapshot(warmOutput), snapshot(coldOutput), name + " warm/cold bytes and paths");
      assert.ok(!Object.keys(snapshot(warmOutput)).some(file => file.includes("quarantine")), "quarantine must not render");
    }
    const exact = path.join(warm, "exact");
    execFileSync(hugo, ["--source", warm, "--destination", exact, "--clock", "2026-10-09T12:00:00Z", "--gc", "--minify", "--panicOnWarning"], { encoding: "utf8" });
    assert.deepEqual(snapshot(exact), snapshot(path.join(warm, "output-note-only")));
  } finally {
    assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
