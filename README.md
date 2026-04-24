# Outside In Print

A minimalist Hugo site for publishing essays, fiction, dialogues, and working papers as durable web publications.

## Publishing references

- Canonical publishing workflow: `docs/publishing-workflow.md`
- Local validation policy: `docs/local-validation-policy.md`
- Editorial publishing contract: `PUBLISHING_POLICY.md`
- Repo-local Codex session notes: `AGENTS.md`

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

## Publishing quick start

Use `docs/publishing-workflow.md` as the canonical process. The normal publish path is:

1. Scaffold a new essay draft:
   - `.\tools\bin\custom\new-essay.cmd --title "My Title"`
2. Run target-file guardrails:
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md`
3. Build the site locally:
   - `.\tools\bin\generated\hugo.cmd --gc --minify`
4. Write the fresh-build manifest and run the publish smoke tests:
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1`
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1`
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`
5. Commit and push or merge to `main`.

Publishing happens through `.github/workflows/deploy.yml` after `main` is updated. For metadata, collections, Medium migration, and special-case paths, see `docs/publishing-workflow.md`.
Local OIP publish work does not force npm or npx checks; CI owns public-site contracts and analytics snapshot coverage.

## PDF status

- PDF generation is paused and not part of the public site or deploy workflow.
- Legacy PDF scripts remain in the repo for possible future revival, but they are outside the current publishing contract.

## Collections

- Maintainer guide: `docs/collections-system.md`

## Analytics

- Maintainer guide: `docs/analytics-system.md`
- SEO rollout guide: `docs/seo-rollout.md`
- SEO admin checklist: `docs/seo-admin-checklist.md`
- Import command:
  `powershell -ExecutionPolicy Bypass -File .\scripts\import_analytics.ps1 -InputPath .\imports\analytics`

- Automated refresh secret:
  Save `GOATCOUNTER_API_KEY` in `LPeasy/outsideinprint` if you want scheduled analytics snapshot refreshes.
- Optional public-site variable:
  Use `GOATCOUNTER_SITE_URL` only if you need to override the default `https://outsideinprint.goatcounter.com`.
- Optional public-site variables:
  `GOATCOUNTER_SCRIPT_SRC`, `GOATCOUNTER_SCRIPT_INTEGRITY`, and `GOATCOUNTER_SCRIPT_CROSSORIGIN` let you override the default GoatCounter v5 script + SRI settings from the official docs.
- Optional refresh/import variable:
  Use `GOATCOUNTER_SITE_BASE_PATH` only if the public site ever moves away from the current `/outsideinprint` GitHub Pages base path.
- Optional refresh/import variable:
  Use `GOATCOUNTER_PUBLIC_SITE_URL` only if the public site origin ever moves away from `https://outsideinprint.org/` and you still want same-site referrers normalized as internal traffic.

- Dashboard note:
  Dashboard publishing is paused and its workflow, config, templates, JavaScript, and tests have been removed from this repo. Public analytics tracking and refreshed JSON snapshots remain available for reporting and SEO rollout measurement.
