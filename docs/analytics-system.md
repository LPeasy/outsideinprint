# Analytics System

Outside In Print uses a static, privacy-friendly analytics pipeline built around GoatCounter.

- Public site tracking goes to `https://outsideinprint.goatcounter.com`.
- Raw analytics are fetched into a temporary working folder.
- `scripts/import_analytics.ps1` normalizes raw rows into `data/analytics/*.json`.
- Refreshed snapshots are committed for reporting, SEO rollout measurement, and future analysis.
- No separate analytics renderer is published from this repo.

SEO rollout operations are documented separately in `docs/seo-rollout.md`.

## Architecture

The analytics path is:

1. The public Hugo site emits GoatCounter pageviews plus lightweight custom events.
2. `.github/workflows/refresh-analytics.yml` runs on a schedule or manual dispatch.
3. `scripts/fetch_analytics_goatcounter.ps1` requests a GoatCounter export and writes raw files into `./.analytics-refresh/raw`.
4. `scripts/import_analytics.ps1` transforms that raw export into `data/analytics/*.json`.
5. The workflow validates the snapshot contract and commits changed snapshot files to `main`.

The public reading site still builds without GoatCounter configuration. The refresh workflow requires `GOATCOUNTER_API_KEY` only when fetching fresh data.

## Public Tracking

Tracking lives in `layouts/partials/analytics.html` and `assets/js/analytics.js`.

What gets tracked:

- GoatCounter pageviews
- `essay_read_start`
- `essay_read`
- `pdf_download`
- `newsletter_submit`
- `internal_promo_click`
- `collection_click`
- `external_link_click`

The client code keeps the current lightweight behavior:

- no cookies
- no backend
- no runtime analytics API calls
- no cookie banner logic
- delegated click handling
- read-progress tracking based on active time and scroll depth

Custom events are encoded into GoatCounter event names with stable metadata such as target path, slug, section, source slot, collection, and format. That metadata is parsed later during normalization.

For `collection_click`, the current source-slot contract includes the article-header context slot `article_collection_context` in addition to homepage, collection-page, and article-continuation collection surfaces.

## Read Tracking Rules

`essay_read_start` fires once per eligible page load after 15 seconds of active time.

`essay_read` fires once per eligible page load after 90 seconds of active time and at least 75 percent scroll depth. Active time pauses while the tab is hidden.

Read tracking is limited to essays, Syd and Oliver, and working papers. It does not run for homepage, collections list pages, library, random, or Start Here.

## Snapshot Files

`scripts/import_analytics.ps1` writes:

- `overview.json`
- `essays.json`
- `sources.json`
- `modules.json`
- `periods.json`
- `timeseries_daily.json`
- `sections.json`
- `essays_timeseries.json`
- `journeys.json`
- `journey_by_source.json`
- `journey_by_collection.json`
- `journey_by_essay.json`
- `sources_timeseries.json`

Snapshot rules:

- Files must stay valid JSON.
- Files must not contain `NaN` or `undefined`.
- Section taxonomy is canonicalized during import so legacy drift such as `Essay` vs `Essays` collapses into the current labels.
- Downstream journey fields remain explicitly approximate when inferred from same-session order.
- No fields are fabricated. If GoatCounter does not provide or preserve something directly, the importer either leaves it blank or derives it explicitly from exported rows.

## Validation

Run these checks for analytics pipeline work:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\test_analytics_import.ps1
powershell -ExecutionPolicy Bypass -File .\tests\test_analytics_snapshot_contract.ps1
```

The public publish gate remains Hugo plus PowerShell public-output checks, as documented in `docs/local-validation-policy.md`.

## Required Configuration

### Public Site Build

Required for live tracking:

- repository variable: `ANALYTICS_ENABLED=true`

Optional:

- repository variable: `GOATCOUNTER_SITE_URL`
  Default: `https://outsideinprint.goatcounter.com`
- repository variable: `GOATCOUNTER_SCRIPT_SRC`
  Default: `https://gc.zgo.at/count.v5.js`
