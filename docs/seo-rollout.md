# SEO Rollout

This is the operator runbook for the current Outside In Print SEO rollout.

The repo-side metadata work is already in place. This phase is about `canonical authority transfer`, `legacy-host consolidation`, and `measurement against a frozen baseline`.

Use `docs/seo-admin-checklist.md` as the owner-facing companion checklist for the account-controlled steps that cannot be executed from this repo.

## Phase 0: Freeze The Baseline

Run the baseline freeze script against the committed analytics snapshot:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\freeze_seo_rollout_baseline.ps1
```

This writes:

- `reports/seo-rollout/baseline.json`
- `reports/seo-rollout/baseline.md`
- `reports/seo-rollout/priority-urls.json`
- `reports/seo-rollout/rollout-worksheet.csv`

The baseline artifacts freeze:

- current `overview.json` KPI totals
- acquisition-channel rollups from `sources.json`
- top landing essays
- the priority canonical URL set
- the matching legacy-host sample URLs

Do not overwrite the baseline casually once production cutover starts. The point is to compare later snapshots against the same pre-cutover reference.

## Phase 1: Validate The Canonical Host

After deployment, validate the public canonical host directly:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_live_seo_smoke.ps1 -BaseUrl https://outsideinprint.org
```

That smoke test should confirm, on the canonical host:

- canonical tags point to `https://outsideinprint.org/...`
- route-level robots tags are correct
- `og:image` and `twitter:image` exist on priority pages
- expected JSON-LD types exist
- RSS autodiscovery exists where expected
- `llms.txt` resolves and contains canonical URLs

The deploy workflow now runs this canonical-host smoke check after the normal GitHub Pages deployment smoke check.

## Phase 2: Probe The Canonical And Legacy Hosts

Run the host probe to classify priority URLs on both the canonical and legacy hosts:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\probe_seo_rollout.ps1
```

This writes:

- `reports/seo-rollout/probe-results.json`
- `reports/seo-rollout/probe-results.csv`
- `reports/seo-rollout/probe-results.md`

It also updates `reports/seo-rollout/rollout-worksheet.csv` by default.

Legacy-host classifications are:

- `full_path_301`
- `redirect_wrong_destination`
- `live_duplicate_html`
- `broken_or_stale`

Target state:

- priority canonical URLs pass the smoke probe
- legacy URLs return path-preserving `301` redirects to the matching canonical URL

If the legacy host still serves duplicate HTML, do not treat canonicals alone as "good enough." Redirect or retire the legacy surface.

For lower-level DNS/TLS/client diagnostics, run:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\diagnose_seo_hosts.ps1
```

This writes:

- `reports/seo-rollout/host-diagnostics.json`
- `reports/seo-rollout/host-diagnostics.md`

That report compares:

- DNS answers for the apex and `www`
- `Invoke-WebRequest` behavior, which mirrors the CI smoke client
- `curl.exe` behavior, which helps separate total outage from PowerShell-specific TLS problems
- legacy-host first-hop redirects versus followed final URLs

To audit repo-controlled references to the legacy host, run:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_legacy_host_references.ps1
```

This writes:

- `reports/seo-rollout/legacy-reference-audit.json`
- `reports/seo-rollout/legacy-reference-audit.md`

Use that audit to distinguish:

- intentional historical legacy references in analytics and rollout sampling
- fixture compatibility references
- true manual follow-up cleanup candidates

For a single post-deploy verification pass, run:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\run_seo_production_verification.ps1
```

This writes:

- `reports/seo-rollout/production-verification/production-verification.json`
- `reports/seo-rollout/production-verification/production-verification.md`
- probe, host diagnostic, and legacy reference audit artifacts in the same folder

## Phase 3: Search Console And Bing

These steps are manual. They are not automated by the repo.

Google Search Console:

1. Verify `outsideinprint.org` as a domain property.
2. Submit `https://outsideinprint.org/sitemap.xml`.
3. Inspect and request indexing for:
   - `/`
   - `/about/`
   - `/authors/robert-v-ussley/`
   - `/collections/`
   - `/collections/risk-uncertainty/`
   - the top priority essays from `reports/seo-rollout/priority-urls.json`

Bing Webmaster Tools:

1. Verify `outsideinprint.org`.
2. Submit `https://outsideinprint.org/sitemap.xml`.
3. Inspect the same priority URLs.

