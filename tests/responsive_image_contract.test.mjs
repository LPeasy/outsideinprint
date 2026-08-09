import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("responsive image manifest keeps the frozen inventory and processing defaults", () => {
  const manifest = JSON.parse(read("data/image-assets.json"));

  assert.equal(manifest.schema_version, "1.0");
  assert.deepEqual(manifest.defaults, {
    widths: [320, 640, 960, 1280, 1600],
    webp_quality: 82,
    avif_quality: 60,
    detail_webp_quality: 90,
    detail_avif_quality: 70,
    social_jpeg_quality: 85,
    max_render_width: 1600,
    social_max_width: 1200,
  });

  const entries = Object.entries(manifest.assets);
  assert.equal(entries.length, 350, "the 337 core images plus 13 essay photos must remain reconciled");
  assert.equal(
    entries.filter(([, asset]) => asset.image_class === "medium_import").length,
    7,
  );
  assert.equal(
    entries.filter(([, asset]) => asset.image_class === "essay_photo").length,
    13,
  );
  assert.equal(
    entries.filter(([, asset]) => asset.usage_state === "retained_unreferenced").length,
    5,
  );
  const sourceOnlyEntries = entries.filter(
    ([, asset]) => asset.processing_state === "source_only_unprocessable",
  );
  assert.equal(sourceOnlyEntries.length, 1);
  assert.equal(
    sourceOnlyEntries[0][0],
    "essays/the-gold-card-and-the-price-of-belonging/section-2-jpg",
  );
  assert.equal(sourceOnlyEntries[0][1].image_class, "essay_photo");
  assert.equal(sourceOnlyEntries[0][1].usage_state, "retained_unreferenced");
  assert.equal(sourceOnlyEntries[0][1].review_state, "rejected_corrupt_source");
  assert.equal(
    sourceOnlyEntries[0][1].processing_note,
    "legacy_jpeg_decoder_warning_premature_end_of_data_segment_and_gray_lower_region",
  );

  const hashes = new Set();
  const sources = new Set();
  for (const [id, asset] of entries) {
    assert.equal(asset.id, id);
    assert.match(
      id,
      /^(?:editorial\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|essays\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|medium\/[0-9a-f]{64})$/,
    );
    assert.match(asset.source, /^images\/originals\/(?:editorial|essays|medium)\/.+\.(?:png|jpe?g)$/);
    const idParts = id.split("/");
    const sourceParts = asset.source.split("/");
    const sourceStem = sourceParts.at(-1).replace(/\.(?:png|jpe?g)$/, "");
    if (idParts[0] === "editorial") {
      assert.deepEqual(sourceParts.slice(0, -1), ["images", "originals", "editorial"]);
      assert.equal(sourceStem, idParts[1]);
    } else if (idParts[0] === "essays") {
      assert.deepEqual(sourceParts.slice(0, -1), ["images", "originals", "essays", idParts[1]]);
      const explicitJpegCollision =
        idParts[2].endsWith("-jpg") &&
        asset.source.endsWith(".jpg") &&
        sourceStem === idParts[2].slice(0, -4);
      assert.ok(sourceStem === idParts[2] || explicitJpegCollision);
    } else {
      assert.deepEqual(sourceParts.slice(0, -1), ["images", "originals", "medium"]);
      assert.equal(sourceStem, idParts[1]);
    }
    assert.match(asset.sha256, /^[0-9a-f]{64}$/);
    assert.ok(asset.width > 0 && asset.height > 0);
    assert.ok(["editorial_cartoon", "essay_illustration", "medium_import", "essay_photo"].includes(asset.image_class));
    assert.ok(["drawing", "photo"].includes(asset.processing_hint));
    assert.ok(["pending_review", "approved", "rejected_corrupt_source"].includes(asset.review_state));
    assert.ok(["derivative_capable", "source_only_unprocessable"].includes(asset.processing_state));
    assert.ok(["referenced", "retained_unreferenced"].includes(asset.usage_state));
    if (asset.processing_state === "derivative_capable") {
      assert.equal(asset.processing_note, null);
      assert.notEqual(asset.review_state, "rejected_corrupt_source");
    } else {
      assert.equal(asset.image_class, "essay_photo");
      assert.equal(asset.usage_state, "retained_unreferenced");
      assert.equal(asset.review_state, "rejected_corrupt_source");
    }
    if (asset.usage_state === "referenced") {
      assert.equal(asset.processing_state, "derivative_capable");
    }
    if (asset.quality_override !== null) {
      assert.deepEqual(asset.quality_override, { webp_quality: 90, avif_quality: 70 });
    }
    assert.equal(hashes.has(asset.sha256), false, `duplicate canonical hash: ${asset.sha256}`);
    assert.equal(sources.has(asset.source), false, `duplicate canonical source: ${asset.source}`);
    hashes.add(asset.sha256);
    sources.add(asset.source);
  }

  assert.equal(Object.keys(manifest.aliases).length, 391);
  for (const [alias, target] of Object.entries(manifest.aliases)) {
    assert.match(alias, /^\/images\/(?:editorial|essays|medium)\/.+\.(?:png|jpe?g)$/);
    assert.ok(Object.hasOwn(manifest.assets, target), `${alias} must resolve directly to a canonical asset`);
  }
  assert.equal(
    Object.values(manifest.aliases).filter((target) => target === sourceOnlyEntries[0][0]).length,
    1,
  );
});

