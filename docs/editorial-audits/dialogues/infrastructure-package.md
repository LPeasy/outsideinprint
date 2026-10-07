# Infrastructure publication package

Prepared: 2026-10-07, America/New_York. Publication requested by the owner; this record accompanies the release. Deployment and live verification are recorded separately.

Canonical route: `/syd-and-oliver/infrastructure/`.
Collection: `syd-and-oliver-dialogues`.
Edition: 1.0, First web edition.
Branch: `codex/infrastructure-20261007`.
Base: `621f4831c9fec021b34200d2652cb0e21ebff74f`.

## Copy preservation

The owner supplied the complete manuscript in conversation and requested no major editorial changes. All 274 body paragraphs, words, punctuation, action beats, and the ending are preserved. Added 130 bold Syd/Oliver speaker labels. Existing narrative attributions and other speakers remain as supplied. The ambiguous turn “Other way.” remains unlabeled rather than assigning a speaker not specified by the manuscript. Removing the added labels exactly recovers the supplied body.

The title appears in front matter only. Added route, date, collection, edition, description, hero, and alt metadata. No sources, moral, or factual-review appendix were added. Dialogue fiction is outside the essay/philosophy-audit gate.

Source copy: `C:/Users/lawto/Documents/40_Scratch/2026-10/syd-and-oliver-infrastructure/source.txt`.
Source file SHA-256: `f52bec4bba9916d59ffe873dc21f2c7a3f6ad423f95df66fa8109482a5cffe84`.
Exact-copy evidence: `copy-verification.json` in the same scratch directory.

## Supplied artwork

Owner source: `C:/Users/lawto/.codex/codex-remote-attachments/01a11271-715c-7342-917e-dcf36f8709e0/EA5D49EC-21BC-42EE-B08C-DDC73F0425C7/1-Photo-1.jpg`.
Canonical original: `assets/images/originals/essays/dialogues/infrastructure/hero.jpg`.
Managed ID: `essays/dialogues/infrastructure/hero`.
Alias: `/images/syd-and-oliver/infrastructure/hero.jpg`.
Dimensions: 1280 × 853 pixels.
SHA-256: `c2d6bfa741ed11de807fe7fa8c6c282a9e02d4d4bedfe9c30b436e27e267645c`.
Class/hint: `essay_illustration` / `drawing`.

The supplied JPEG is unchanged. Direct visual review passed: two men fold a table in a warm parish hall while an older man hands keys to a woman at the open doorway. The scene, table, keys, diners, and kitchen fit the story. Alt text describes the visible scene. No generation or edit prompt applies. Registered with the repository registrar and approved only this asset; normalized its derivative-capable `processing_note` to literal null. The article, Gallery, and current front-page illustration reuse the same managed asset.

## Release scope and validation

Seven files comprise the release: article, original JPEG, image manifest, Gallery data, this record, and two test files. The two SEO dialogue-count assertions and the dialogue-feed count change from 20 to 21. No templates or image-processing code change.

The current repository source-only publication policy governs local validation. CI owns the complete production image build, output contracts, and deployment. Final live checks cover the article text and hero, Gallery link and current image, front-page placement, collection membership, feed, and desktop/mobile layout.

Completed source checks:

- Independent editorial verification: all 274 paragraphs and 130 speaker attributions pass; zero word or punctuation changes.
- Gallery schedule contract: PASS, including dialogue artwork reuse.
- Feed policy source contract: PASS.
- SEO route/schema source tests: all six PASS.
- Collection source audit: 21 Syd and Oliver pieces, no membership violations. The tiny collection organization fixture passed with pinned Hugo 0.164.0: 17 related maps and three grouped collections.
- Targeted image verification: PASS for original bytes, SHA-256, 1280 × 853 dimensions, one alias, approval, and literal null processing note. Existing assets, aliases, and defaults are unchanged.
- Target-file essay guardrail: correctly returned “no target files to check” because dialogue fiction is excluded; this is an exemption, not a substantive essay-audit PASS.
- Staged whitespace check: PASS.

Detailed source and live evidence is saved under the task scratch directory. All local source gates completed before the release commit. Current live formatting was compared against the collection and With Ice Cream; the prepared live verifier also checks the complete manuscript after deployment.

## Live review and Gallery correction

Initial publication commit `8e5c44453a2c01e41fb23f4ffb187a4d32956fd9` deployed successfully in workflow run `37651074994`. Live verification confirmed every supplied paragraph and punctuation mark, 130 labels, the responsive hero, Gallery/current link, homepage latest placement, collection membership, and the 21-item dialogue feed. Article screenshots at 1440 × 1000 and 390 × 844 show a loaded, uncropped hero and no horizontal overflow.

Visual review found that the Gallery spotlight's oversized image left too little room for the Infrastructure headline. At the owner's request, the current illustration now uses the same equal-column layout, 1.85rem column gap, and 640px stacking breakpoint as the archive images. The normal headline size is preserved, with long-word wrapping available. The supplied JPEG, its full 3:2 composition, and all manuscript text are unchanged.

The Gallery template's responsive image sizing hints now describe the matching current/archive widths. The existing source contract was updated for the equal-column layout; all 28 site-chrome and layout-ownership tests passed. A local browser preview used captured production Gallery HTML, its production stylesheet, and the exact changed worktree Gallery rules. At 390, 640, 641, 768, 900, 901, 1024, 1440, and 1920 pixels, the current and archive images match in width within one pixel, the headline fits and clears the image, the original image loads, and the page has no horizontal overflow. At 1440 pixels the image is about 368 pixels wide, reduced from about 532 pixels. This is a targeted layout preview, not a full local image-library rebuild. Preview evidence is in `gallery-resize-preview-results.json`; final deployed checks accompany the resize release receipt.
