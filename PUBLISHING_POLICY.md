# Outside In Print Publishing Policy

## Purpose

This policy defines the current editorial and technical standards for publishing a web publication from a single Markdown source.

The governing editorial philosophy lives in `editorial/oip_editorial_philosophy.md`. Published work should reflect disciplined independence: judgments must be earned through evidence, logic, incentives, tradeoffs, consequences, institutional behavior, and honest uncertainty.

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

## Editorial Philosophy Gate

New essays, new reports, new working papers, published revisions to those sections, and daily back-archive essay revisions must have acceptable Editorial Philosophy Audit evidence before publication. Syd & Oliver dialogue/fiction pieces are excluded from this hard gate unless a specific piece is being treated as public-judgment work. Accepted evidence is either:

- `docs/editorial-audits/99-refinement/<slug>-99-refinement-report.md` with `## Editorial Philosophy Audit`, `Decision: PASS`, and PASS rows for Evidence, Logic, Incentives, Tradeoffs, Consequences, Uncertainty, and Institutional Behavior
- a daily backfill ledger/report entry for the slug with `editorial_philosophy.status` set to `PASS` and all seven test fields set to `PASS`

The target-file guardrail flag is:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md -RequireEditorialPhilosophyAudit
```

Use the same flag with `content\reports\<slug>.md` and `content\working-papers\<slug>.md` when publishing or revising reports and working papers.

Optional fields:

- `subtitle`
- `description`
- `featured`
- `homepage_rank`

## Versioning rule

`version` should be manually bumped for any public change to:

- body content
- title or subtitle
- citation-relevant metadata (`author`, `date`, `edition`)
- image assets, formatting, link repairs, or other visible corrections

Suggested convention:

- minor corrections: increment the decimal, such as `1.0` to `1.1`
- major copy revisions: increment the whole number and reset the decimal, such as `1.0` to `2.0`
- mixed revisions: use the major rule when any body-copy or argument change is present

Every version bump must also advance `edition` by one ordinal label, such as `First web edition` to `Second web edition`. The original `date` remains unchanged unless the original publication date itself was wrong.

For the full procedure, see [docs/existing-essay-revision-sop.md](docs/existing-essay-revision-sop.md).

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
