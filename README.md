# Outside In Print

A minimalist Hugo site for publishing essays, fiction, dialogues, and working papers as durable web publications.

## Publishing policy

- See `PUBLISHING_POLICY.md` for the current web-first publishing contract.

## Toolchain

Bootstrap the repo-local toolchain payloads, then generate/provision/validate the manifest-driven wrappers:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\bootstrap_toolchain_assets.ps1
cmd /c "call tools\generate_tool_wrappers.cmd && call tools\provision_toolchain.cmd && call tools\validate_toolchain.cmd"
```

The current toolchain contract is pinned to:

- Node `20.20.2`
- Hugo `0.157.0`
- PowerShell `7.5.0`
- Python `3.12.9`

The legacy `.tools/` directory remains bootstrap-only compatibility. New toolchain work should happen under `tools/`.

## Local run

```powershell
.\tools\bin\generated\hugo.cmd server -D
```

## Publishing workflow

1. Scaffold a new essay draft:
   - `.\tools\bin\custom\new-essay.cmd --title "My Title"`
2. Optional fallback if you need raw Hugo generation:
   - `.\tools\bin\generated\hugo.cmd new essays/my-title.md`
3. Write, then set `draft: false` when ready.
4. Run the essay guardrails on the target file:
   - `.\tools\bin\generated\npm.cmd run check:essays -- -Paths .\content\essays\my-title.md`
5. Build the site locally:
   - `.\tools\bin\generated\hugo.cmd --gc --minify`
6. Run the generated-output regression check:
   - `powershell -ExecutionPolicy Bypass -File .\tests\test_public_html_output.ps1`
7. Run the Node/browser test suite:
   - `.\tools\bin\generated\npm.cmd test`
8. Commit + push.

The scaffold command creates a draft essay with the required metadata block, a derived slug, and a starter structure for lead, argument, evidence, and closing sections.

## PDF status

- PDF generation is paused and not part of the public site or deploy workflow.
- Legacy PDF scripts remain in the repo for possible future revival, but they are outside the current publishing contract.

## Metadata conventions

Each non-draft piece should include:

- `description`
- `section_label`
- `version` (bump on material revision)
- `edition` (for example, `"First web edition"`)
- optional `featured: true`
- optional `homepage_rank: 1-8` for curated homepage placement

## Imprint upgrade

Single pages render a publication header plus a `Cite this` block so each page reads like a durable imprint object, not a blog post.

## Verification commands

Node/browser tests:

```powershell
.\tools\bin\generated\npm.cmd test
```

Public build smoke:

```powershell
.\tools\bin\generated\hugo.cmd --gc --minify
powershell -ExecutionPolicy Bypass -File .\tests\test_public_html_output.ps1
```

Essay scaffold regression:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\test_new_essay_scaffold.ps1
```

## Medium migration

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

1. Review imported markdown and localized media.
2. Run the legacy normalizer on imported essays that still carry Medium residue.
   - `.\tools\bin\generated\python.cmd .\scripts\normalize_legacy_medium_essay.py --write .\content\essays\some-piece.md`
3. Re-run the legacy audit to confirm the cleanup queue shrank.
   - `powershell -ExecutionPolicy Bypass -File .\scripts\audit_legacy_essays.ps1`
4. Flip selected imported essays from `draft: true` to `draft: false`.
5. Build the site locally with `.\tools\bin\generated\hugo.cmd --gc --minify`.

Fixture test harness:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test_medium_import.ps1
```

Legacy normalization regression test:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\test_legacy_essay_normalization.ps1
```

## Legacy essay audit

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\audit_legacy_essays.ps1
```

This report now highlights the safe-auto residue categories the normalizer is meant to clear:

- embedded media placeholders and raw HTML media wrappers
- loose image and source captions that have not been normalized into the article-body patterns
- duplicated lead metadata carried over from Medium

## Essay guardrails

Default behavior checks only changed essay files in the working tree and fails on high-confidence residue:

```powershell
.\tools\bin\generated\npm.cmd run check:essays
```

Explicit-path review for one or more essays:

```powershell
.\tools\bin\generated\npm.cmd run check:essays -- -Paths .\content\essays\my-title.md,.\content\essays\another-title.md
```

CI or branch-diff review between two refs:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check_essay_guardrails.ps1 -BaseRef <base-sha> -HeadRef <head-sha>
```

What blocks by default:

- duplicated lead title or dek in the body
- raw HTML and embedded-media import residue
- mojibake and obvious Medium call-to-action leftovers

What warns by default:

- loose image-caption residue the normalizer already knows how to clean
- pseudo-headings and malformed list patterns
- source dumps, ornamental separators, and escaped line-break residue
- missing `description` on non-draft essays

## Essay integrity audit

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\audit_essay_integrity.ps1
```

## Article-body conventions

For cleaner web rendering, prefer:

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
- Import normalized dashboard data from a GoatCounter export folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_analytics.ps1 -InputPath .\imports\analytics
```

- Automated refresh secret:
  Save `GOATCOUNTER_API_KEY` in `LPeasy/outsideinprint` if you want scheduled dashboard refreshes.
- Optional public-site variable:
  Use `GOATCOUNTER_SITE_URL` only if you need to override the default `https://outsideinprint.goatcounter.com`.
- Optional public-site variables:
  `GOATCOUNTER_SCRIPT_SRC`, `GOATCOUNTER_SCRIPT_INTEGRITY`, and `GOATCOUNTER_SCRIPT_CROSSORIGIN` let you override the default GoatCounter v5 script + SRI settings from the official docs.
- Optional refresh/import variable:
  Use `GOATCOUNTER_SITE_BASE_PATH` only if the public site ever moves away from the current `/outsideinprint` GitHub Pages base path.
- Optional refresh/import variable:
  Use `GOATCOUNTER_PUBLIC_SITE_URL` only if the public site origin ever moves away from `https://lpeasy.github.io/outsideinprint/` and you still want same-site referrers normalized as internal traffic.

- Public site note:
  The public Outside In Print site does not publish the dashboard.
  Dashboard snapshots are built separately with `hugo-dashboard.toml` and published to `LPeasy/OutsideInPrintDashboard`.
- Deploy key note:
  Keep `dashboard_deploy_key` and `dashboard_deploy_key.pub` local only.
  Store the private key as the `DASHBOARD_DEPLOY_KEY` secret in `LPeasy/outsideinprint`, install the matching public key on `LPeasy/OutsideInPrintDashboard`, and publish that target repo with GitHub Pages from the `main` branch root.
  These key files must remain local only and must never be committed to this repo.
