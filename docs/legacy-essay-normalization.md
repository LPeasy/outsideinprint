# Legacy Essay Normalization

Outside In Print treats imported essays as editorial source material, not as finished publication files. The workflow below is designed to make legacy imports readable, auditable, and batchable without silently rewriting meaning.

## Workflow

1. Run the legacy audit.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\audit_legacy_essays.ps1
```

This generates:

- `reports/legacy-essay-audit.json`
- `reports/legacy-essay-audit.csv`
- `reports/legacy-essay-audit.md`

2. Start with `batch_1` pieces that are also surfaced on the homepage, homepage reading threads, or featured collections.

3. Apply safe structural cleanup first.

```powershell
.\tools\bin\generated\python.cmd .\scripts\normalize_legacy_medium_essay.py --write .\content\essays\some-piece.md
```

The normalizer is intentionally conservative. It is safe for repeated use on Medium-style imports that still contain wrapper HTML, duplicated lead metadata, obvious mojibake, stripped link-card remnants, `[Embedded media: ...]` placeholders, and loose image/source caption lines that should be expressed in the article-body patterns already supported by Hugo.

4. Normalize essay hero conflicts before final review.

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\normalize_essay_hero_images.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\normalize_essay_hero_images.ps1 -Write
```

This pass uses `featured_image` as the canonical essay hero, localizes remote early lead images into `static/images/medium/<slug>/`, migrates qualifying caption/source lines into `featured_image_caption`, removes promoted duplicate body images, and emits:

- `reports/essay-hero-normalization.json`
- `reports/essay-hero-normalization.csv`
- `reports/essay-hero-normalization.md`

5. Finish each piece with a manual editorial pass for anything the script cannot infer safely.

6. Re-run the audit after cleanup so the queue reflects the new state.

7. Run the essay guardrails on the cleaned files before publishing changes.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\some-piece.md
```

## Priority Signals

The audit ranks pieces with these repo-local signals:

- `featured: true` for homepage-selected essays
- direct links from homepage editorial surfaces
- `start_here` essays from featured collections
- membership in featured collections
- membership in any collection
- newer imported pieces dated 2025 or 2026

These signals are combined with issue severity so high-surface essays with visible import residue rise to the top.

## Normalization Rules

Use these rules in order.

### Remove platform residue

- Remove clap, follow, subscribe, comment, and ?read more on Medium? CTA copy.
- Remove link-card boilerplate that exists only to recreate Medium embeds.
- Remove duplicated in-body title and subtitle blocks when the same information already exists in front matter and page chrome.

### Repair broken structure

- Convert imported wrapper HTML into plain markdown structure when the wrapper itself carries no meaning.
- Restore real headings where the source clearly intended sectional breaks.
- Convert manual bullets or numbered pseudo-lists into real markdown lists when the grouping is unambiguous.
- Keep ambiguous paragraph-only pseudo-headings for manual review instead of guessing.

### Normalize figures and sources

- Preserve images.
- Convert broken figure wrappers or stripped card embeds into plain markdown images and short captions when possible.
- Normalize italic caption lines after imported markdown images into either `Source:` paragraphs or blockquote captions so the article-body partial can render them consistently.
- Prefer concise captions, `Source:` lines, or short read-more bullets over scraped card remnants.
- Treat long source dumps as aftermatter and give them a heading when the piece clearly transitions into references.
- When the first body image is the real lead image, promote it into `featured_image` instead of leaving it duplicated at the top of the article.
- Do not keep `/images/social/outside-in-print-default.png` as a visible essay hero when a real early lead image exists.

### Repair text encoding and spacing

- Fix mojibake and broken punctuation.
- Separate jammed headings from preceding paragraphs.
- Separate collapsed sentences when import joins have clearly removed paragraph breaks.
- Do not rewrite sentences for taste; only restore legibility.

### Preserve meaning

- Keep substantive author notes that clarify methodology or scope.
- Remove promotional scaffolding from author notes.
- Flag unclear cuts for manual review instead of forcing an automated rewrite.

## Manual Review Triggers

A piece still needs hand cleanup when it contains any of the following after the normalizer runs:

- paragraph-only pseudo-headings that could be either headings or emphasized prose
- raw embed remnants that no longer map cleanly to a single source link
- long source clusters that need editorial grouping
- heavy paragraph-collision damage from import joins
- factual caveats embedded inside promotional aftermatter
- essays where an existing non-placeholder hero conflicts with a different early lead image
- essays where the first body image appears outside the strict early-lead heuristic window

## Batch Guidance

Use small batches. A good batch is 3 to 6 essays that share similar import damage. The recommended rhythm is:

- run audit
- clean one ranked batch
- re-run audit
- move anything ambiguous into the manual-review queue

## Regression Check

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\test_legacy_essay_normalization.ps1
```
