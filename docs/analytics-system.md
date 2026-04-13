# Analytics System

Outside In Print uses a static, privacy-friendly analytics pipeline built around GoatCounter.

- Public site tracking goes to `https://outsideinprint.goatcounter.com`
- Raw analytics are fetched into a temporary working folder
- `scripts/import_analytics.ps1` normalizes those raw rows into `data/analytics/*.json`
- The separate dashboard site reads only committed JSON snapshots
- `.github/workflows/publish-dashboard.yml` remains the only dashboard deployment mechanism

If GoatCounter is not configured, the public site still builds and the dashboard still renders from the committed snapshot files.

## Architecture

The analytics path is:

1. Public Hugo site emits GoatCounter pageviews plus lightweight custom events.
2. `.github/workflows/refresh-analytics.yml` runs on a schedule or manual dispatch.
3. `scripts/fetch_analytics_goatcounter.ps1` requests a GoatCounter export and writes raw files into `./.analytics-refresh/raw`.
4. `scripts/import_analytics.ps1` transforms that raw export into:
   - `data/analytics/overview.json`
   - `data/analytics/essays.json`
   - `data/analytics/sources.json`
   - `data/analytics/modules.json`
   - `data/analytics/periods.json`
   - `data/analytics/timeseries_daily.json`
   - `data/analytics/sections.json`
   - `data/analytics/essays_timeseries.json`
   - `data/analytics/journeys.json`
   - `data/analytics/journey_by_source.json`
   - `data/analytics/journey_by_collection.json`
   - `data/analytics/journey_by_essay.json`
   - `data/analytics/sources_timeseries.json`
5. The workflow commits changed snapshot files to `main`.
6. `publish-dashboard.yml` builds the dashboard with `hugo-dashboard.toml` and publishes it to `LPeasy/OutsideInPrintDashboard`.

The public reading site and the dashboard stay separate:

- public site repo/build: `LPeasy/outsideinprint` with `hugo.toml`
- dashboard build: `hugo-dashboard.toml`
- dashboard publish repo: `LPeasy/OutsideInPrintDashboard`

## Public Tracking

Tracking lives in [`layouts/partials/analytics.html`](C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\layouts\partials\analytics.html) and [`assets/js/analytics.js`](C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\assets\js\analytics.js).

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
- no dashboard-side live API calls
- no cookie banner logic
- delegated click handling
- read-progress tracking based on active time and scroll depth

To preserve the existing ETL/dashboard contract without the old query-time custom-property model, custom events are encoded into GoatCounter event names with stable metadata such as:

- target path
- slug
- section
- source slot
- collection
- format

That metadata is parsed later during normalization.

## Read Tracking Rules

`essay_read_start`

- fires once per eligible page load
- requires 15 seconds of active time

`essay_read`

- fires once per eligible page load
- requires 90 seconds of active time
- requires at least 75 percent scroll depth
- pauses active time while the tab is hidden

Read tracking is limited to:

- essays
- syd-and-oliver
- working-papers

It does not run for:

- homepage
- collections list pages
- library
- random
- start-here
- dashboard

## Available Metrics

The normalized dashboard continues to expose:

- pageviews
- unique visitors
- read events
- read event rate
- PDF downloads
- newsletter submits
- daily trend windows
- section-level summaries
- essay sparklines
- discovery-to-read journeys
- journey rollups by source, collection/module, and essay
- source-quality time mix
- top essays
- referrers and campaigns
- module / collection click totals
- recent period summaries

The current GoatCounter-based meanings are:

- `reads` are tracked `essay_read` events, not a native GoatCounter engagement metric
- `read_rate` is `essay_read events / pageviews`
- `unique_visitors` are derived from distinct GoatCounter session IDs in the exported pageview rows
- `sources.json` is derived from normalized referrer data and campaign tags
- `modules.json.downstream_reads` is inferred from same-session click-to-read sequences in the export, not from first-class attribution fields
- `journeys.json.views` are measured pageview anchors; `reads`, `pdf_downloads`, and `newsletter_submits` are approximate same-session downstream events
- `journey_by_source.json`, `journey_by_collection.json`, and `journey_by_essay.json` are rollups of those same measured pageview anchors plus approximate downstream events
- `timeseries_daily.json` is date-filled only across the exported range; missing days inside that range render as explicit zero rows

