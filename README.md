# Outside In Print

A minimalist Hugo site for publishing essays, fiction, dialogues, and working papers as durable web publications.

## Publishing references

- Canonical publishing workflow: `docs/publishing-workflow.md`
- Local validation policy: `docs/local-validation-policy.md`
- Responsive image pipeline: `docs/responsive-image-pipeline.md`
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
- Hugo Extended `0.164.0`
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
2. Run target-file guardrails while drafting:
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md`
3. Before setting `draft: false` or publishing a changed essay, run the philosophy gate:
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md -RequireEditorialPhilosophyAudit`
4. Validate managed image sources, then build the site locally:
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_source_contract.ps1`
   - `.\tools\bin\generated\hugo.cmd --gc --minify --panicOnWarning`
5. Write the fresh-build manifest and run the publish smoke and image-output tests:
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1`
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1`
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`
   - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_output_contract.ps1 -SiteDir public`
6. Commit and push or merge to `main`.

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

GoatCounter's hosted weekly email is the selected traffic report; its hosted dashboard is optional for closer inspection. Use Google Search Console occasionally for search exposure and indexing. Weekly email activation must be verified in the account before it is described as enabled.

The committed analytics snapshots last contain data dated April 14, 2026. They and the import/export scripts are historical. The GitHub refresh workflow remains disabled and has no scheduled trigger. This setup requires no custom dashboard, analytics API secret, local collector, or additional reporting schedule.
