import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { deflateSync } from "node:zlib";
import { execFileSync, spawnSync } from "node:child_process";
const hugo = process.env.OIP_HUGO_BIN || "hugo";
const repository = process.cwd();
const sourceManifest = JSON.parse(fs.readFileSync("data/image-assets.json", "utf8"));
const examples = Object.values(sourceManifest.assets).filter(asset => asset.review_state === "approved" && asset.source.endsWith(".jpg")).slice(0, 2);
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const snapshot = root => Object.fromEntries(fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => {
  const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
  return [path.relative(root, absolute).replaceAll("\\", "/"), digest(fs.readFileSync(absolute))];
}).sort(([a], [b]) => a.localeCompare(b)));
const cacheSnapshot = root => Object.fromEntries(fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => {
  const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
  return [path.relative(root, absolute).replaceAll("\\", "/"), fs.statSync(absolute, { bigint: true }).mtimeNs.toString()];
}).sort(([a], [b]) => a.localeCompare(b)));
// Small deterministic RGBA marks isolate pipeline behavior from the production artwork.
function markPng(red = 255, green = 0) {
  const crc = bytes => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const content = Buffer.concat([Buffer.from(type), data]); const length = Buffer.alloc(4), sum = Buffer.alloc(4); length.writeUInt32BE(data.length); sum.writeUInt32BE(crc(content)); return Buffer.concat([length, content, sum]); };
  const width = 16, height = 8, header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const offset = y * (width * 4 + 1) + 1 + x * 4; pixels[offset] = red; pixels[offset + 1] = green; pixels[offset + 3] = x > 0 && x < 15 && y > 0 && y < 7 ? 255 : 0; }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