## Analytics Contract

The dashboard now treats the analytics handoff as one shared contract across three boundaries:

1. `scripts/import_analytics.ps1` writes normalized snapshot files in `data/analytics/*.json`
2. [`layouts/partials/dashboard/render.html`](C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\layouts\partials\dashboard\render.html) emits those snapshots into the inline `dashboard-data` payload
3. [`assets/js/dashboard-core.mjs`](C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\assets\js\dashboard-core.mjs) normalizes that payload for runtime filtering and drill-down rendering

Contract rules:

- `dashboard-data` must be emitted as a JSON object payload, not as a JSON string literal
- required payload keys are checked in the build smoke test: `overview`, `essays`, `sections`, `timeseries_daily`, and `journeys`
- snapshot files must stay valid JSON and must not contain `NaN` or `undefined`
- section taxonomy is canonicalized at import and runtime so legacy drift like `Essay` vs `Essays` collapses into `Essays`
- the runtime still defensively double-parses `dashboard-data` if it ever arrives as a string again, but that path is compatibility protection rather than the intended contract

## Dashboard Drill-Down State

Dashboard V2 keeps drill-down exploration shareable through query-string state rather than a live API.

- `selectedSection` opens the in-page section explorer for a specific section
- `selectedEssay` opens the essay explorer for a specific piece path
- `compareSections` keeps up to four sections in the compact comparison strip
- `compareEssays` keeps up to four essays in the compact comparison strip

These controls only change presentation state in the static dashboard. They do not request more analytics data at runtime.

## Maintainer Validation

For local hardening checks, the preferred single entry point is:

```powershell
pwsh -File ./scripts/verify_dashboard.ps1
```

That script runs the full verification sequence when the required tools are present and reports any checks it had to skip.

The underlying validation loop is:

1. `pwsh -File ./tests/test_analytics_import.ps1`
2. `pwsh -File ./tests/test_analytics_snapshot_contract.ps1`
3. `.\tools\bin\generated\node.cmd --test tests/*.test.mjs`
4. `pwsh -File ./tests/test_dashboard_build.ps1`
5. `.\tools\bin\generated\hugo.cmd --config hugo-dashboard.toml --gc --minify --destination .dashboard-public`
6. `.\tools\bin\generated\hugo.cmd --minify --baseURL "https://lpeasy.github.io/outsideinprint/"`
7. `pwsh -File ./tests/test_dashboard_browser_smoke.ps1`

What each step protects:

- the import test verifies the ETL still emits the expected normalized files
- the snapshot contract test fails fast if a required JSON snapshot is missing, empty, malformed, or contains `NaN` / `undefined`
- the snapshot contract test also checks the required field shape for each snapshot type and catches duplicate canonical section labels
- the Node test suite covers empty, sparse, rich, malformed-but-recoverable, filter, journey, drill-down, and section-taxonomy normalization logic
- the Hugo smoke build checks that the static dashboard still renders expected explorer sections without leaking invalid values into HTML or a malformed `dashboard-data` payload
- the browser smoke test verifies that the built site actually hydrates in a real browser and honors a shareable drill-down query state

The dashboard intentionally stays conservative when sample sizes are tiny:

- deterministic insight cards fall back to a small-sample note for fragile windows
- journey and conversion copy continues to label approximate downstream attribution explicitly
- malformed snapshot values are coerced to safe defaults so the page degrades instead of crashing

## Historical Notes

The remaining mentions of Plausible in this section are historical comparison only.
No active workflow, template, or script path in the GoatCounter pipeline depends on Plausible.

## Differences From The Previous Plausible Version

