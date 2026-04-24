# Local Validation Policy

This policy covers local Outside In Print publishing and content-maintenance work in Codex or a local Windows shell.

## Decision

Local OIP validation uses Hugo plus PowerShell tests only. Do not run npm, npx, or Node package-manager commands as a required local gate for essay, cartoon, collection, or public-site publishing work.

This is intentional. The local Windows/Codex environment has repeatedly produced access and path failures in Node package-manager commands that do not reflect publish quality. Retrying, reinstalling, or forcing those commands wastes time and adds noise.

## Local Publish Gate

Use this gate before publishing public-site content:

```powershell
.\tools\bin\generated\hugo.cmd --gc --minify
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild
```

For changed essays, run the direct PowerShell guardrail before the full build:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md
```

## CI Boundary

GitHub Actions remains authoritative for CI-only public-site contracts and analytics snapshot checks. Dashboard publishing is paused; do not reintroduce local npm or npx checks as a substitute.

If a local OIP skill or workflow asks for npm or npx during public-site publishing, treat the instruction as stale and update the workflow instead of forcing the command through.
