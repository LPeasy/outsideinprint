# Responsive Image Pipeline

Outside In Print keeps managed production artwork as Hugo assets and publishes only bounded derivatives. Original editorial and essay artwork does not belong under `static/` and must never appear in `public/`.

## Canonical inventory

`data/image-assets.json` is the image contract. Schema `1.0` contains:

- processing defaults;
- 350 canonical assets: 337 core review images and 13 supplemental essay photos;
- source-relative paths under `assets/images/originals/`;
- SHA-256 values and native dimensions;
- image class (`editorial_cartoon`, `essay_illustration`, `medium_import`, or `essay_photo`), processing hint, review state, usage state, and optional quality override; and
- exactly 391 former public image URLs as aliases to canonical IDs for this release.

The 337-image core cohort comprises 330 unique editorial/essay PNG originals after 34 duplicate pairs are consolidated, plus seven shared Medium originals after seven cross-article pairs are consolidated. Five originals are intentionally retained but unreferenced: three supplemental essay photos and two unique legacy PNG illustrations. They use `usage_state: retained_unreferenced`; every other asset uses `usage_state: referenced`. Healthy assets require `review_state: approved` before release; the one corrupt quarantine uses the explicit rejected state described below.

One malformed supplemental legacy JPG is quarantined as `processing_state: source_only_unprocessable`, `review_state: rejected_corrupt_source`, and `usage_state: retained_unreferenced`. It keeps one historical alias but may never be referenced, rendered, or copied into production. The other 349 assets must be `processing_state: derivative_capable` and `review_state: approved`; every referenced asset must be derivative-capable. The rejected raw original remains only as provenance and recovery evidence.

Aliases are resolver inputs, not redirects. Retired raw PNG/JPEG URLs are allowed to return 404. An alias must resolve directly to a canonical asset and must not create a second source copy.
The 350-source and 391-alias counts are frozen R1 controls. Future registered artwork requires a deliberate manifest and contract update; unexplained count drift fails validation.

The manifest and its three tracked review/build evidence files use one cross-platform byte contract: strict UTF-8 without a byte-order mark, LF line endings, and exactly one final LF. Current manifest-linkage SHA-256 values are computed from those canonical bytes; the visual-review report's `manifest_sha256_before_review` remains a historical pre-approval value and is not reinterpreted by this contract. The shared writer normalizes output before an atomic replacement, `.gitattributes` preserves LF checkouts, and the source contract rejects BOMs, invalid UTF-8, CRLF/lone-CR bytes, or an incorrect final-newline state. Binary artwork hashes remain raw file-byte hashes and are never text-normalized.

## Authoring references

Use logical references instead of source paths:

- Front matter and data: `editorial/example-slug`, `essays/example-slug/hero`, or `medium/<sha256>`.
- Markdown: `![Alternative text](oip-image:essays/example-slug/hero)`.
- External and explicitly nonmanaged static images retain normal URL behavior.

Never write `/images/originals/` into content, data, layouts, or metadata. Never copy a managed original into `static/`. Supported publishing and import tools must write one source under `assets/images/originals/`, register it in the manifest, and return the stable ID used by content.

## Rendering contract

The shared resolver, model, and picture partials serve article heroes, body figures, homepage cartoons, gallery and Almanack images, cards, lightboxes, and managed metadata images.

- Candidate widths are 320, 640, 960, 1280, and 1600 pixels, plus a terminal native width when it is smaller than 1600 and not already in that set. No derivative may upscale its source.
- Standard illustrations use WebP quality 82 and AVIF quality 60 with the drawing hint and Lanczos resampling.
- Approved detail overrides use WebP quality 90 and AVIF quality 70.
- A `<picture>` emits AVIF first, WebP second, then a WebP `<img>` fallback.
- The fallback includes intrinsic dimensions, `sizes`, `decoding="async"`, and an explicit loading policy.
- One route LCP image may use `loading="eager"` with `fetchpriority="high"`; body images, cards, and thumbnails use lazy loading.
- Lightboxes defer a maximum-1600px WebP until activation.
- Open Graph, Twitter, and JSON-LD share one maximum-1200px JPEG at quality 85.
- Public URLs use `/images/rendered/<asset-id>/<source-hash-prefix>/...`. They never expose `/originals/`.

## Build cache and performance

GitHub Actions caches `resources/_gen` with one exact key derived from Hugo `0.164.0`, the toolchain and imaging configuration, the image manifest, all managed sources, and all rendering partials that affect derivatives. There is no broad restore key.

- Cold image build: no more than 15 minutes.
- Exact restored-cache build: no more than five minutes.
- Image-generating job timeout: 20 minutes.

## Output budgets

The production gate enforces:

- prepared Pages payload no more than 600 MiB;
- `public/images` no more than 500 MiB;
- no derivative larger than 1 MiB;
- no more than 5,000 generated images;
- no more than 6,500 total public files;
- zero managed source bytes or migrated editorial/essay raster originals in `static/` or `public/`; and
- valid AVIF, WebP, and JPEG signatures, dimensions, MIME declarations, responsive descriptors, and source-hash URL prefixes.

## Validation and visual review

Run the source gate before Hugo so stale hashes, dimensions, aliases, source copies, or unapproved review states fail early:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_source_contract.ps1
```

During migration only, a maintainer may run the same structural checks while review states remain pending:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_source_contract.ps1 -AllowPendingReview
```

`-AllowPendingReview` is local-only. It does not skip schema, source, hash, dimension, alias, reference, deduplication, or storage checks. CI and publication gates must omit it, require all 349 healthy assets to have `review_state: approved`, and require the sole corrupt quarantine to retain `review_state: rejected_corrupt_source`.
The sole `rejected_corrupt_source` quarantine is not a review bypass: it is fail-closed, cannot enter the rendering model, and must remain absent from public output.

After a production build, run the generated-output gate:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_output_contract.ps1 -SiteDir public
```

Generate local review sheets for all 350 assets, comparing the original, largest WebP, and largest AVIF. Deep-review at least 24 high-risk images covering fine text, crosshatching, faces, dark tones, saturated colors, unusual aspect ratios, and the largest sources. Review sheets are local evidence and do not belong in the Pages artifact.

Browser review covers the homepage, Gallery, Almanack, representative essays, Affirmations, and Medium imports at desktop, 390px, and 320px; both themes; keyboard navigation; 200% zoom; lightboxes; and network requests.
