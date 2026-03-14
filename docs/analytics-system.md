# Analytics System

Outside In Print uses a static, privacy-friendly analytics setup:

- Plausible for pageviews and custom events
- a small local tracking script for read-progress and click attribution
- Hugo data files in `data/analytics/` for the dashboard
- no cookies
- no backend
- no cookie banner logic

If Plausible is not configured, the site still builds and the dashboard still renders from the committed sample data.

## Quick Start

If you are maintaining this for the first time, use this order:

1. Leave analytics disabled until you have a Plausible domain.
2. Put analytics snapshots into a folder such as `imports/analytics/`.
3. Run the importer:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_analytics.ps1 -InputPath .\imports\analytics
```

4. Start Hugo locally and review `/dashboard/`.
5. Commit the updated `data/analytics/*.json` files.
6. Push to `main` and let the normal GitHub Pages workflow deploy.

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

Normal local run with analytics off:

```powershell
hugo server -D
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

The dashboard at `/dashboard/` reads these committed files:

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

## A Simple Monthly Workflow

Use this once per month:

1. Export Plausible reports into a working folder such as `imports/analytics/`.
2. Make sure you have at least `overview`, `essays`, `sources`, `modules`, or `periods` in CSV or JSON. Missing files are okay.
3. Run the importer.
4. Open the site locally and review `/dashboard/`.
5. Spot-check:
   - overview cards
   - top essays
   - modules and source labels
   - recent period values
6. Commit the updated `data/analytics/*.json` files.
7. Push to GitHub Pages.

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
- Review `/dashboard/` locally.
- Confirm sample-looking nonsense did not overwrite real labels.
- Commit updated `data/analytics/*.json`.
- Push and verify the deployed dashboard.
