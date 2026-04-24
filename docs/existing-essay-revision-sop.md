# Existing Essay Revision SOP

Use this procedure when editing any already-published Outside In Print page under `content/essays/`, `content/reports/`, or `content/working-papers/`.

## Principle

Published pieces are durable web editions. A public edit must leave the archive record clear enough that a reader can cite the version they read.

The visible archive block is driven by front matter:

```yaml
date: 2026-04-24
version: "1.0"
edition: "First web edition"
```

The rendered block should continue to show the original publication date unless the original date itself was wrong. Revisions are disclosed through `version` and `edition`.

## Classify The Change

Use the smallest version change that honestly describes the edit.

- Minor correction: image repair, formatting fix, typo cleanup, broken-link repair, metadata correction, or layout-safe Markdown cleanup. Increment the decimal: `1.0` to `1.1`.
- Major copy revision: body rewrite, changed argument, new section, removed section, revised title/subtitle, changed conclusion, or other citation-relevant editorial change. Increment the whole number and reset the decimal: `1.0` to `2.0`.
- Mixed revision: if any major copy revision is present, use the major rule.

Every version change advances the edition ordinal by one, even for decimal changes.

Examples:

- `1.0` / `First web edition` plus image repair becomes `1.1` / `Second web edition`.
- `1.0` / `First web edition` plus body rewrite becomes `2.0` / `Second web edition`.
- `2.0` / `Second web edition` plus formatting fix becomes `2.1` / `Third web edition`.
- `2.1` / `Third web edition` plus major rewrite becomes `3.0` / `Fourth web edition`.

## Update The Front Matter

For the Gold Card essay copy revision, the archive block should become:

```yaml
date: 2026-04-24
version: "2.0"
edition: "Second web edition"
```

Do not change `date` for ordinary revisions. The date remains the original publication date used in citations and archive ordering.

## Revision Workflow

1. Start from current `origin/main` in a clean worktree. Do not revise in a dirty feature branch.
2. Read the current live Markdown file before editing.
3. Classify the revision as minor or major before changing front matter.
4. Update `version` and `edition` in the same edit as the content change.
5. Preserve stable fields unless deliberately changed: `slug`, `date`, `collections`, canonical image paths, and public URLs.
6. For copy revisions, run the OIP voice pass and the current AI-writing-tells cleanup before validation.
7. Build locally and inspect the rendered archive block on the changed page.
8. Verify the archive block shows the original `Date`, the new `Version`, and the new `Edition`.
9. Run the local publish gate used for content changes. Do not run local npm or npx checks for OIP revision work.
10. Publish only after reviewing the diff and confirming it contains the intended content, metadata, fixture, and asset changes.

## Validation Checklist

Before publishing a revised essay, confirm:

- The rendered page shows the expected `Date`, `Version`, and `Edition`.
- The citation block uses the new version.
- Existing images still resolve and are full-size when image assets are part of the change.
- Existing collection membership still renders correctly.
- `test_public_route_smoke.ps1` passes.
- `test_public_html_output.ps1 -RequireFreshBuild` passes after writing the public build manifest.

## Commit Message Pattern

Use a message that identifies the revision scope:

```text
revise: update <slug> to v2.0
```

For minor corrections:

```text
fix: update <slug> image assets to v1.1
```
