import test from "node:test";
import assert from "node:assert/strict";
import { imageCacheIdentity } from "../scripts/ci/image_cache.mjs";
const fixture = () => ({
  os: "Linux", hugoVersion: "0.164.0", imaging: { resampleFilter: "Lanczos" }, implementation: { model: "resize" },
  manifest: { defaults: { widths: [320, 640], max_render_width: 1600 }, assets: {
    first: { review_state: "approved", processing_state: "derivative_capable", source: "images/originals/first.png", sha256: "a".repeat(64), width: 1600, height: 900, processing_note: null, editorial_note: "first review" }
  } }
});
test("notes and unrelated tool versions do not invalidate image resources", () => {
  const before = fixture(), after = fixture();
  after.manifest.assets.first.editorial_note = "later review";
  after.manifest.assets.first.processing_note = "";
  after.nodeVersion = "24.21.0";
  assert.deepEqual(imageCacheIdentity(after), imageCacheIdentity(before));
});
test("addition, replacement, removal and quality changes use compatible fallback", () => {
  for (const mutate of [
    f => { f.manifest.assets.second = { ...f.manifest.assets.first, sha256: "b".repeat(64) }; },
    f => { f.manifest.assets.first.sha256 = "c".repeat(64); },
    f => { delete f.manifest.assets.first; },
    f => { f.manifest.assets.first.quality_override = { webp_quality: 70 }; },
  ]) {
    const before = fixture(), after = fixture(); mutate(after);
    assert.equal(imageCacheIdentity(before).prefix, imageCacheIdentity(after).prefix);
    assert.notEqual(imageCacheIdentity(before).key, imageCacheIdentity(after).key);
  }
});
test("Hugo, OS, width defaults, processing configuration and code define compatibility", () => {
  for (const mutate of [f => { f.hugoVersion = "0.167.0"; }, f => { f.os = "Windows"; }, f => { f.manifest.defaults.widths.push(960); }, f => { f.imaging.resampleFilter = "Box"; }, f => { f.implementation.model = "fit"; }]) {
    const before = fixture(), after = fixture(); mutate(after);
    assert.notEqual(imageCacheIdentity(before).prefix, imageCacheIdentity(after).prefix);
  }
});
