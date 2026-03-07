# Outside In Print Publishing Policy v1

## Purpose
This policy defines the minimum editorial and technical standards for publishing a digital imprint edition (web page + PDF) from a single Markdown source.

## Scope
Applies to all non-draft content in:
- `content/essays/`
- `content/literature/`
- `content/reports/`
- `content/working-papers/`

Section index files (`_index.md`) are excluded from edition checks.

## Canonical Model
One Markdown file produces two synchronized artifacts:
- Web artifact: Hugo page
- Print artifact: Typst PDF at `static/pdfs/<slug>.pdf`

Each published piece is treated as an edition object, not a blog post.

## Tradeoff Decisions (Locked for v1)
1. PDF generation policy: Build all PDFs on every push to `main`.
2. Metadata strictness: Hard-fail missing required publication metadata.
3. Version discipline: Manual version bumps are required for material edits.
4. Content scope: Constrained Markdown subset for renderer parity.

## Required Front Matter (Non-Draft Pieces)
- `title`
- `date`
- `slug` (optional override; if omitted, filename slug is used)
- `section_label`
- `version`
- `edition`
- `pdf`
- `draft`

Optional fields:
- `subtitle`
- `description`
- `featured`

## PDF Path Rule
`pdf` must equal:
- `/pdfs/<slug>.pdf`

And the generated file must exist at:
- `static/pdfs/<slug>.pdf`

## Versioning Rule
`version` must be manually bumped for any material change to:
- body content
- title or subtitle
- citation-relevant metadata (`author`, `date`, `edition`)

Suggested convention:
- major changes: `2.0`, `3.0`, ...
- editorial or substantive revisions: `1.1`, `1.2`, ...

## Supported Markdown Subset (v1)
Allowed and expected:
- headings (`#` to `###`)
- paragraphs
- ordered and unordered lists
- blockquotes
- links
- images
- fenced code blocks
- footnotes

Anything outside this subset should be treated as experimental and must not be relied on for production parity until tested in both Hugo and Typst outputs.

## CI Enforcement Requirements
CI must fail when any non-draft piece violates these checks:
1. Missing required front matter fields.
2. `pdf` field does not match `/pdfs/<slug>.pdf`.
3. Expected `static/pdfs/<slug>.pdf` is missing after PDF build.
4. Hugo build fails.

CI workflow order:
1. Build all PDFs.
2. Run preflight validation gates.
3. Build Hugo site.
4. Deploy Pages artifact.

## Local Author Workflow
1. Create/edit content Markdown file.
2. Ensure required front matter is complete.
3. Run local PDF builder.
4. Run preflight script.
5. Review web + PDF artifacts.
6. Commit and push to `main`.

## Change Control
Policy changes require explicit update to this file in the same PR as any CI rule changes.



