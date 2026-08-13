# Responsive Image Pipeline

Outside In Print keeps managed production artwork as Hugo assets and publishes only bounded derivatives. Original editorial and essay artwork does not belong under `static/` and must never appear in `public/`.

## Canonical inventory

`data/image-assets.json` is the image contract. Schema `1.0` contains:

- processing defaults;
- at least 459 canonical assets: the focused-cleanup baseline contains 446 core review images and 13 supplemental essay photos;
- source-relative paths under `assets/images/originals/`;
- SHA-256 values and native dimensions;
- image class (`editorial_cartoon`, `essay_illustration`, `medium_import`, or `essay_photo`), processing hint, review state, usage state, and optional quality override; and
- at least 500 former public image URLs as aliases to canonical IDs for this release.

The 446-image focused-cleanup core cohort comprises the 337 R3 review images, 105 referenced legacy Medium PNGs, and four Syd-and-Oliver dialogue heroes. Routine published artwork may add approved `editorial_cartoon` and `essay_illustration` assets after that baseline; each new canonical asset must add exactly one resolver alias. The focused cleanup keeps 316 compact, referenced Medium JPEG/JPG files under `static/images/medium`; those files remain ordinary static fallbacks because responsive conversion would increase deployed bytes. It removes 50 unreferenced Medium files and leaves no Medium PNG/GIF or Syd-and-Oliver source artwork under `static/`. Five managed originals remain intentionally unreferenced: three supplemental essay photos and two unique legacy PNG illustrations. They use `usage_state: retained_unreferenced`; every other managed asset uses `usage_state: referenced`. Healthy assets require `review_state: approved` before release; the one corrupt quarantine uses the explicit rejected state described below.

One malformed supplemental legacy JPG is quarantined as `processing_state: source_only_unprocessable`, `review_state: rejected_corrupt_source`, and `usage_state: retained_unreferenced`. It keeps one historical alias but may never be referenced, rendered, or copied into production. Every other asset must be `processing_state: derivative_capable` and `review_state: approved`; every referenced asset must be derivative-capable. The rejected raw original remains only as provenance and recovery evidence.

Aliases are resolver inputs, not redirects. Retired raw PNG/JPEG URLs are allowed to return 404. An alias must resolve directly to a canonical asset and must not create a second source copy.
The 459-source and 500-alias counts are focused-cleanup release baselines. Future registered artwork must advance the manifest deliberately, stay approved before release, and preserve the one-new-alias-per-new-asset relationship. Unexplained baseline loss or alias drift fails validation.

The manifest and its three tracked review/build evidence files use one cross-platform byte contract: strict UTF-8 without a byte-order mark, LF line endings, and exactly one final LF. Current manifest-linkage SHA-256 values are computed from those canonical bytes; the visual-review report's `manifest_sha256_before_review` remains a historical pre-approval value and is not reinterpreted by this contract. The shared writer normalizes output before an atomic replacement, `.gitattributes` preserves LF checkouts, and the source contract rejects BOMs, invalid UTF-8, CRLF/lone-CR bytes, or an incorrect final-newline state. Binary artwork hashes remain raw file-byte hashes and are never text-normalized.

## Authoring references

Use logical references instead of source paths:

- Front matter and data: `editorial/example-slug`, `essays/example-slug/hero`, or `medium/<sha256>`.
- Markdown: `![Alternative text](oip-image:essays/example-slug/hero)`.
- External and explicitly nonmanaged static images retain normal URL behavior.

Never write `/images/originals/` into content, data, layouts, or metadata. Never copy a managed original into `static/`. Supported publishing and import tools must write one source under `assets/images/originals/`, register it in the manifest, and return the stable ID used by content.

### Focused legacy migration

The R2 migration command is dry-run by default:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\migrate_focused_legacy_images.ps1
```

Apply the validated plan only with the explicit mutation switch:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\migrate_focused_legacy_images.ps1 -Write
```

The command enumerates tracked files with NUL-delimited Git output, uses actual file-byte SHA-256 values, and supports Windows paths longer than 260 characters. It must reconcile the frozen 471-file baseline into exactly 105 Medium PNG migrations, four Syd-and-Oliver hero migrations, 316 retained JPEG/JPG files, and 50 unreferenced removals. Counts are not sufficient: fail-closed preflight also matches frozen SHA-256 digests over ordinally sorted `path<TAB>actual_sha256<LF>` rows for the complete 471-file Medium fleet and four-file Syd fleet. Fifteen legacy filenames differ from their actual byte hashes; actual hashes always define managed IDs and source filenames. The write path stages every replacement in a temporary transaction and performs one rollback-capable atomic replacement only after all source, manifest, alias, and content checks pass.