Record manual outcomes in `reports/seo-rollout/rollout-worksheet.csv`:

- `google_verified`
- `bing_verified`
- `selected_canonical`
- `indexed`
- `notes`

Blocking findings:

- selected canonical is not `outsideinprint.org`
- a priority core page is excluded
- a priority essay is treated as duplicate without the canonical host being selected

To generate a console-friendly inspection sheet from the frozen priority URL set, run:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\prepare_search_console_inspection_pack.ps1
```

This writes:

- `reports/seo-rollout/search-console-inspection-pack.csv`
- `reports/seo-rollout/search-console-inspection-pack.md`

## Phase 4: Measurement Window

Run the measurement report against the frozen baseline:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\report_seo_rollout_window.ps1 -Label day-7
```

This writes:

- `reports/seo-rollout/measurement-window-report.json`
- `reports/seo-rollout/measurement-window-report.md`

Recommended cadence:

- day 2
- day 7
- day 14
- day 28

The report tracks:

- pageviews by acquisition channel
- top externally discovered essays
- `legacy_domain` trend vs baseline
- `organic_search` trend vs baseline
- any measured `ai_answer_engine` traffic
- the current worksheet state for priority URLs

Interpretation rules:

- zero AI-answer-engine traffic in month one is not a failure
- low organic traffic with correct canonicals is not a rollback trigger
- flat or rising `legacy_domain` after redirect work is a failure signal and should reopen legacy-host consolidation

When Search Console or Bing query exports are available, build a query-performance report:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\report_search_performance.ps1 -GoogleCsvPath .\path\to\google.csv -BingCsvPath .\path\to\bing.csv
```

If no export is available yet, the script writes `search-performance-input-template.csv` to show the expected shape. Use the report for targeted title and description changes only.

## Phase 4.5: Audit Before Content Edits

Before Phase 5 content work, run the metadata audit:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_seo_metadata.ps1
```

This writes:

- `reports/seo-rollout/seo-metadata-audit.csv`
- `reports/seo-rollout/seo-metadata-audit.json`
- `reports/seo-rollout/seo-metadata-audit.md`

This audit flags missing or weak descriptions, default social images, duplicate titles/descriptions, possible encoding damage, and missing image alt text. It is not a command to rewrite the whole archive immediately.

To prepare a manual hero/social image review pass for essays that need image work, run:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\prepare_essay_image_review_queue.ps1
```

This writes:

- `reports/seo-rollout/essay-image-review-queue.csv`
- `reports/seo-rollout/essay-image-review-queue.md`
- `reports/seo-rollout/essay-image-review-worklog.csv`

The image queue is review-only. Use it to generate and approve images manually before any essay front matter is patched. Batch A is the frozen priority essay set; later batches should wait until the priority images have been approved and validated.

After Bing Webmaster Tools is verified and an IndexNow key file is publicly reachable on the canonical host, dry-run the submit list:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\submit_indexnow.ps1 -UsePriorityUrls -DryRun
```

Real submission requires `INDEXNOW_KEY` and must submit canonical `https://outsideinprint.org/...` URLs only.

## CI / Workflow Support

The rollout is wired into GitHub Actions in two places.

`deploy.yml` now:

- smokes the transient GitHub Pages deployment URL
- retries the canonical-host smoke test against `https://outsideinprint.org`
- runs `scripts/probe_seo_rollout.ps1` into a temporary artifact folder
- uploads the probe outputs as a workflow artifact

`refresh-analytics.yml` now:

- refreshes `data/analytics`
- runs the analytics snapshot contract test
- generates a measurement-window summary against the frozen rollout baseline
- appends the rollout summary to the GitHub step summary without dirtying the repo

## Exit Gates

Phase 1 is done when:

- `outsideinprint.org` serves the intended metadata and schema on priority pages

Phase 2 is done when:

- sampled legacy URLs no longer serve indexable duplicate HTML

Phase 3 is done when:

- Google and Bing both accept the sitemap
- priority URLs have inspection records
- canonical selection is correct or actively remediated

Phase 4 is done when:

- the 28-day report shows corrected channel attribution and a post-cutover trend line

Phase 5 starts only after those gates are stable. That is when archive-wide image and description normalization becomes the next high-value content pass.