test("all managed rendering surfaces delegate to the shared responsive pipeline", () => {
  const resolve = read("layouts/partials/images/resolve.html");
  const model = read("layouts/partials/images/model.html");
  const picture = read("layouts/partials/images/picture.html");
  const markdownImage = read("layouts/_default/_markup/render-image.html");
  const metadataImage = read("layouts/partials/metadata_image.html");

  assert.match(resolve, /oip-image:/);
  assert.match(resolve, /image-assets/);
  assert.match(model, /320/);
  assert.match(model, /1600/);
  assert.match(model, /images\/rendered/);
  assert.match(model, /social/i);
  assert.match(model, /source_only_unprocessable/);
  assert.match(model, /errorf/);

  const avifIndex = picture.indexOf("image/avif");
  const webpIndex = picture.indexOf("image/webp");
  const imgIndex = picture.indexOf("<img");
  assert.ok(avifIndex >= 0 && webpIndex > avifIndex && imgIndex > webpIndex);
  for (const required of [
    "data-oip-image-id",
    "srcset",
    "sizes",
    "width",
    "height",
    "decoding",
    "loading",
    "fetchpriority",
  ]) {
    assert.ok(picture.includes(required), `picture partial must emit ${required}`);
  }

  assert.match(markdownImage, /partial\s+"images\/(?:model|picture)\.html"/);
  assert.match(metadataImage, /partial\s+"images\/model\.html"/);
});

test("CI caches generated resources and runs both responsive image gates", () => {
  const workflow = read(".github/workflows/deploy.yml");
  const publishing = read("docs/publishing-workflow.md");
  const imageGuide = read("docs/responsive-image-pipeline.md");

  assert.match(workflow, /uses:\s*actions\/cache@v5/);
  assert.match(workflow, /path:\s*resources\/_gen/);
  assert.match(workflow, /hashFiles\([^)]*data\/image-assets\.json/);
  assert.match(workflow, /hashFiles\([^)]*assets\/images\/originals\/\*\*/);
  assert.match(workflow, /layouts\/partials\/images\/\*\*/);
  assert.match(workflow, /timeout-minutes:\s*20/);
  assert.match(workflow, /test_responsive_image_source_contract\.ps1/);
  assert.doesNotMatch(
    workflow,
    /test_responsive_image_source_contract\.ps1[^\r\n]*AllowPendingReview/i,
  );
  assert.match(workflow, /test_responsive_image_output_contract\.ps1/);
  assert.match(workflow, /node --test tests\/all\.test\.mjs/);

  for (const required of ["600 MiB", "500 MiB", "1 MiB", "5,000", "6,500", "15 minutes", "five minutes"]) {
    assert.ok(imageGuide.includes(required), `responsive image guide must document ${required}`);
  }
  assert.match(publishing, /responsive[- ]image/i);
  assert.match(publishing, /test_responsive_image_output_contract\.ps1/);
});