`WEB-LEGACY-IMAGE-CLEANUP-001-R2` corrects only the 32 rewritten-content evidence hashes. Their declared basis is `strict_utf8_bom_preserved_crlf_and_cr_to_lf_terminal_newlines_preserved_sha256`: decode the complete byte stream as strict UTF-8, reject invalid byte sequences, preserve a leading UTF-8 BOM as part of the canonical bytes, normalize CRLF and lone CR to LF, preserve all other code points and the exact terminal-newline presence/count, re-encode without an implicit preamble, and hash those bytes. The migration producer and source contract call the same byte-level helper for baseline Git blobs, staged output, committed Git blobs, and materialized checkouts. Binary image hashes remain exact raw-byte hashes.

The migration deliberately excludes compact Medium JPEG/JPG files, books, social cards, Paper-Bob, Idle Times, and the author portrait. Those assets must remain byte-identical to the bound baseline.

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

- prepared Pages payload no more than 900 MiB;
- `public/images` no more than 800 MiB;
- no derivative larger than 1 MiB;
- no more than 5,000 generated images;
- no more than 6,500 total public files;
- zero managed source bytes or migrated editorial/essay raster originals in `static/` or `public/`; and
- valid AVIF, WebP, and JPEG signatures, dimensions, MIME declarations, responsive descriptors, and source-hash URL prefixes.

The earlier focused-cleanup acceptance ceiling and live-baseline savings check were retired after the migration completed. The standing limits now preserve a 100 MiB reserve beneath [GitHub Pages' supported 1 GiB deployment ceiling](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): 800 MiB for `public/images` within a 900 MiB prepared Pages payload.

## Validation and visual review

Run the source gate before Hugo so stale hashes, dimensions, aliases, source copies, or unapproved review states fail early:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_source_contract.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_focused_legacy_image_migration.ps1
```

During migration only, a maintainer may run the same structural checks while review states remain pending:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_source_contract.ps1 -AllowPendingReview
```

`-AllowPendingReview` is local-only. It does not skip schema, source, hash, dimension, alias, reference, deduplication, or storage checks. CI and publication gates must omit it, require every derivative-capable asset to have `review_state: approved`, and require the sole corrupt quarantine to retain `review_state: rejected_corrupt_source`.
The sole `rejected_corrupt_source` quarantine is not a review bypass: it is fail-closed, cannot enter the rendering model, and must remain absent from public output.

After a production build, run the generated-output gate:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_output_contract.ps1 -SiteDir public
```

Generate local 100% review sheets that cover all 109 focused-cleanup migrations, comparing the original, largest WebP, and largest AVIF. Review the deterministic high-risk subset again at 200%. The full review surface may include the focused-cleanup baseline and later routine managed artwork. Deep-review at least 24 focused high-risk images covering charts, maps, fine text, crosshatching, faces, dark tones, saturated colors, unusual aspect ratios, the largest sources, and all four Syd-and-Oliver heroes. Review sheets are local evidence and do not belong in the Pages artifact.

Initialize the deterministic pending review record once:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\promote_focused_image_review.ps1 -InitializeEvidence
```

This creates `reports/focused-image-visual-review.json` with the exact 109-asset cohort and the deterministic release-specific deep-review set, but no PASS claim. The deep set contains at least 24 of the 109 migrations, all four Syd heroes, and focused examples of charts, maps, fine text, portrait/tall layouts, extreme aspect ratios, dark tones, saturated colors, and the largest sources. Older R3 carryovers may remain on the shared review surface, but they never satisfy this release's `focused_deep_review_count`. After review, record the reviewer/date, all reviewed IDs, completed methods, zero-failure decode result, any justified detail-quality overrides, and `review_state: pass`. Validate without mutation, then perform the one bounded promotion:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\promote_focused_image_review.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\promote_focused_image_review.ps1 -Write
```

The write refuses pending or stale evidence. It may promote only IDs frozen in the focused-cleanup inventory, updates the manifest, candidate report, and aggregate visual-review evidence atomically, and rolls all three back if any replacement fails. Existing reviewed assets are never demoted or modified.

Focused-cleanup aggregate review evidence remains cumulative for the baseline: decode sanity covers its 458 derivative-capable assets (the prior 349 plus 109 focused migrations), and aggregate deep-review coverage records all 44 selection rows from that review pass. The nested `focused_cleanup_review` record separately binds this release's 109 reviewed assets and 31 focused deep-review rows, so earlier carryovers cannot satisfy the focused gate or disappear from the aggregate. Later routine artwork is approved through its publishing package review before release.

Browser review covers the homepage, Gallery, Almanack, representative essays, Affirmations, and Medium imports at desktop, 390px, and 320px; both themes; keyboard navigation; 200% zoom; lightboxes; and network requests.