GoatCounter does not expose Plausible-style custom event properties in reporting, so the system now relies on encoded event names plus raw export normalization.

Practical differences:

- There is no Plausible API query layer anymore.
- Rich event context is reconstructed from event-name metadata instead of direct custom-property aggregations.
- Referrer and campaign reporting is derived from exported referrer data.
- `sources.json.medium`, `campaign`, and `content` may be blank when GoatCounter only has a plain referrer.
- Downstream module reads are inferred from session order and are therefore approximate, though still honest and reproducible from the export.

No fields are fabricated. If GoatCounter does not provide or preserve something directly, the dashboard either leaves it blank or derives it explicitly from exported rows.

## Required Configuration

### Public site build

Required:

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

Static config lives in:

- [`hugo.toml`](C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\hugo.toml)

The relevant params are:

- `params.analytics.enabled`
- `params.analytics.allow_local`
- `params.analytics.goatcounter.site_url`
- `params.analytics.goatcounter.script_src`
- `params.analytics.goatcounter.script_integrity`
- `params.analytics.goatcounter.script_crossorigin`

### Refresh workflow

Required:

- repository secret: `GOATCOUNTER_API_KEY`

Optional:

- repository variable: `GOATCOUNTER_SITE_URL`
  Use this only if the analytics site URL changes from the default
- repository variable: `GOATCOUNTER_API_URL`
  Default: `<GOATCOUNTER_SITE_URL>/api/v0`
  Use this only if GoatCounter tracking and the authenticated export API live on different hosts or base paths
- repository variable: `GOATCOUNTER_SITE_BASE_PATH`
  Default: `/outsideinprint`
  Use this only if the deployed public site moves to a different GitHub Pages base path
- repository variable: `GOATCOUNTER_PUBLIC_SITE_URL`
  Default: `https://lpeasy.github.io/outsideinprint/`
  Use this only if the public site origin changes and you still want internal referrers grouped as `internal / <path>`

The refresh workflow is in:

- [`refresh-analytics.yml`](C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\.github\workflows\refresh-analytics.yml)

### Dashboard publish

Required:

- repository secret: `DASHBOARD_DEPLOY_KEY`

The publish workflow is still:

- [`publish-dashboard.yml`](C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\.github\workflows\publish-dashboard.yml)

## Local Usage

Public site only:

```powershell
.\tools\bin\generated\hugo.cmd server -D
```

Dashboard site only:

```powershell
.\tools\bin\generated\hugo.cmd --config hugo-dashboard.toml server --disableFastRender
```

Dashboard V2 smoke tests:

```powershell
.\tools\bin\generated\node.cmd --test .\tests\dashboard_v2_logic.test.mjs
powershell -ExecutionPolicy Bypass -File .\tests\test_analytics_import.ps1
powershell -ExecutionPolicy Bypass -File .\tests\test_analytics_snapshot_contract.ps1
powershell -ExecutionPolicy Bypass -File .\tests\test_dashboard_build.ps1
powershell -ExecutionPolicy Bypass -File .\tests\test_dashboard_browser_smoke.ps1
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
# Only set this if the export API is not rooted under GOATCOUNTER_SITE_URL.
$env:GOATCOUNTER_API_URL = "https://outsideinprint.goatcounter.com/api/v0"
powershell -ExecutionPolicy Bypass -File .\scripts\fetch_analytics_goatcounter.ps1 -OutputDir .\.analytics-refresh\raw
```

## Refresh Workflow

`.github/workflows/refresh-analytics.yml` keeps these triggers:

- scheduled daily run
- `workflow_dispatch`

It also preserves:

- step-summary reporting
- cleanup of temporary working folders
- no-op commits when `data/analytics` has not changed
- automatic dashboard publish via the normal push-to-main trigger when analytics files changed
- minimum required workflow permissions for committing refreshed snapshots

What it does:

1. Verifies `GOATCOUNTER_API_KEY`
2. Fetches a GoatCounter export into `./.analytics-refresh/raw`
3. Runs `scripts/import_analytics.ps1`
4. Commits `data/analytics` only when the normalized files changed
5. Relies on the resulting push to `main` to trigger `publish-dashboard.yml`

