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
  assert.equal(entries.length, 459, "the focused cleanup must keep 459 reconciled managed images");
  assert.equal(
    entries.filter(([, asset]) => asset.image_class === "medium_import").length,
    112,
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
      /^(?:editorial\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|essays(?:\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?){2,3}|medium\/[0-9a-f]{64})$/,
    );
    assert.match(asset.source, /^images\/originals\/(?:editorial|essays|medium)\/.+\.(?:png|jpe?g)$/);
    const idParts = id.split("/");
    const sourceParts = asset.source.split("/");
    const sourceStem = sourceParts.at(-1).replace(/\.(?:png|jpe?g)$/, "");
    if (idParts[0] === "editorial") {
      assert.deepEqual(sourceParts.slice(0, -1), ["images", "originals", "editorial"]);
      assert.equal(sourceStem, idParts[1]);
    } else if (idParts[0] === "essays") {
      assert.deepEqual(sourceParts.slice(0, -1), ["images", "originals", ...idParts.slice(0, -1)]);
      const assetStem = idParts.at(-1);
      const explicitJpegCollision =
        assetStem.endsWith("-jpg") &&
        asset.source.endsWith(".jpg") &&
        sourceStem === assetStem.slice(0, -4);
      assert.ok(sourceStem === assetStem || explicitJpegCollision);
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

  const legacyMediumIds = new Set([
    "medium/20f97dfa3cacfdad0e6ad4e8bd6b9f40259e269d01de4e85977a31d1468a0731",
    "medium/2cb1bd9d5e821673e5988fe08124a3a9270c9ef0cd5b494b7fea0a55bb4814e7",
    "medium/502c9af7d38343926679b4000c07f7938a7bb2ffb2de34fd307939daa7c4523a",
    "medium/79135b86692f72d399ab6e14643d150385b4419e4c10a2c66a7e32ccacd64cbe",
    "medium/982e8af5463df6dd09ee9b9aeb11f3c8764461085e2bf676f51d03a5fc9fe1fb",
    "medium/bae249c94478ad9d5603403fcd7b5141ffc06bc35a66bd782d1f4f259ed2a7cb",
    "medium/ec686e18de7c21b0892fabb04179d3a92b94245291f508d7fdc56af18af8fab7",
  ]);
  assert.equal(
    entries.filter(([id]) => id.startsWith("medium/") && !legacyMediumIds.has(id)).length,
    105,
    "exactly 105 Medium PNG sources must join the pre-existing seven managed Medium assets",
  );

  const expectedSydIds = [
    "essays/dialogues/bobanonymous/hero",
    "essays/dialogues/broke-rich/hero",
    "essays/dialogues/infinite-incontent/hero",
    "essays/dialogues/pressure-makes-pearls/hero",
  ];
  assert.deepEqual(
    entries.map(([id]) => id).filter((id) => id.startsWith("essays/dialogues/")).sort(),
    expectedSydIds,
  );

  assert.equal(Object.keys(manifest.aliases).length, 500);
  for (const [alias, target] of Object.entries(manifest.aliases)) {
    assert.match(alias, /^\/images\/(?:editorial|essays|medium|syd-and-oliver)\/.+\.(?:png|jpe?g)$/);
    assert.ok(Object.hasOwn(manifest.assets, target), `${alias} must resolve directly to a canonical asset`);
  }
  assert.equal(
    Object.keys(manifest.aliases).filter((alias) => alias.startsWith("/images/medium/")).length,
    119,
  );
  assert.deepEqual(
    Object.entries(manifest.aliases)
      .filter(([alias]) => alias.startsWith("/images/syd-and-oliver/"))
      .map(([, target]) => target)
      .sort(),
    expectedSydIds,
  );
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

test("focused legacy migration is dry-run-first, hash-based, long-path-safe, and rollback-capable", () => {
  const migration = read("scripts/migrate_focused_legacy_images.ps1");
  const promotion = read("scripts/promote_focused_image_review.ps1");
  const reviewSelection = read("scripts/select_image_review_candidates.ps1");

  assert.match(migration, /\[switch\]\$Write/);
  assert.match(migration, /\[switch\]\$Json/);
  assert.match(migration, /'ls-files', '-z', '--'/);
  assert.match(migration, /\.Split\(\[char\]0/);
  assert.match(migration, /Get-FileHash\s+-LiteralPath\s+\$Path\s+-Algorithm\s+SHA256/);
  assert.match(migration, /filename_hash_match\s*=\s*\(\$stem -ceq \$hash\)/);
  assert.match(migration, /asset_id\s*=\s*'medium\/'\s*\+\s*\[string\]\$item\.sha256/);
  assert.match(migration, /mode\s*=\s*if\s*\(\$Write\)\s*\{\s*'write'\s*\}\s*else\s*\{\s*'dry_run'\s*\}/);
  assert.match(migration, /mode\s*=\s*if\s*\(\$Write\)\s*\{\s*'already_applied'\s*\}\s*else\s*\{\s*'verify_applied'\s*\}/);

  for (const [field, value] of [
    ["baseline_medium_files", 471],
    ["referenced_medium_files", 421],
    ["migrated_medium_pngs", 105],
    ["retained_medium_jpeg_jpg", 316],
    ["removed_medium_orphans", 50],
    ["migrated_syd_heroes", 4],
    ["filename_hash_mismatches", 15],
    ["post_manifest_assets", 459],
    ["post_manifest_aliases", 500],
  ]) {
    assert.match(migration, new RegExp(`${field}\\s*=\\s*${value}\\b`));
  }
  assert.match(migration, /ExpectedMediumInventorySha256\s*=\s*'851880a2e59635b660a6192385dff6cbb0eb73d3b8b3d5f747c6e730c6302c5a'/);
  assert.match(migration, /ExpectedSydInventorySha256\s*=\s*'c53d8f9db266f5cba29cb4fd400a0dd72263e6eb492e706b2d1aedd07c0bd21e'/);
  assert.match(migration, /InventoryDigestBasis\s*=\s*'sorted_path_tab_actual_sha256_lf_utf8_no_bom'/);
  assert.match(migration, /function Get-OipInventoryDigest/);
  assert.match(migration, /Focused legacy Medium inventory digest drifted/);
  assert.match(migration, /Focused legacy Syd inventory digest drifted/);

  const stageIndex = migration.indexOf("$stagedWrites");
  const writeGateIndex = migration.indexOf("if ($Write)", stageIndex);
  const backupIndex = migration.indexOf("$backups =", writeGateIndex);
  const moveIndex = migration.indexOf("[IO.File]::Move", backupIndex);
  const rollbackIndex = migration.indexOf("if (-not $commitSucceeded)", moveIndex);
  assert.ok(stageIndex >= 0 && writeGateIndex > stageIndex, "all output must stage before the write gate");
  assert.ok(backupIndex > writeGateIndex && moveIndex > backupIndex, "writes must begin only after backups exist");
  assert.ok(rollbackIndex > moveIndex, "failed commits must enter the rollback path");
  assert.match(migration, /Migration input changed after staging/);
  assert.match(migration, /Committed managed original failed verification/);
  assert.match(migration, /\[IO\.File\]::Copy\(\[string\]\$backups\[\$path\], \$path, \$true\)/);
  assert.doesNotMatch(migration, /Remove-Item\s+[^\r\n]*-Recurse/);

  assert.match(promotion, /\[switch\]\$InitializeEvidence/);
  assert.match(promotion, /\[switch\]\$Write/);
  assert.match(promotion, /focused-image-visual-review\.json/);
  assert.match(promotion, /review_state\s*=\s*'pending_review'/);
  assert.match(promotion, /Promotion refused: focused image visual-review record is not PASS/);
  assert.match(promotion, /expected_asset_count\s*=\s*109/);
  assert.match(promotion, /@\(\$inventory\.medium_migrations\)\.Count -ne 105/);
  assert.match(promotion, /@\(\$inventory\.syd_migrations\)\.Count -ne 4/);
  assert.match(promotion, /function Assert-OipPassEvidenceCoverage/);
  assert.match(
    promotion,
    /Assert-OipExactSet\s+-Actual\s+@\(\$Evidence\.reviewed_asset_ids\)\s+-Expected\s+\$Context\.AssetIds/,
  );
  assert.match(
    promotion,
    /Assert-OipExactSet\s+-Actual\s+@\(\$Evidence\.deep_reviewed_asset_ids\)\s+-Expected\s+\$Context\.DeepIds/,
  );
  assert.equal(
    [...promotion.matchAll(/Assert-OipPassEvidenceCoverage\s+-Evidence\s+\$evidence\s+-Context\s+\$context/g)].length,
    2,
    "PASS evidence coverage must gate both applied-state verification and new promotion",
  );
  assert.match(promotion, /reviewed_asset_ids_sha256\s+-ceq\s+\(Get-OipSha256ForStrings -Values \$context\.AssetIds\)/);
  assert.match(promotion, /deep_review_asset_ids_sha256\s+-ceq\s+\(Get-OipSha256ForStrings -Values \$context\.DeepIds\)/);
  assert.match(promotion, /Prior-revision visual-review evidence may verify an already-applied promotion but cannot authorize a new promotion/);
  assert.match(promotion, /\$deepIds\s*=\s*@\(\$allDeepIds\s*\|\s*Where-Object\s*\{\s*\$assetIds -ccontains \$_\s*\}\)/);
  assert.match(promotion, /focused_deep_review_count/);
  assert.match(promotion, /AllDeepIds\s*=\s*\$allDeepIds/);
  assert.match(promotion, /quantitative_decode_sanity\s*=\s*\[ordered\]@\{\s*asset_count\s*=\s*458/);
  assert.match(promotion, /deep_review\s*=\s*\[ordered\]@\{\s*asset_count\s*=\s*\$context\.AllDeepIds\.Count/);
  assert.match(promotion, /decode_failure_count -ne 0/);
  assert.match(promotion, /\$context\.Manifest\.assets\[\$assetId\]\.review_state = 'approved'/);
  assert.match(promotion, /if \(-not \$commitSucceeded\)/);
  assert.match(promotion, /\[IO\.File\]::Copy\(\[string\]\$backups\[\$target\], \$target, \$true\)/);

  assert.match(reviewSelection, /focused_deep_review_count\s*=\s*\$focusedDeepReviewCount/);
  assert.match(reviewSelection, /Focused deep-review selection produced \$focusedDeepReviewCount migrated assets, below required minimum 24/);
  for (const category of [
    "focused_syd_hero",
    "focused_chart",
    "focused_map",
    "focused_fine_text",
    "focused_portrait_or_tall",
    "focused_extreme_aspect_ratio",
    "focused_dark_tones",
    "focused_saturated_color",
  ]) {
    assert.ok(reviewSelection.includes(`'${category}'`), `focused review selection must cover ${category}`);
  }
});

test("draft image review previews contain tall assets without changing production picture styles", () => {
  const reviewLayout = read("layouts/_default/image-review.html");
  const inlineReviewCss = reviewLayout.match(/<style>(?<body>[\s\S]*?)<\/style>/)?.groups?.body ?? "";
  const reviewImageRule = inlineReviewCss.match(/\.image-review__comparisons img\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? "";
  const reviewLinkRule = inlineReviewCss.match(/\.image-review__comparisons a\s*,[\s\S]*?\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? "";

  assert.match(reviewLayout, /if not \.Draft/);
  assert.match(reviewLayout, /hugo\.IsDevelopment hugo\.IsServer/);
  assert.match(reviewImageRule, /width:\s*auto/);
  assert.match(reviewImageRule, /max-width:\s*100%/);
  assert.match(reviewImageRule, /height:\s*auto/);
  assert.match(reviewImageRule, /max-height:\s*100%/);
  assert.match(reviewLinkRule, /overflow:\s*hidden/);
  assert.doesNotMatch(reviewImageRule, /(?:^|\n)\s*height:\s*100%/);
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
  assert.match(workflow, /test_focused_legacy_image_migration\.ps1/);
  assert.doesNotMatch(
    workflow,
    /test_responsive_image_source_contract\.ps1[^\r\n]*AllowPendingReview/i,
  );
  assert.match(workflow, /test_responsive_image_output_contract\.ps1/);
  assert.match(workflow, /node --test tests\/all\.test\.mjs/);

  for (const required of ["600 MiB", "500 MiB", "1 MiB", "5,000", "6,500", "15 minutes", "five minutes"]) {
    assert.ok(imageGuide.includes(required), `responsive image guide must document ${required}`);
  }
  for (const required of [
    "migrate_focused_legacy_images.ps1",
    "471-file baseline",
    "105 Medium PNG migrations",
    "316 retained JPEG/JPG files",
    "50 unreferenced removals",
    "Fifteen legacy filenames",
    "promote_focused_image_review.ps1",
  ]) {
    assert.ok(imageGuide.includes(required), `responsive image guide must document ${required}`);
  }
  assert.doesNotMatch(publishing, /static\/images\/syd-and-oliver\/<slug>\/hero\.png/);
  assert.match(publishing, /assets\/images\/originals\/essays\/dialogues\/<slug>\/hero\.<ext>/);
  assert.match(publishing, /essays\/dialogues\/<slug>\/hero/);
  assert.match(publishing, /responsive[- ]image/i);
  assert.match(publishing, /test_responsive_image_output_contract\.ps1/);
});
