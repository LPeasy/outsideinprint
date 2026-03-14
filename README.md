# Outside In Print

A minimalist, print-forward Hugo site for publishing writing and **PDF editions**.

## Publishing policy

- See `PUBLISHING_POLICY.md` for the v1 publishing contract, tradeoff decisions, and CI enforcement rules.

## Local run

```sh
hugo server -D
```

## Publishing workflow

1. Create a new piece (example):
   - `hugo new essays/my-title.md`
2. Write, then set `draft: false` when ready.
3. Build PDF editions locally:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\build_pdfs_typst_local.ps1`
4. Run preflight:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\preflight.ps1`
5. Commit + push (push = publish once GitHub Pages is enabled).

## Metadata conventions

Each non-draft piece should include:

- `section_label`
- `version` (bump on material revision)
- `edition` (e.g., "First digital edition")
- `pdf` path: `/pdfs/<slug>.pdf`
- optional `featured: true` (shows on homepage)

## Imprint upgrade (print feel)

Single pages render an **edition header** plus a **Cite this** block so each page reads like a real imprint object, not a blog post.

## PDF edition generation (Typst)

Local:
- Install Typst + Pandoc.
- Run: `powershell -ExecutionPolicy Bypass -File .\scripts\build_pdfs_typst_local.ps1`

CI:
- GitHub Actions runs `scripts/build_pdfs_typst_ci.ps1` on every push to `main`.
- Flow: Markdown -> Pandoc (Typst writer) -> Typst compile -> `static/pdfs/` -> preflight -> Hugo build -> deploy.

## Verification commands

Expected pass (real content):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\preflight.ps1
```

Expected pass (fixture suite):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\preflight.ps1 -ContentRoot .\tests\fixtures\pass\content -PdfRoot .\tests\fixtures\pass\static\pdfs
```

Expected fail (fixture suite):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\preflight.ps1 -ContentRoot .\tests\fixtures\fail\content -PdfRoot .\tests\fixtures\fail\static\pdfs
```

## Medium migration (automated)

Dry run (classification + report only, no file writes):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_medium_export.ps1 -ZipPath "C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\medium-export-3-6-26.zip" -DryRun
```

Full import run (writes markdown + localized media):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_medium_export.ps1 -ZipPath "C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\medium-export-3-6-26.zip"
```

Rerun behavior:
- Existing target files are skipped and reported (`existing_target`).
- Slugs are stabilized via `reports/medium-slug-map.json`.

Post-import workflow:
1. Generate PDFs: `powershell -ExecutionPolicy Bypass -File .\scripts\build_pdfs_typst_local.ps1`
2. Flip selected imported essays from `draft: true` to `draft: false`
3. Run preflight: `powershell -ExecutionPolicy Bypass -File .\scripts\preflight.ps1`

Fixture test harness:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test_medium_import.ps1
```

## Essay integrity audit

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\audit_essay_integrity.ps1
```
## PDF build internals

- Shared PDF build runner: `scripts/build_pdfs_typst_shared.ps1`
- Local wrapper: `scripts/build_pdfs_typst_local.ps1`
- CI wrapper: `scripts/build_pdfs_typst_ci.ps1`


## Article-body conventions

For cleaner web and PDF rendering, prefer:

- true Markdown headings instead of standalone title-case paragraphs
- true ordered and unordered lists instead of manual bullets or numbered paragraphs
- `---` for thematic breaks instead of improvised separator strings
- image captions or source lines placed directly under the image
- no duplicated title or dek inside the body when front matter already carries them

## Collections

- Maintainer guide: `docs/collections-system.md`
- Audit/report script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\audit_collections.ps1
```

## Analytics

- Maintainer guide: `docs/analytics-system.md`
- Import normalized dashboard data:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_analytics.ps1 -InputPath .\imports\analytics
```

- Public site note:
  The public Outside In Print site does not publish the dashboard.
  Dashboard snapshots are built separately with `hugo-dashboard.toml` and published to `LPeasy/OutsideInPrintDashboard`.
