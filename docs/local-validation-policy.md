# Local Validation Policy

This policy covers local Outside In Print publishing and content-maintenance work in Codex or a local Windows shell.

## Decision

Routine local OIP publishing uses source checks, not a full Hugo build. Do not run npm, npx, or Node package-manager commands as a required local gate for essay, cartoon, collection, or public-site publishing work.

This is intentional. The local Windows/Codex environment has repeatedly produced access and path failures in Node package-manager commands that do not reflect publish quality. Retrying, reinstalling, or forcing those commands wastes time and adds noise.

## Default Fast Gate

Before updating `main`, work from current `origin/main` and inspect `git status --short --untracked-files=all`, the exact diff, and `git diff --check`. Run the package and staged-payload validators when the content type provides them. Run target-file guardrails for changed published prose, including `-RequireEditorialPhilosophyAudit` where required. For routine artwork, inspect the original and its alt text; use the image registrar and staged-payload validator where available to check source bytes, dimensions, hashes, and manifest registration. CI runs the exhaustive responsive-image source contract on every publish. Run it locally only for structural or bulk manifest/alias changes, image-pipeline changes, or to diagnose a CI failure:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_source_contract.ps1
```

The exhaustive source contract validates canonical hashes, dimensions, aliases, and review state without generating derivatives; it covers the entire library and is not the default local gate for a routine image addition. For collection changes, run the collection source audit and review any count-dependent assertions; do not include its generated report unless that report is intentionally part of the change. For a text-only correction with unchanged image sources and rendering code, do not run image checks or provision Hugo.

For changed essays, run the direct PowerShell guardrail:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md
```

The guardrail blocks forbidden `that matters` phrasing and adverbial `still` constructions, except quoted/literal/title-source uses covered by the house-style rule, fully declared source-free Musings under `editorial/musings-series-contract.md`, and fully declared source-free Affirmations under `editorial/the-things-we-say-publication-contract.md`.

Formulaic `not X, but Y` reframing and equivalent adjacent-sentence constructions also block authored public-judgment prose under [Publishing Policy](../PUBLISHING_POLICY.md#house-style-publication-blockers). Preserve factual qualifications when making minimal corrections. URL destinations are not prose; visible authored link labels remain checked. No source-link-release style exceptions or warning-only downgrade apply.

The front-page image workflow validates source-free Musings and source-free Affirmations through separate exact predicates. Association-only repairs must use `scripts/update_front_page_cartoon.ps1 -LinkExistingSlug <image-slug> -EssayPath "/essays/<piece-slug>/"`; this mode preserves the existing `current` pointer and does not copy or replace artwork.

For changed non-draft essays, reports, and working papers, require Editorial Philosophy Audit evidence before publishing:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md -RequireEditorialPhilosophyAudit
```

For source-only validation in a new Windows worktree, generate wrappers and provision only PowerShell:

```powershell
cmd /c "call tools\generate_tool_wrappers.cmd && call tools\provision_toolchain.cmd -Tools pwsh && call tools\validate_toolchain.cmd -Tools pwsh"
```

For a conditional local Hugo preview or build, provision Hugo alone after that preflight:

```powershell
cmd /c "call tools\provision_toolchain.cmd -Tools hugo && call tools\validate_toolchain.cmd -Tools hugo"
```

## Conditional Local Render

Do not run `hugo server -D` plus a production build merely to approve each routine article or image. Inspect the original artwork directly and record its visual review; the stable derivative pipeline is tested in CI. Run one local preview or full build when the change touches layouts, shortcodes, render hooks, image processing, responsive CSS, or a complex/scheduled route whose output cannot be checked from source. Also use it when fine text, charts, crops, or a new processing mode require visual inspection of derivatives, or when diagnosing a CI failure. Reuse a warm cache and avoid a second full build when the first one already answers the question.

When a full local build is justified, use the existing sequence after provisioning Hugo:

```powershell
.\tools\bin\generated\hugo.cmd --gc --minify --panicOnWarning
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_output_contract.ps1 -SiteDir public
```

## CI Boundary

`.github/workflows/deploy.yml` is the authoritative release gate. Publish through a branch and PR created with the GitHub connector/API. Require the stable `release-ready` check and an up-to-date branch before merging to protected `main`. The owner's publication request authorizes enabling auto-merge for that publication PR; dependency and system changes still need review. A failing PR stays off `main`. After merge, CI builds the merged release and verifies Pages. A production failure requires diagnosis before another publication. Check CI after its expected run time or accept owner-supplied live confirmation, rather than polling continuously. Dashboard publishing is paused; do not reintroduce local npm or npx checks as a substitute.

If a local OIP skill or workflow asks for npm or npx during public-site publishing, treat the instruction as stale and update the workflow instead of forcing the command through.