const signaturePolicy = () => ({ version: 1, mark: "images/signatures/fixture.png", default_classes: ["essay_illustration", "editorial_cartoon"], width_ratio: 0.2, inset_ratio: 0.025, overrides: {}, legacy_assets: {} });
function prepare(root, manifest, { policy = signaturePolicy(), mark = markPng(), repeat = false, compatibility = { version: 1, aliases: {} } } = {}) {
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "hugo.toml"), 'baseURL="https://example.test/"\ndisableKinds=["taxonomy","term","RSS","sitemap"]\n');
  fs.writeFileSync(path.join(root, "data/image-assets.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(root, "data/image-signatures.json"), JSON.stringify(policy) + "\n");
  fs.writeFileSync(path.join(root, "data/image-signature-compatibility.json"), JSON.stringify(compatibility) + "\n");
  fs.mkdirSync(path.join(root, "assets/images/signatures"), { recursive: true });
  fs.writeFileSync(path.join(root, "assets", policy.mark), mark);
  fs.mkdirSync(path.join(root, "layouts"), { recursive: true });
  fs.cpSync(path.join(repository, "layouts/partials/images"), path.join(root, "layouts/partials/images"), { recursive: true });
  fs.writeFileSync(path.join(root, "layouts/index.html"), '{{ $result := dict }}{{ range $id, $entry := (index hugo.Data "image-assets").assets }}{{ if eq $entry.review_state "approved" }}{{ $model := partial "images/model.html" (dict "ref" $id "social" true) }}' + (repeat ? '{{ $model = partial "images/model.html" (dict "ref" $id "social" true) }}' : '') + '{{ $result = merge $result (dict $id (dict "avif" $model.avif_srcset "webp" $model.webp_srcset "social" $model.social_url "lightbox" $model.lightbox_url "signed" $model.signature_enabled "prefix" $model.hash_prefix)) }}{{ end }}{{ end }}{{ $result | jsonify | safeHTML }}');
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

test("signature pixels survive every public format, excluded assets stay identical, and rebuilds never stack marks", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "oip-signed-renders-"));
  const manifest = { schema_version: "1.0", defaults: { ...sourceManifest.defaults, widths: [32, 64], max_render_width: 96, social_max_width: 64 }, assets: {}, aliases: {} };
  for (const [id, imageClass] of [["editorial/art", "editorial_cartoon"], ["essays/photo", "essay_photo"], ["editorial/already-signed", "editorial_cartoon"]]) {
    manifest.assets[id] = { ...examples[0], id, image_class: imageClass };
  }
  const policy = signaturePolicy();
  policy.overrides["editorial/already-signed"] = { enabled: false, reason: "Signature already exists in source" };
  const warm = path.join(temp, "warm");
  const render = (root, output) => execFileSync(hugo, ["--source", root, "--destination", output, "--clock", "2026-10-09T12:00:00Z", "--gc", "--minify", "--panicOnWarning"], { encoding: "utf8" });
  try {
    const unsigned = path.join(temp, "unsigned");
    prepare(unsigned, manifest, { policy: { ...policy, overrides: { ...policy.overrides, "editorial/art": { enabled: false, reason: "Unsigned comparison fixture" } } } });
    render(unsigned, path.join(unsigned, "output"));
    let previousSigned, firstCache;
    for (const [name, settings] of [
      ["first", { policy }], ["repeat", { policy, repeat: true }],
      ["settings", { policy: { ...policy, width_ratio: 0.15 } }],
      ["mark", { policy: { ...policy, width_ratio: 0.15 }, mark: markPng(0, 255) }],
    ]) {
      const cold = path.join(temp, name);
      prepare(warm, manifest, settings); prepare(cold, manifest, settings);
      const output = path.join(warm, "output-" + name);
      render(warm, output); render(cold, path.join(cold, "output"));
      const cache = cacheSnapshot(path.join(warm, "resources/_gen"));
      if (name === "first") firstCache = cache;
      if (name === "repeat") assert.deepEqual(cache, firstCache, "first restored build reuses every cached image without new filenames or writes");
      assert.deepEqual(snapshot(output), snapshot(path.join(cold, "output")), name + " warm/cold equality");
      const data = JSON.parse(fs.readFileSync(path.join(output, "index.html"), "utf8"));
      const expectedPrefix = digest(Buffer.from(manifest.assets["editorial/art"].sha256 + "|" + digest(fs.readFileSync(path.join(warm, "data/image-signatures.json"))) + "|" + digest(settings.mark ?? markPng()) + "|bob-v1")).slice(0, 12);
      assert.equal(data["editorial/art"].prefix, expectedPrefix);
      assert.equal(data["editorial/art"].signed, true);
      assert.match(data["editorial/art"].lightbox, /\/96w\.webp$/);
      for (const id of ["essays/photo", "editorial/already-signed"]) {
        assert.equal(data[id].signed, false);
        const prefix = manifest.assets[id].sha256.slice(0, 12);
        for (const suffix of ["32w.avif", "32w.webp", "64w.avif", "64w.webp", "96w.avif", "96w.webp", "social-64w.jpg"]) {
          const relative = path.join("images/rendered", id, prefix, suffix);
          assert.equal(digest(fs.readFileSync(path.join(output, relative))), digest(fs.readFileSync(path.join(unsigned, "output", relative))), id + " " + suffix + " remains unchanged");
        }
      }
      const signed = {};
      for (const suffix of ["32w.avif", "32w.webp", "64w.avif", "64w.webp", "96w.avif", "96w.webp", "social-64w.jpg"]) {
        signed[suffix] = digest(fs.readFileSync(path.join(output, "images/rendered/editorial/art", expectedPrefix, suffix)));
        const baseline = digest(fs.readFileSync(path.join(unsigned, "output/images/rendered/editorial/art", manifest.assets["editorial/art"].sha256.slice(0, 12), suffix)));
        assert.notEqual(signed[suffix], baseline, suffix + " contains composited pixels");
      }
      if (name === "repeat") assert.deepEqual(signed, previousSigned, "requesting the same model twice does not stack signatures");
      else if (previousSigned) assert.notDeepEqual(signed, previousSigned, name + " changes signature pixels");
      previousSigned = signed;
    }
    fs.rmSync(path.join(warm, "data/image-signatures.json"));
    const missing = spawnSync(hugo, ["--source", warm, "--destination", path.join(warm, "missing-policy")], { encoding: "utf8" });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr + missing.stdout, /Image signature policy is missing/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("legacy originals resolve through signed assets and Gallery downloads use signed fullview files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oip-legacy-signature-"));
  try {
    const original = examples[0], id = "legacy/" + original.sha256;
    const policy = signaturePolicy();
    policy.legacy_assets[id] = { id, source: "images/legacy-medium/fixture/source.jpg", sha256: original.sha256, width: original.width, height: original.height, image_class: "essay_illustration", processing_hint: "drawing", processing_state: "derivative_capable", review_state: "approved", usage_state: "referenced", url: "/images/medium/fixture/source.jpg", reason: "Fixture owned artwork" };
    const manifest = { schema_version: "1.0", defaults: { ...sourceManifest.defaults, widths: [32, 64], max_render_width: 96, social_max_width: 64 }, assets: {}, aliases: {} };
    prepare(root, manifest, { policy });
    fs.mkdirSync(path.join(root, "static/images/medium/fixture"), { recursive: true });
    const sourceBytes = fs.readFileSync(path.join(repository, "assets", original.source));
    fs.writeFileSync(path.join(root, "static/images/medium/fixture/source.jpg"), sourceBytes);
    fs.writeFileSync(path.join(root, "static/images/medium/fixture/untouched.jpg"), sourceBytes);
    fs.appendFileSync(path.join(root, "hugo.toml"), '\n[[module.mounts]]\nsource="assets"\ntarget="assets"\n[[module.mounts]]\nsource="static"\ntarget="static"\nfiles=["! images/medium/fixture/source.jpg", "**"]\n[[module.mounts]]\nsource="static/images/medium"\ntarget="assets/images/legacy-medium"\nfiles=["fixture/source.jpg"]\n');
    fs.mkdirSync(path.join(root, "layouts/partials/editorial"), { recursive: true });
    fs.copyFileSync(path.join(repository, "layouts/partials/editorial/gallery-download-link.html"), path.join(root, "layouts/partials/editorial/gallery-download-link.html"));
    fs.writeFileSync(path.join(root, "layouts/index.html"), '{{ $model := partial "images/model.html" (dict "ref" "/images/medium/fixture/source.jpg" "social" true) }}{{ partial "images/picture.html" (dict "model" $model "alt" "Fixture" "lightbox" true) }}{{ partial "editorial/gallery-download-link.html" (dict "model" $model "slug" "fixture" "title" "Fixture") }}<meta property="og:image" content="{{ $model.social_url }}">');
    execFileSync(hugo, ["--source", root, "--clock", "2026-10-09T12:00:00Z", "--minify", "--panicOnWarning"], { encoding: "utf8" });
    const output = path.join(root, "public"), html = fs.readFileSync(path.join(output, "index.html"), "utf8");
    assert.match(html, /data-oip-image-signed=(?:"true"|true)/);
    assert.match(html, /data-gallery-download/);
    assert.match(html, /download=(?:"fixture-bob\.webp"|fixture-bob\.webp)/);
    const download = html.match(/<a\b[^>]*data-gallery-download[^>]*href=(?:"([^"]+)"|([^\s>]+))/)?.slice(1).find(Boolean);
    assert.ok(download, "Gallery renders a direct download link");
    assert.match(download, new RegExp(`/images/rendered/${id}/[a-f0-9]{12}/96w\\.webp$`));
    assert.ok(fs.existsSync(path.join(output, download)));
    assert.ok(!fs.existsSync(path.join(output, "images/medium/fixture/source.jpg")), "unsigned legacy URL is not published");
    assert.equal(digest(fs.readFileSync(path.join(output, "images/medium/fixture/untouched.jpg"))), digest(sourceBytes), "unselected static source stays byte-identical");
    assert.equal(digest(fs.readFileSync(path.join(root, "static/images/medium/fixture/source.jpg"))), digest(sourceBytes), "legacy source stays byte-identical");
    assert.doesNotMatch(html, /images\/medium\/fixture\/source\.jpg|images\/legacy-medium\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("historical email image URLs serve the same signed JPEG without changing canonical rendition identity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oip-signature-email-"));
  try {
    const id = "editorial/email-fixture", original = examples[0];
    const manifest = { schema_version: "1.0", defaults: { ...sourceManifest.defaults, widths: [32], max_render_width: 64, social_max_width: 64 }, assets: { [id]: { ...original, id, image_class: "editorial_cartoon" } }, aliases: {} };
    const oldUrl = `/images/rendered/${id}/${original.sha256.slice(0, 12)}/social-64w.jpg`;
    const render = destination => execFileSync(hugo, ["--source", root, "--destination", destination, "--clock", "2026-10-09T12:00:00Z", "--minify", "--panicOnWarning"], { encoding: "utf8" });
    prepare(root, manifest);
    const baseline = path.join(root, "baseline"); render(baseline);
    const baselineFiles = snapshot(baseline);
    prepare(root, manifest, { compatibility: { version: 1, aliases: { [oldUrl]: id } } });
    const output = path.join(root, "compatible"); render(output);
    const result = JSON.parse(fs.readFileSync(path.join(output, "index.html"), "utf8"))[id];
    assert.equal(result.signed, true);
    assert.notEqual(result.social, oldUrl, "normal metadata retains signed canonical URL");
    assert.equal(digest(fs.readFileSync(path.join(output, oldUrl))), digest(fs.readFileSync(path.join(output, result.social))), "old email URL serves identical signed bytes");
    const compatibleFiles = snapshot(output);
    assert.ok(compatibleFiles[oldUrl.slice(1)]);
    delete compatibleFiles[oldUrl.slice(1)];
    assert.deepEqual(compatibleFiles, baselineFiles, "compatibility registry adds one alias and changes no canonical pixels or paths");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
