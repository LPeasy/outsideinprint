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
5. The workflow commits changed snapshot files and then explicitly dispatches `publish-dashboard.yml`.
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
- literature
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
  Default: `https://gc.zgo.at/count.js`
- repository variable: `ANALYTICS_ALLOW_LOCAL=true`
  Only for deliberate local tracking tests

Static config lives in:

- [`hugo.toml`](C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\hugo.toml)

The relevant params are:

- `params.analytics.enabled`
- `params.analytics.allow_local`
- `params.analytics.goatcounter.site_url`
- `params.analytics.goatcounter.script_src`

### Refresh workflow

Required:

- repository secret: `GOATCOUNTER_API_KEY`

Optional:

- repository variable: `GOATCOUNTER_SITE_URL`
  Use this only if the analytics site URL changes from the default
- repository variable: `GOATCOUNTER_SITE_BASE_PATH`
  Default: `/outsideinprint`
  Use this only if the deployed public site moves to a different GitHub Pages base path

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
hugo server -D
```

Dashboard site only:

```powershell
hugo --config hugo-dashboard.toml server --disableFastRender
```

Local public-site tracking test:

```powershell
$env:ANALYTICS_ENABLED = "true"
$env:ANALYTICS_ALLOW_LOCAL = "true"
$env:GOATCOUNTER_SITE_URL = "https://outsideinprint.goatcounter.com"
hugo server -D
```

Clear those environment variables afterward if you do not want future local sessions to emit analytics.

## Refresh Workflow

`.github/workflows/refresh-analytics.yml` keeps these triggers:

- scheduled daily run
- `workflow_dispatch`

It also preserves:

- step-summary reporting
- cleanup of temporary working folders
- no-op commits when `data/analytics` has not changed
- explicit dispatch of `publish-dashboard.yml` after a successful data refresh
- minimum required workflow permissions for commit + dispatch

What it does:

1. Verifies `GOATCOUNTER_API_KEY`
2. Fetches a GoatCounter export into `./.analytics-refresh/raw`
3. Runs `scripts/import_analytics.ps1`
4. Commits `data/analytics` only when the normalized files changed
5. Dispatches `publish-dashboard.yml`

If configuration is missing, the workflow fails with an actionable message in both logs and the step summary.

## Manual Refresh

GitHub Actions:

1. Open `LPeasy/outsideinprint`
2. Go to `Actions`
3. Open `Refresh Analytics Data`
4. Choose `Run workflow`
5. Review the step summary for either:
   - `No analytics changes detected.`
   - a refreshed snapshot commit plus a triggered dashboard publish

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
- Retry transient failures; the fetch script already uses retry/backoff for 429 and common 5xx/network issues.

Unexpectedly empty dashboard data:

- Check that `goatcounter-export.csv` was written during the fetch step.
- Confirm the public site is sending GoatCounter pageviews and events.
- If pageviews exist but some source fields are blank, that usually means GoatCounter only had a plain referrer and no campaign tags for those visits.

Dashboard freshness looks stale:

- The freshness badge is driven by `overview.updated_at`.
- If the badge is stale, inspect the last successful `Refresh Analytics Data` run and the most recent commit touching `data/analytics`.

No publish after refresh:

- `publish-dashboard.yml` is dispatched only when `data/analytics` changed.
- If the refresh workflow says `No analytics changes detected.`, the dashboard publish step is correctly skipped.

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
