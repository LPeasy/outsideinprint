# Thread Migration Artifact

## Artifact Meta
- generated_at: 2026-04-24T19:29:55.6655969-04:00
- repo_root: C:\Users\lawto\Documents\OutsideInPrint\outsideinprint
- repo_name: outsideinprint
- branch: codex/seo-rollout-cloud-handoff
- status: mixed working tree; SEO rollout handoff files are intended for this branch; unrelated dashboard cleanup files remain outside this handoff scope
- artifact_version: 1
- source_purpose: hand off the sitewide SEO rollout tooling and next actions to a cloud Codex instance

## Stable Memory Sources
- AGENTS.md
- CODEX_WORKFLOW.md
- docs/local-validation-policy.md
- docs/seo-rollout.md
- docs/seo-admin-checklist.md
- docs/analytics-system.md

## Stable Repo Truths
- Work inside `outsideinprint/` for the active Hugo site.
- Follow repo-local wrappers under `tools\bin\generated\`; do not assume global Hugo, PowerShell, Node, npm, or npx.
- Local public-site validation is Hugo plus PowerShell tests only.
- `outsideinprint.org` is the canonical host. `lpeasy.github.io/outsideinprint` must not compete as indexable HTML.
- Search Console and Bing Webmaster results are manual owner inputs. Record them in `reports/seo-rollout/rollout-worksheet.csv`; do not guess them from local checks.
- The current SEO rollout is operations first: canonical authority, measured indexation, then tiered cleanup.
- No sitewide body rewrites should happen until canonical and indexation signals are stable.
- GitHub remote writes should prefer connector/API paths when practical; local git is still used for local checkout, diffs, staging, and commits.

## Current Repo State
- Current branch: `codex/seo-rollout-cloud-handoff`.
- Previous branch before handoff prep: `codex/article-exit-start-reading` tracking `origin/codex/article-exit-start-reading`.
- Recent HEAD: `190ccd5 Refine article continuation and guided entry threads`.
- The working tree contains older dashboard-cleanup edits and deletions not intended for this handoff branch.
- SEO rollout files prepared for cloud continuation:
  - `docs/seo-rollout.md`
  - `docs/seo-admin-checklist.md`
  - `docs/thread-migration.md`
  - `scripts/freeze_seo_rollout_baseline.ps1`
  - `scripts/diagnose_seo_hosts.ps1`
  - `scripts/audit_legacy_host_references.ps1`
  - `scripts/prepare_search_console_inspection_pack.ps1`
  - `scripts/audit_seo_metadata.ps1`
  - `scripts/prepare_essay_image_review_queue.ps1`
  - `scripts/report_search_performance.ps1`
  - `scripts/submit_indexnow.ps1`
  - `scripts/run_seo_production_verification.ps1`
  - `tests/test_seo_rollout_contract.ps1`

## Current Thread Summary
- Derived from the visible current conversation only.
- The user supplied a sitewide SEO optimization course framing: runbook first, content cleanup second.
- The task direction is to preserve `outsideinprint.org` as the only canonical host, probe legacy-host behavior, use manual Google/Bing data, and defer broad content rewrites.
- Missing SEO rollout scripts were added for Search Console inspection packs, metadata audits, essay image review queues, search performance reports, IndexNow planning/submission, and production verification.
- `docs/seo-rollout.md` now states the operations-first principle and Tier 0 through Tier 3 cleanup model.
- `scripts/freeze_seo_rollout_baseline.ps1` now assigns Tier 0 to homepage/About/Author/Collections/Library and Tier 1 to priority essays and major collection entry points.
- The user then asked to prepare this handoff and ensure the relevant files are available on a GitHub branch for cloud Codex.

## Active Workstream
- Goal: let cloud Codex continue the SEO rollout from a clean GitHub branch with the runbook, tooling, and validation contract in place.
- Acceptance criteria:
  - handoff document exists at `docs/thread-migration.md`
  - relevant SEO rollout files are committed on `codex/seo-rollout-cloud-handoff`
  - branch is pushed to `LPeasy/outsideinprint`
  - unrelated dashboard cleanup work is not silently included
- Constraints:
  - Keep `outsideinprint.org` canonical.
  - Treat Search Console and Bing as manual truth sources.
  - Do not overwrite the frozen baseline casually.
  - Do not start archive-wide content rewriting from the audit outputs.
- Open risks:
  - Local Windows TLS checks may report `SEC_E_NO_CREDENTIALS`; treat that as local client evidence unless CI or a clean client reproduces it.
  - The existing frozen baseline still reflects the older tier labels. The code now fixes future baseline freezes; do not overwrite the old baseline unless intentionally restarting the measurement window.
  - The worktree has unrelated dashboard cleanup changes, so cloud Codex should inspect branch contents rather than assume the local dirty tree is all in scope.

## Validation Snapshot
- Passed in the current visible thread:
  - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_seo_rollout_contract.ps1`
  - `.\tools\bin\generated\hugo.cmd --gc --minify`
  - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1`
  - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1`
  - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`
- Before SEO-facing publish, run:
  - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_seo_rollout_contract.ps1`
  - `.\tools\bin\generated\hugo.cmd --gc --minify`
  - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1`
  - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1`
  - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`

## Files to Read First
- `docs/thread-migration.md`
- `docs/seo-rollout.md`
- `docs/seo-admin-checklist.md`
- `tests/test_seo_rollout_contract.ps1`
- `scripts/freeze_seo_rollout_baseline.ps1`
- `scripts/probe_seo_rollout.ps1`
- `scripts/diagnose_seo_hosts.ps1`
- `scripts/run_seo_production_verification.ps1`
- `docs/local-validation-policy.md`
- `AGENTS.md`

## Next Thread Startup
- First commands:
  - `git status -sb`
  - `git log --oneline -10`
  - `git show --stat --oneline HEAD`
  - `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_seo_rollout_contract.ps1`
- First checks:
  - confirm the branch is `codex/seo-rollout-cloud-handoff`
  - confirm only SEO rollout and handoff files are in the branch diff
  - read `docs/seo-rollout.md` before making page-level SEO edits
- Likely next actions:
  - run or review `scripts/prepare_search_console_inspection_pack.ps1`
  - wait for owner-provided Google/Bing inspection results
  - use `scripts/audit_seo_metadata.ps1` and `scripts/prepare_essay_image_review_queue.ps1` only as planning inputs
  - avoid broad content rewriting until Tier 0 and Tier 1 canonical selection is stable

## Operator Notes

