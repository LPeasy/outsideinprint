# Article rendering repair — September 18, 2026

## Scope

Audited every reading-source file, not only the articles reported by the owner:
262 essays (including dialogues, Musings, and Affirmations), one working paper,
four book samples, and 19 Almanack issues: **286 files**. This inventory contains
no drafts or scheduled reading sources. The rendered-text scan covered all 266
`piece-body` surfaces, including informational pages using that wrapper.

Image reconciliation covered 538 Markdown positions, five shortcode positions,
and 255 front-matter references: **798 references**. All 465 unique referenced
managed originals passed hash, approval-state, and processing-state inspection.
The remaining images use existing local static files; no external image
dependencies or missing image assets were found.

## Repair ledger

| Article slug | Formatting-only correction | New edition |
| --- | --- | --- |
| `the-max-mistake-why-hbos-name-change-backfired` | Three escaped image-closing delimiters | 1.4 / Fifth |
| `david-attenborough-how-one-quiet-voice-made-the-whole-world-listen` | Four escaped image-closing delimiters; normalize one imported apostrophe in an image label and caption | 1.3 / Fourth |
| `who-is-pascal-siakam` | Two escaped image-closing delimiters | 1.3 / Fourth |
| `the-waters-rising-what-the-data-really-says-about-extreme-weather` | Escaped heading emphasis | 1.4 / Fifth |
| `what-i-learned-from-writing-100-essays-on-medium-in-2025` | Three escaped emphasis endings; normalize imported quote characters in two captions | 1.3 / Fourth |

Each article records the correction in its revision history. Article wording,
figures, citations, image sources, original dates, collections, and URLs remain
unchanged. Quote normalization satisfies the existing legacy-import preflight;
Hugo retains typographic quotes in the rendered text.

## Cause and prevention

The image-recovery helper split captions at a pipe without removing its Markdown
escape first. The resulting trailing backslash escaped the image's closing
bracket. The repaired helper derives plain caption text and safely escapes alt
text. Unit coverage includes escaped pipes, explicit alt, brackets, backslashes,
and empty alt.

The existing public HTML test now scans every `piece-body` for recognizable raw
Markdown image/link syntax outside code examples and non-visible content.
Focused assertions preserve the HBO, Attenborough, and Siakam image sequences
and the four repaired emphasis positions. Negative testing against the earlier
build detected all six remaining image defects; HBO was already repaired in
that earlier local build.

No additional malformed links, headings, tables, footnotes, entity residue, or
shortcode leaks were confirmed. Intentional caption pipes, quotation brackets,
`RMP*Comp`, and code examples were not treated as defects. This was a rendering
audit, not a factual re-review or external-link crawl.

## Separate accessibility follow-up

There are 88 rendered empty image `alt` attributes across 23 essays. These are
valid markup, not failed images. A separate contextual review should determine
which images are decorative and which need descriptions; this batch does not
invent descriptions or change those images. Missing alt attributes: zero.

## Validation and delivery

The batch uses pinned Hugo Extended 0.164.0 and the existing PowerShell gates:
changed-essay guardrails with accepted philosophy-audit evidence, image-source
and image-output contracts, imported-media helper tests, fresh public HTML,
and route smoke. Existing nonblocking caption/heading-style warnings are not
silently rewritten. No editorial-audit evidence or gate exemptions were added.

Local production output is `/tmp/oip-article-batch.eMRLrr/site`. All listed local
gates passed, including the site-wide scan of 266 rendered article bodies.
The owner authorized publication of the complete batch on September 18, 2026;
the release commit and its GitHub Actions run provide the deployment record.
