# Publishing Workflow

This is the canonical process for publishing new public content on Outside In Print.

- Editorial policy lives in `PUBLISHING_POLICY.md`.
- Repo-local session instructions live in `AGENTS.md`.
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

Essays are the first-class publishing workflow. Dialogues, reports, and working papers can still be published, but they do not currently have the same scaffold and guardrail path as essays.

## Local preview and publish validation

Run the target-file guardrail before a full build:

```powershell
.\tools\bin\generated\npm.cmd run check:essays -- -Paths .\content\essays\my-title.md
```

During drafting, preview locally with:

```powershell
.\tools\bin\generated\hugo.cmd server -D
```

Before publishing, run the normal local publish gate:

```powershell
.\tools\bin\generated\hugo.cmd --gc --minify
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild
.\tools\bin\generated\npm.cmd test
```

What this gate is meant to catch:

- changed-essay residue and missing descriptions
- hero/frontmatter conflicts such as placeholder heroes, missing heroes with real early lead images, and duplicate hero/body lead images
- broken public routes
- generated HTML regressions
- Node/browser test regressions

## Publish path through main

Publishing happens through `main`.

1. Commit the validated content changes.
2. Push or merge to `main`.
3. `.github/workflows/deploy.yml` runs the contract tests, changed-essay guardrails, Hugo build, generated-output checks, and GitHub Pages deploy.

There is no separate manual publish step after `main` is updated. `main` is the publish action.

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

- Analytics and dashboard publishing are separate workflows. The public reading site does not publish the dashboard.
- Do not rely on raw HTML, copied Medium formatting, duplicated title/dek in the body, or improvised separators. The essay guardrails are specifically meant to catch those problems.