If configuration is missing, the workflow fails with an actionable message in both logs and the step summary.

## Manual Refresh

GitHub Actions:

1. Open `LPeasy/outsideinprint`
2. Go to `Actions`
3. Open `Refresh Analytics Data`
4. Choose `Run workflow`
5. Review the step summary for either:
   - `No analytics changes detected.`
  - a refreshed snapshot commit that triggers the normal dashboard publish workflow

Local ETL run from a raw GoatCounter export folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_analytics.ps1 -InputPath .\imports\analytics
```

That folder can contain:

- `goatcounter-export.csv`
- optional `metadata.json`

By default, the importer normalizes exported paths against the current project-site base path:

- `/outsideinprint`

If the public site base path ever changes, set `GOATCOUNTER_SITE_BASE_PATH` before running the importer or refresh workflow.
If the public site origin changes, set `GOATCOUNTER_PUBLIC_SITE_URL` as well so absolute same-site referrers still normalize as internal traffic.

The importer still accepts the older section-based CSV/JSON structure for manual backfills, but GoatCounter export folders are now the canonical input.

## What The Importer Writes

`overview.json`

- `range_label`
- `updated_at`
- `pageviews`
- `unique_visitors`
- `reads`
- `read_rate`
- `pdf_downloads`
- `newsletter_submits`

`essays.json`

- `slug`
- `path`
- `title`
- `section`
- `views`
- `reads`
- `read_rate`
- `pdf_downloads`
- `primary_source`

`sources.json`

- `source`
- `medium`
- `campaign`
- `content`
- `visitors`
- `pageviews`
- `reads`

`modules.json`

- `slot`
- `collection`
- `clicks`
- `downstream_reads`

`periods.json`

- `label`
- `pageviews`
- `unique_visitors`
- `reads`
- `read_rate`
- `pdf_downloads`
- `newsletter_submits`

`timeseries_daily.json`

- `date`
- `pageviews`
- `unique_visitors`
- `reads`
- `read_rate`
- `pdf_downloads`
- `newsletter_submits`

`sections.json`

- `section`
- `pageviews`
- `reads`
- `read_rate`
- `pdf_downloads`
- `newsletter_submits`
- `sparkline_pageviews`
- `sparkline_reads`

`essays_timeseries.json`

- `slug`
- `path`
- `title`
- `section`
- `series[]`
  Each series row contains:
  - `date`
  - `pageviews`
  - `reads`
  - `pdf_downloads`
  - `newsletter_submits`

`journeys.json`

- `discovery_source`
- `discovery_type`
- `module_slot`
- `collection`
- `slug`
- `path`
- `title`
- `section`
- `views`
- `reads`
- `pdf_downloads`
- `newsletter_submits`
- `approximate_downstream`
- `attribution_note`

`journey_by_source.json`

- `discovery_source`
- `discovery_type`
- `discovery_mode`
- `views`
- `reads`
- `read_rate`
- `pdf_downloads`
- `pdf_rate`
- `newsletter_submits`
- `newsletter_rate`
- `approximate_downstream`
- `attribution_note`

`journey_by_collection.json`

- `collection_label`
- `discovery_type`
- `discovery_mode`
- `module_slot`
- `collection`
- `section`
- `views`
- `reads`
- `read_rate`
- `pdf_downloads`
- `pdf_rate`
- `newsletter_submits`
- `newsletter_rate`
- `approximate_downstream`
- `attribution_note`

`journey_by_essay.json`

- `title`
- `section`
- `slug`
- `path`
- `views`
- `reads`
- `read_rate`
- `pdf_downloads`
- `pdf_rate`
- `newsletter_submits`
- `newsletter_rate`
- `approximate_downstream`
- `attribution_note`

`sources_timeseries.json`

- `date`
- `source_type`
- `source`
- `pageviews`
- `reads`
- `read_rate`
- `pdf_downloads`
- `newsletter_submits`

## Dashboard V2 Semantics

The dashboard is still static Hugo output, but the page is now progressively enhanced with local JavaScript:

- hero KPI cards show current-window totals, previous-window deltas, and sparklines
- the main trend panel uses `timeseries_daily.json`
- section comparison cards use `sections.json`
- essay leaderboard sparklines use `essays_timeseries.json`
- funnel and pathway views use `journeys.json`
- source, collection, and essay journey comparison panels use the journey rollup files
- source quality ranking and mix use `sources.json` plus `sources_timeseries.json`

No dashboard-side network requests are made at runtime.

Honesty rules:

- if daily files are empty, the dashboard shows the committed aggregate snapshot and an explicit empty-state note
- pageview totals are treated as directly measured
- downstream read / PDF / newsletter pathways are labeled approximate because they are inferred from same-session order, not deterministic user identity stitching
- step-through rates shown in the journey rollups are calculated from measured pageviews divided into approximate downstream step counts from those same journey buckets
- no metric is backfilled from aggregate snapshots when the raw export is missing the underlying daily granularity

## Dashboard Presentation Conventions

The Dashboard V2 polish layer keeps one visual language across cards, charts, and tables:

- dashboard-specific design tokens live under `.dashboard-v2` in [`assets/css/main.css`](C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\assets\css\main.css)
- warm neutrals remain the base; the restrained gold accent is reserved for emphasis, annotation, and active state cues
- delta badges, signal sidebars, and funnel badges use typography and border treatment before color so the dashboard still reads well in low-saturation or reduced-contrast contexts
- approximate journey stages are visually distinct with dashed framing and explicit labels rather than warning colors

The dashboard handles:

- real data
- partial data
- empty arrays
- zero-value overview data

Use valid JSON only:

- `{}` for an empty object
- `[]` for an empty array

## Troubleshooting

Missing GoatCounter secret:

- If the refresh workflow fails with `GOATCOUNTER_API_KEY is not configured`, add that repository secret in `LPeasy/outsideinprint` under `Settings -> Secrets and variables -> Actions`.

Export fetch failure:

- Confirm the API key belongs to the correct GoatCounter site.
- Confirm the site URL is correct if you overrode `GOATCOUNTER_SITE_URL`.
- If the request fails with `404` on `/api/v0/export`, set `GOATCOUNTER_API_URL` to the authenticated GoatCounter API host or base instead of assuming it matches the public tracking URL.
- Retry transient failures; the fetch script already uses retry/backoff for 429 and common 5xx/network issues.

Unexpectedly empty dashboard data:

- Check that `goatcounter-export.csv` was written during the fetch step.
- Confirm the public site is sending GoatCounter pageviews and events.
- If pageviews exist but some source fields are blank, that usually means GoatCounter only had a plain referrer and no campaign tags for those visits.

Dashboard freshness looks stale:

- The freshness badge is driven by `overview.updated_at`.
- If the badge is stale, inspect the last successful `Refresh Analytics Data` run and the most recent commit touching `data/analytics`.

No publish after refresh:

- `publish-dashboard.yml` runs on pushes to `main` that touch the dashboard inputs, including `data/analytics/**`.
- If the refresh workflow says `No analytics changes detected.`, no new push is created and the dashboard publish workflow is correctly not triggered.

SSH publish failure:

- If dashboard clone or push fails with `Permission denied (publickey)`, confirm the public key matching `DASHBOARD_DEPLOY_KEY` is installed as a writable deploy key on `LPeasy/OutsideInPrintDashboard`.

## Security Notes

Deploy keys and local key files must never be committed.

- `dashboard_deploy_key`
- `dashboard_deploy_key.pub`

Keep those files local only while setting up publishing.
Store the private key only in the `DASHBOARD_DEPLOY_KEY` GitHub secret.
Install the matching public key only on the dashboard target repository as a writable deploy key.

The dashboard target repo should be treated as generated output only.
