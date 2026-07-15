# Publishing Workflow

This is the canonical process for publishing new public content on Outside In Print.

- Editorial policy lives in `PUBLISHING_POLICY.md`.
- Repo-local session instructions live in `AGENTS.md`.
- The governing OIP editorial philosophy lives at `editorial/oip_editorial_philosophy.md`.
- The goal of this workflow is a clean web-first publish path that uses repo-local tooling, catches content residue early, and deploys through `main`.

## Toolchain bootstrap

Bootstrap the pinned repo-local toolchain before local publishing work:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\bootstrap_toolchain_assets.ps1
cmd /c "call tools\generate_tool_wrappers.cmd && call tools\provision_toolchain.cmd && call tools\validate_toolchain.cmd"
```

Use the generated wrappers under `tools\bin\generated\` for local commands after bootstrap.

Current pinned contract:

- Node `20.20.2`
- Hugo `0.157.0`
- PowerShell `7.5.0`
- Python `3.12.9`

## Default flow for new content

The default publishing path is essay-first.

1. Scaffold a new essay draft:

   ```powershell
   .\tools\bin\custom\new-essay.cmd --title "My Title"
   ```

2. Optional fallback if you need raw Hugo generation:

   ```powershell
   .\tools\bin\generated\hugo.cmd new essays/my-title.md
   ```

3. Write in the supported Markdown subset and keep `draft: true` while drafting.
4. Flip to `draft: false` only when the piece is ready for publish review.

The essay scaffold is the preferred path because it creates the expected metadata block, slug, and starter structure.

## Metadata and discovery decisions

For non-draft public pieces, complete the core publication metadata:

- `title`
- `date`
- `section_label`
- `version`
- `edition`
- `draft`
- `description` for published essays

Use these discovery controls deliberately:

- `featured: true` for curated front-page placement
- `homepage_rank: 1-8` for ordered homepage placement
- `collections` for explicit membership in curated reading lanes
- `collection_weight` when you want controlled ordering inside a collection

If an essay uses a lead image, treat front matter as the canonical source:

- set `featured_image`
- set `featured_image_alt`
- set `featured_image_caption` when attribution or caption text is needed
- do not repeat the same image as the first body image

Version discipline is manual. Bump `version` for material changes to body copy, title/subtitle, or citation-relevant metadata.

If a piece belongs in an existing collection, add explicit `collections` front matter. If you are launching a new collection:

1. Add it to `data/collections.yaml`.
2. Create `content/collections/<slug>.md` if it should have a public page.
3. Add explicit collection membership to the relevant pieces.
4. Run:

   ```powershell
   .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_collections.ps1
   ```

5. Verify `/collections/`, the collection page, and member pages in a local build.

Essays are the first-class publishing workflow. Reports and working papers can still be published manually and must pass the Editorial Philosophy Audit before publication. Syd & Oliver dialogue/fiction pieces do not use this hard gate unless a specific piece is explicitly treated as public-judgment work.

## Musings

Musings are short source-free reflections, not ordinary evidence-driven essays. Create them under content/essays/musings/ with section_label: "Musing", library_type: "musing", collections: ["musings"], source_mode: "SOURCE_FREE", and external_factual_claims: "none".

Musings never require citations, a research package, or an OIP-99 report because the lane carries no external factual claims. If a sentence needs factual support, it is not a Musing and must move to an evidence-controlled lane or be recast as personal reflection. A public Musing still needs a concise description and either a social image or an explicit image exemption with a reason. The standard cleanup, accessibility, and site validation checks remain required. See [editorial/musings-series-contract.md](../editorial/musings-series-contract.md).

## Syd & Oliver dialogue packages

Every new Syd & Oliver dialogue package must include:

- a Markdown source file under `content/essays/dialogues/<slug>.md`, with its canonical `/syd-and-oliver/<slug>/` URL;
- `library_type: 'dialogue'`, `collections: ['syd-and-oliver-dialogues']`, a concise `description`, `version`, and `edition`;
- a scene-matched hero depicting Syd and Oliver as two anonymous silhouettes, saved at `static/images/syd-and-oliver/<slug>/hero.png` and referenced by `featured_image`;
- precise `featured_image_alt` text that describes the actual scene without identifying either man; and
- `draft: true` by default. Change it only when the user explicitly asks for a publication-ready package or publication.

Use a landscape hero that remains legible as the site's narrow desktop side plate and as a full-width mobile image. Do not put a duplicate hero image in the body. Inspect generated or supplied art before use; do not use visible faces, readable text, logos, watermarks, or unrelated focal subjects. This requirement applies to new packages only and does not require a retrofit of published dialogues.

## Local preview and publish validation

Run the target-file guardrail before a full build:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md
```

