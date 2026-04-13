# Outside In Print Publishing Policy

## Purpose

This policy defines the current editorial and technical standards for publishing a web publication from a single Markdown source.

## Scope

Applies to all non-draft content in:

- `content/essays/`
- `content/reports/`
- `content/working-papers/`

Section index files (`_index.md`) are excluded.

## Canonical model

One Markdown file produces one public artifact:

- Web artifact: Hugo page

Each published piece is treated as a durable publication record, not a blog post.

## Tradeoff decisions

1. Web-first publishing: the public site centers on the reading experience of the page itself.
2. Metadata discipline: published pieces should carry stable publication metadata.
3. Version discipline: manual version bumps are required for material edits.
4. Content scope: authors should prefer a constrained Markdown subset that renders cleanly on the web.

## Required front matter for non-draft pieces

- `title`
- `date`
- `slug` (optional override; if omitted, filename slug is used)
- `section_label`
- `version`
- `edition`
- `draft`

Optional fields:

- `subtitle`
- `description`
- `featured`
- `homepage_rank`

## Versioning rule

`version` should be manually bumped for any material change to:

- body content
- title or subtitle
- citation-relevant metadata (`author`, `date`, `edition`)

Suggested convention:

- major changes: `2.0`, `3.0`, ...
- editorial or substantive revisions: `1.1`, `1.2`, ...

## Supported Markdown subset

Allowed and expected:

- headings (`#` to `###`)
- paragraphs
- ordered and unordered lists
- blockquotes
- links
- images
- fenced code blocks
- footnotes

Anything outside this subset should be treated as experimental until it has been reviewed in the live web output.

## CI enforcement requirements

Current CI must fail when:

1. The CI contract drifts from the repo's documented tooling assumptions.
2. The Hugo build fails.
3. The generated public HTML fails regression checks.

## Local author workflow

1. Create a draft with `.\tools\bin\custom\new-essay.cmd --title "My Title"` or edit an existing content Markdown file.
2. Ensure required front matter is complete.
3. Run the applicable target-file guardrails.
4. Build Hugo locally.
5. Review the relevant web pages.
6. Run the applicable tests.
7. Commit and push to `main`.

## Paused work

The PDF workflow is paused and outside the current publishing contract.

## Change control

Policy changes require an explicit update to this file in the same PR as any related CI or publishing-rule changes.