- repository variable: `GOATCOUNTER_SCRIPT_INTEGRITY`
  Default: GoatCounter v5 SRI hash from the official docs
- repository variable: `GOATCOUNTER_SCRIPT_CROSSORIGIN`
  Default: `anonymous`
- repository variable: `ANALYTICS_ALLOW_LOCAL=true`
  Only for deliberate local tracking tests

Static config lives in `hugo.toml`.

### Refresh Workflow

Required:

- repository secret: `GOATCOUNTER_API_KEY`

Optional:

- repository variable: `GOATCOUNTER_SITE_URL`
  Use this only if the analytics site URL changes from the default.
- repository variable: `GOATCOUNTER_API_URL`
  Default: `<GOATCOUNTER_SITE_URL>/api/v0`
  Use this only if GoatCounter tracking and the authenticated export API live on different hosts or base paths.
- repository variable: `GOATCOUNTER_SITE_BASE_PATH`
  Default: `/outsideinprint`
  Use this only if the deployed public site moves to a different GitHub Pages base path.
- repository variable: `GOATCOUNTER_PUBLIC_SITE_URL`
  Default: `https://outsideinprint.org/`
  Use this only if the public site origin changes and you still want internal referrers grouped as `internal / <path>`.

The refresh workflow is `.github/workflows/refresh-analytics.yml`.

## Local Usage

Public site only:

```powershell
.\tools\bin\generated\hugo.cmd server -D
```

Local public-site tracking test:

```powershell
$env:ANALYTICS_ENABLED = "true"
$env:ANALYTICS_ALLOW_LOCAL = "true"
$env:GOATCOUNTER_SITE_URL = "https://outsideinprint.goatcounter.com"
.\tools\bin\generated\hugo.cmd server -D
```

Clear those environment variables afterward if you do not want future local sessions to emit analytics.

Local refresh test:

```powershell
$env:GOATCOUNTER_API_KEY = "replace-me"
$env:GOATCOUNTER_SITE_URL = "https://outsideinprint.goatcounter.com"
powershell -ExecutionPolicy Bypass -File .\scripts\fetch_analytics_goatcounter.ps1 -OutputDir .\.analytics-refresh\raw
powershell -ExecutionPolicy Bypass -File .\scripts\import_analytics.ps1 -InputPath .\.analytics-refresh\raw
```

## Refresh Workflow

`.github/workflows/refresh-analytics.yml` keeps these triggers:

- scheduled daily run
- `workflow_dispatch`

It also preserves:

- step-summary reporting
- cleanup of temporary working folders
- no-op commits when `data/analytics` has not changed
- minimum required workflow permissions for committing refreshed snapshots
- SEO rollout measurement reporting from the refreshed snapshot

What it does:

1. Verifies `GOATCOUNTER_API_KEY`.
2. Fetches a GoatCounter export into `./.analytics-refresh/raw`.
3. Runs `scripts/import_analytics.ps1`.
4. Validates `data/analytics` with `tests/test_analytics_snapshot_contract.ps1`.
5. Commits `data/analytics` only when the normalized files changed.

If configuration is missing, the workflow fails with an actionable message in both logs and the step summary.

## Troubleshooting

Missing GoatCounter secret:

- If the refresh workflow fails with `GOATCOUNTER_API_KEY is not configured`, add that repository secret in `LPeasy/outsideinprint` under `Settings -> Secrets and variables -> Actions`.

Export fetch failure:

- Confirm the API key belongs to the correct GoatCounter site.
- Confirm the site URL is correct if you overrode `GOATCOUNTER_SITE_URL`.
- If the request fails with `404` on `/api/v0/export`, set `GOATCOUNTER_API_URL` to the authenticated GoatCounter API host or base instead of assuming it matches the public tracking URL.
- Retry transient failures; the fetch script already uses retry/backoff for 429 and common 5xx/network issues.

Unexpectedly empty analytics data:

- Check that `goatcounter-export.csv` was written during the fetch step.
- Confirm the public site is sending GoatCounter pageviews and events.
- If pageviews exist but some source fields are blank, that usually means GoatCounter only had a plain referrer and no campaign tags for those visits.