For publication-ready essays, reports, and working papers, require Editorial Philosophy Audit evidence:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md -RequireEditorialPhilosophyAudit
```

Use the same flag with `content\reports\<slug>.md` or `content\working-papers\<slug>.md` for those sections. Accepted evidence is a per-piece OIP-99 report under `docs/editorial-audits/99-refinement/`, a daily backfill ledger/report entry for the slug, or a compact COA2 ledger/report entry under `docs/editorial-audits/coa2-value-review/` for COA2 review work. Per-piece reports must show `Decision: PASS` and PASS rows for Evidence, Logic, Incentives, Tradeoffs, Consequences, Uncertainty, and Institutional Behavior. Ledger-backed evidence must include an `editorial_philosophy` PASS object and a matching report with the same PASS rows.

During drafting, preview locally with:

```powershell
.\tools\bin\generated\hugo.cmd server -D
```

Before publishing, run the normal local publish gate:

```powershell
.\tools\bin\generated\hugo.cmd --gc --minify
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild
```

What this gate is meant to catch:

- changed-essay residue and missing descriptions
- missing Editorial Philosophy Audit evidence for changed non-draft essays, reports, and working papers
- forbidden `that matters` phrasing and discouraged adverbial `still` constructions in changed public prose
- hero/frontmatter conflicts such as placeholder heroes, missing heroes with real early lead images, and duplicate hero/body lead images
- broken public routes
- generated HTML regressions
- CI-only Node/browser regressions remain delegated to GitHub Actions and are not forced through local npm.

## Publish path through main

Publishing happens through `main`.

1. Commit the validated content changes.
2. Push or merge to `main`.
3. `.github/workflows/deploy.yml` runs the contract tests, changed-essay guardrails, Hugo build, generated-output checks, and GitHub Pages deploy.

There is no separate manual publish step after `main` is updated. `main` is the publish action.

## Future-dated publishing

Future-dated essays can be committed to `main` before release. Keep `draft: false`, set `date` to the public article date, set `publishDate` to the intended release time, and leave the production Hugo build as `hugo --gc --minify` without `--buildFuture`. Hugo excludes future-dated content from the public build until the release time has passed.

Use explicit Eastern-time timestamps for timed releases:

```yaml
date: 2026-05-29
publishDate: 2026-05-29T08:00:00-04:00
```

Date-only releases are interpreted in the site timezone, which is `America/New_York`. The deploy workflow also sets `TZ: America/New_York` and runs one scheduled GitHub Actions rebuild per day at 12:17 AM Eastern, so a dormant daily post appears on the first successful scheduled deploy after its `publishDate` becomes eligible. GitHub scheduled workflows are not exact-to-the-minute; use `workflow_dispatch` for a manual immediate release if timing is critical.

For the current daily-essay queue, set one essay per publishing day:

```yaml
date: 2026-05-29
publishDate: 2026-05-29T00:00:00-04:00
```

Multiple future essays may sit on `main` at the same time. Hugo will only build the ones whose `date` and `publishDate` are no longer future values. If two queued essays share the same eligible publish day, both will publish on that day's scheduled deploy.

To inspect the dormant queue locally:

```powershell
.\tools\bin\generated\hugo.cmd list future
```

Future-dated front-page cartoons use the same daily rebuild, but the source of truth is `data/editorial_cartoons.yaml` instead of essay front matter. A queued cartoon entry may include:

```yaml
  - slug: scenario-cartoon
    title: "Scenario Cartoon"
    date: "2026-05-29"
    publishDate: "2026-05-29T00:00:00-04:00"
    image: "/images/editorial/scenario-cartoon.png"
    essay: "/essays/the-scenario-that-ate-the-future/"
```

The public homepage, gallery, home metadata image, and essay-card cartoon thumbnails ignore future cartoon entries until `publishDate` or `date` is eligible. The current-cartoon selector falls back to the newest eligible cartoon when `current` points to a future queued entry, so multiple queued cartoons can sit on `main`.

Queued cartoons must name the intended essay with `essay: "/essays/<slug>/"`. The cartoon schedule contract verifies that linked essays exist, are not drafts, and publish no later than the cartoon. If a cartoon is intentionally standalone, do not future-queue it without explicit editorial approval.

For a local preview of future queued cartoons, set the explicit preview environment variable before the Hugo command:

```powershell
$env:HUGO_BUILD_FUTURE_CARTOONS = "true"
.\tools\bin\generated\hugo.cmd --gc --minify --buildFuture
Remove-Item Env:\HUGO_BUILD_FUTURE_CARTOONS
```

For local preview of a future-dated essay, use `--buildFuture` deliberately:

```powershell
.\tools\bin\generated\hugo.cmd --gc --minify --buildFuture
```

Do not add `--buildFuture` to the production deploy workflow. That flag is only for preview and validation of future content before its public time.

## Non-ideal paths and exceptions

Avoid treating these as the default path:

- PDFs are paused. They are not part of the public publishing workflow, and deploy removes public PDF artifacts.
- Medium migrations should use the import path, not manual paste-in authoring:

  ```powershell
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\import_medium_export.ps1 -ZipPath "C:\path\to\medium-export.zip" -DryRun
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\import_medium_export.ps1 -ZipPath "C:\path\to\medium-export.zip"
  .\tools\bin\generated\python.cmd .\scripts\normalize_legacy_medium_essay.py --write .\content\essays\some-piece.md
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_legacy_essays.ps1
  ```

- For existing essays with hero/body conflicts, use the repo-local normalizer instead of hand-copying image fields:

  ```powershell
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\normalize_essay_hero_images.ps1
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\normalize_essay_hero_images.ps1 -Write
  ```

  This pass promotes deterministic early lead images into `featured_image`, localizes remote Medium images into `static/images/medium/<slug>/`, migrates short caption/source lines into `featured_image_caption`, and removes promoted duplicates from the article body.

- Analytics snapshot refresh is separate from public content publishing. Dashboard publishing is paused and no dashboard build is part of the public reading-site workflow.
- Do not rely on raw HTML, copied Medium formatting, duplicated title/dek in the body, or improvised separators. The essay guardrails are specifically meant to catch those problems.
