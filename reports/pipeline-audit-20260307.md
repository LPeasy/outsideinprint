# Pipeline Audit (2026-03-07)

## Scope
- Import integrity reports
- PDF build scripts
- Preflight gate
- GitHub Actions deployment flow

## Checks Run
- `powershell -ExecutionPolicy Bypass -File .\scripts\preflight.ps1` -> PASS
- `powershell -ExecutionPolicy Bypass -File .\scripts\build_pdfs_typst_local.ps1` -> FAIL (expected in this sandbox: missing `pandoc` in PATH)
- Import integrity reports regenerated and sampled.

## Findings
- Character integrity: PASS (`reports/essay-integrity-audit.json`)
- Representative sample integrity: PASS (`reports/essay-integrity-sample.json`)
- PDF pipeline dependency gate needed clearer fail-fast behavior for missing tools.
- CI lacked explicit toolchain verification and job timeouts.

## Remediation Applied
- Added hardened shared PDF build runner (`scripts/build_pdfs_typst_shared.ps1`) and thin local/CI wrappers.
- Added explicit command checks and template existence checks in shared runner.
- Added safer file-slug derivation for output filenames.
- Hardened CI workflow with timeouts, strict install shell flags, and toolchain verification.
