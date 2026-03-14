# Analytics System

Outside In Print uses a static, privacy-friendly analytics setup:

- Plausible for pageviews and custom events
- a small local tracking script for read-progress and click attribution
- Hugo data files in `data/analytics/` for the dashboard
- no cookies
- no backend
- no cookie banner logic

If Plausible is not configured, the site still builds and the dashboard still renders from the committed sample data.

The dashboard is published separately from the public reading site:

- public site repo: `LPeasy/outsideinprint`
- dashboard publish repo: `LPeasy/OutsideInPrintDashboard`

## Quick Start

If you are maintaining this for the first time, use this order:

1. Leave analytics disabled until you have a Plausible domain.
2. Put analytics snapshots into a folder such as `imports/analytics/`.
3. Run the importer:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_analytics.ps1 -InputPath .\imports\analytics
```

4. Start the dashboard build locally and review the dashboard site.
5. Commit the updated `data/analytics/*.json` files.
6. Push to `main` and let the dashboard publish workflow update `OutsideInPrintDashboard`.

## Where The Dashboard Lives

The dashboard no longer ships on the public Outside In Print website.

- The public site build uses `hugo.toml`.
- The dashboard build uses `hugo-dashboard.toml`.
- Dashboard content lives in `content-dashboard/`.
- The built dashboard is published into `LPeasy/OutsideInPrintDashboard`.

This keeps analytics reporting available without exposing it on the public-facing reading site.

## What Gets Tracked

Plausible pageviews:

- normal pageview tracking when analytics is enabled

Custom events:

- `essay_read_start`
- `essay_read`
- `pdf_download`
- `newsletter_submit`
- `internal_promo_click`
- `collection_click`
- `external_link_click`

Tracked properties are intentionally limited to:

- `slug`
- `title`
- `section`
- `path`
- `source_slot`
- `collection`
- `format`

No personal data, typed input, or session replay is tracked.

## Event Rules

`essay_read_start`

- fires once per page load
- only on eligible single content pages
- waits for 15 seconds of active time

`essay_read`

- fires once per page load
- only on eligible single content pages
- requires both:
  - 90 seconds of active time
  - 75 percent scroll depth
- active time pauses when the tab is hidden

`pdf_download`

- fires on PDF edition links and `.pdf` links caught by delegated click handling

`newsletter_submit`

- fires on newsletter form submission

`internal_promo_click`

- used for internal promotional links such as homepage selected pieces and related content

`collection_click`

- used for collection cards and collection-driven links

`external_link_click`

- fires on outbound `http` and `https` links

## Where Source Slots Are Used

Homepage:

- `homepage_newsletter`
- `homepage_featured_collection`
- `homepage_selected`
- `homepage_recent`

Other modules:

- `collection_page`
- `related_content`
- `random_link`
- `article_pdf`
- `section_list`
- `library_index`
- `page_newsletter`

Use lowercase snake case for new slots. Reuse an existing slot when the module is conceptually the same.

## Which Pages Get Read Tracking

Read tracking is limited to the standard single content template and then filtered again by section.

Tracked:

- essays
- literature
- syd-and-oliver
- working-papers

Not tracked for read events:

- homepage
- section lists
- collections
- library
- random redirect page
- start-here page
- dashboard

## Enabling Plausible

Default behavior:

- analytics is off by default
- local development does not send events
- production only sends events when a Plausible domain is configured

Config lives in:

- `hugo.toml`
- GitHub repository variables used by `.github/workflows/deploy.yml`

Important settings:

- `params.analytics.enabled`
- `params.analytics.allow_local`
- `params.analytics.plausible.domain`
- `params.analytics.plausible.script_src`
- `params.analytics.plausible.api_host`

Recommended GitHub repository variables:

- `ANALYTICS_ENABLED=true`
- `PLAUSIBLE_DOMAIN=your-domain.example`

Optional variables:

- `PLAUSIBLE_SCRIPT_SRC`
- `PLAUSIBLE_API_HOST`
- `ANALYTICS_ALLOW_LOCAL=true` for deliberate local testing

## Local Testing

Public site only:

```powershell
hugo server -D
```

Dashboard site only:

```powershell
hugo --config hugo-dashboard.toml server --disableFastRender
```

Local run with analytics on:

```powershell
$env:ANALYTICS_ENABLED = "true"
$env:ANALYTICS_ALLOW_LOCAL = "true"
$env:PLAUSIBLE_DOMAIN = "outsideinprint.example"
hugo server -D
```

After local testing, clear those environment variables if you do not want future local sessions to emit events.

## Dashboard Data Files

The separate dashboard site reads these committed files:

- `data/analytics/overview.json`
- `data/analytics/essays.json`
- `data/analytics/sources.json`
- `data/analytics/modules.json`
- `data/analytics/periods.json`

These are snapshots, not live API calls.

The dashboard is designed to handle:

- sample data
- partial data
- empty arrays and zero-value overview data

Do not leave files completely blank. Use valid JSON:

- `{}` for an empty object file
- `[]` for an empty array file

The importer handles that for you.

## Import Workflow

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_analytics.ps1 -InputPath .\imports\analytics
```

You can point `-InputPath` at either:

1. A folder containing any combination of:
   - `overview.json` or `overview.csv`
   - `essays.json` or `essays.csv`
   - `sources.json` or `sources.csv`
   - `modules.json` or `modules.csv`
   - `periods.json` or `periods.csv`
2. A single JSON bundle with top-level keys:
   - `overview`
   - `essays`
   - `sources`
   - `modules`
   - `periods`

Missing sections are allowed. The importer fills them with safe empty defaults.

## Automatic Refresh

The automated refresh workflow is in:

- `.github/workflows/refresh-analytics.yml`

It runs once per day and can also be launched manually with `workflow_dispatch`.

What it does:

1. Fetches a fresh analytics snapshot from Plausible.
2. Writes raw section files into a temporary folder.
3. Runs `scripts/import_analytics.ps1` to normalize the data into `data/analytics/*.json`.
4. Commits and pushes only if the normalized files actually changed.
5. Dispatches `.github/workflows/publish-dashboard.yml` so the separate dashboard site is republished.

The dashboard remains static throughout this flow. Hugo never makes live API calls.

### Automatic Refresh Configuration

Required GitHub configuration for the refresh workflow:

- repository secret: `PLAUSIBLE_API_KEY`
- repository variable: `PLAUSIBLE_SITE_ID`

You can reuse the existing `PLAUSIBLE_DOMAIN` repository variable instead of `PLAUSIBLE_SITE_ID` if your Plausible site identifier is the domain.

Optional:

- repository variable: `PLAUSIBLE_API_HOST`
  Use this only if you are self-hosting Plausible or querying a non-default API host.

The publish step still depends on the existing dashboard publish setup:

- repository secret: `DASHBOARD_DEPLOY_KEY`

### Manual Refresh Run

1. Open `LPeasy/outsideinprint` on GitHub.
2. Go to `Actions`.
3. Open `Refresh Analytics Data`.
4. Choose `Run workflow`.
5. After it finishes, check for either:
   - `No analytics changes detected.`
   - a new `Refresh analytics snapshot` commit plus a triggered `Build And Publish Dashboard` run

### Plausible Requirements For Automation

The automated fetch expects the Plausible site to expose:

- pageview and visitor metrics for the site
- custom event goals named:
  - `essay_read`
  - `pdf_download`
  - `newsletter_submit`
  - `internal_promo_click`
  - `collection_click`
- custom event properties used by the dashboard reports:
  - `path`
  - `slug`
  - `title`
  - `section`
  - `source_slot`
  - `collection`

If those goals or properties are missing in Plausible, the refresh workflow will fail clearly instead of writing partial data silently.

### Why The Refresh Workflow Dispatches The Publish Workflow

The refresh workflow commits `data/analytics/*.json` back to `main`, but it also explicitly dispatches `publish-dashboard.yml` afterward.

That keeps `publish-dashboard.yml` as the one publishing mechanism for the dashboard while avoiding a brittle dependency on workflow fan-out from an Actions-authored git push.

### What The Importer Writes

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

## Dashboard Publishing Setup

The publish workflow is in:

- `.github/workflows/publish-dashboard.yml`

One-time GitHub setup:

1. Create or confirm the target repository: `LPeasy/OutsideInPrintDashboard`.
2. In the target repo, enable GitHub Pages from the `main` branch root.
3. Generate an SSH deploy key pair.
4. Install the public key as a writable deploy key on `LPeasy/OutsideInPrintDashboard`.
5. Store the private key as a secret named `DASHBOARD_DEPLOY_KEY` in `LPeasy/outsideinprint`.

The workflow builds the dashboard with `hugo-dashboard.toml`, copies the generated files into the target repo, and pushes them to `main`.

The target dashboard repo should be treated as generated output only. Do not edit its published files manually, because each successful publish replaces them from the source repo build.

### Generate The Deploy Key

Create a dedicated key pair for this workflow:

```bash
ssh-keygen -t ed25519 -C "outsideinprint-dashboard-publish" -f ./dashboard_deploy_key -N ""
```

This gives you:

- `dashboard_deploy_key`
  This is the private key. Store its full contents in the source repo secret `DASHBOARD_DEPLOY_KEY`.
- `dashboard_deploy_key.pub`
  This is the public key. Add it to the dashboard repo as a deploy key with write access.

Keep both files local only while you are setting this up. They are secret material and should never be committed to the repository.

### Install The Deploy Key

1. Open `LPeasy/OutsideInPrintDashboard` on GitHub.
2. Go to `Settings` -> `Deploy keys`.
3. Add a new deploy key using the contents of `dashboard_deploy_key.pub`.
4. Turn on `Allow write access`.
5. Open `LPeasy/outsideinprint`.
6. Go to `Settings` -> `Secrets and variables` -> `Actions`.
7. Add a repository secret named `DASHBOARD_DEPLOY_KEY`.
8. Paste in the full private key from `dashboard_deploy_key`.

The workflow connects to GitHub over SSH and clones:

- `git@github.com:LPeasy/OutsideInPrintDashboard.git`

You can remove the old `DASHBOARD_REPO_TOKEN` secret once the SSH-based workflow has been tested successfully.

## Troubleshooting

Missing secret

- If the workflow fails immediately with `DASHBOARD_DEPLOY_KEY is not configured`, add the private key to `LPeasy/outsideinprint` under `Settings` -> `Secrets and variables` -> `Actions`.
- If the refresh workflow fails with `PLAUSIBLE_API_KEY is not configured` or `PLAUSIBLE_SITE_ID is not configured`, add the missing Plausible secret or variable in the same repository settings area.

SSH auth failure

- If clone or push fails with `Permission denied (publickey)`, confirm the public key was added to `LPeasy/OutsideInPrintDashboard` as a deploy key.
- Make sure `Allow write access` is enabled on that deploy key.
- Make sure the private key stored in `DASHBOARD_DEPLOY_KEY` exactly matches that public key.

Target repo Pages not enabled

- If the workflow succeeds but the dashboard URL does not update, check `LPeasy/OutsideInPrintDashboard` -> `Settings` -> `Pages`.
- The site should publish from the `main` branch root.

No-op publish

- If the workflow logs `No dashboard changes to publish.`, that means the generated output matched the current contents of the target repo.
- This is expected when no dashboard files changed.
- If the refresh workflow logs `No analytics changes detected.`, that means the normalized snapshot matched the current committed data files, so no dashboard publish was needed.

Manual workflow_dispatch test

1. Open `LPeasy/outsideinprint` on GitHub.
2. Go to `Actions`.
3. Open `Build And Publish Dashboard`.
4. Choose `Run workflow`.
5. After it finishes, open the dashboard URL and confirm the latest snapshot is live.

## First Live Deployment Checklist

- Save `DASHBOARD_DEPLOY_KEY` in `LPeasy/outsideinprint`.
- Save `PLAUSIBLE_API_KEY` in `LPeasy/outsideinprint` if you want automated refreshes.
- Save `PLAUSIBLE_SITE_ID` in `LPeasy/outsideinprint`, or reuse the existing `PLAUSIBLE_DOMAIN` variable.
- Install the matching public deploy key on `LPeasy/OutsideInPrintDashboard` with write access.
- Enable GitHub Pages on `LPeasy/OutsideInPrintDashboard` from the `main` branch root.
- Run the workflow manually once with `workflow_dispatch`.
- Confirm the dashboard URL resolves and the public site still does not expose `/dashboard/`.

## A Simple Monthly Workflow

Use this once per month:

1. Export Plausible reports into a working folder such as `imports/analytics/`.
2. Make sure you have at least `overview`, `essays`, `sources`, `modules`, or `periods` in CSV or JSON. Missing files are okay.
3. Run the importer.
4. Open the dashboard locally and review it.
5. Spot-check:
   - overview cards
   - top essays
   - modules and source labels
   - recent period values
6. Commit the updated `data/analytics/*.json` files.
7. Push to `main`.
8. Let the dashboard publish workflow update `OutsideInPrintDashboard`.

## Plausible Export Suggestions

One practical setup is:

1. Export top content into `essays.csv`.
2. Export acquisition or UTM summary into `sources.csv`.
3. Export custom event rollups for homepage and collection slots into `modules.csv`.
4. Export 7-day, 30-day, and all-time summaries into `periods.csv`.
5. Put KPI totals into `overview.csv`.

`overview.csv` can be either:

- one row with KPI columns, or
- a simple metric/value sheet

## UTM Naming Standard

Use:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`

Examples:

- Medium:
  `?utm_source=medium&utm_medium=referral&utm_campaign=cross-post&utm_content=author-bio-link`
- X:
  `?utm_source=x&utm_medium=social&utm_campaign=launch-thread&utm_content=hero-quote`
- Newsletter:
  `?utm_source=newsletter&utm_medium=email&utm_campaign=weekly-letter&utm_content=lead-essay`
- Guest post / referral:
  `?utm_source=guest-post&utm_medium=referral&utm_campaign=policy-roundup&utm_content=bio-link`
- Author bio link:
  `?utm_source=author-site&utm_medium=referral&utm_campaign=evergreen&utm_content=footer-bio`

Prefer stable campaign names over clever one-off labels.

## Adding Tracking To A New Module

For a normal internal promo link:

```go-html-template
<a href="{{ .RelPermalink }}" {{ partial "analytics/link-attrs.html" (dict "event" "internal_promo_click" "sourceSlot" "homepage_selected" "page" .) }}>
```

For a collection-driven link:

```go-html-template
<a href="{{ $url }}" {{ partial "analytics/link-attrs.html" (dict "event" "collection_click" "sourceSlot" "collection_page" "collection" $definition.slug "page" .) }}>
```

Keep these rules:

- use the existing event taxonomy
- prefer stable `slug` and `RelPermalink` values
- add a new `source_slot` only when it represents a real reporting module

## What Is Intentionally Not Tracked

- cookies or consent state
- personal identity
- typed form values
- session replay
- heatmaps
- draft or preview traffic unless explicitly enabled locally

## Monthly Maintainer Checklist

- Export current analytics reports.
- Run `scripts/import_analytics.ps1`.
- Review the dashboard locally with `hugo --config hugo-dashboard.toml server --disableFastRender`.
- Confirm sample-looking nonsense did not overwrite real labels.
- Commit updated `data/analytics/*.json`.
- Push and verify the deployed `OutsideInPrintDashboard` site.
