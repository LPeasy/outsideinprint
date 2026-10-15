# Newsletter campaign register and weekly reporting

The campaign register is `data/newsletter_campaigns.json`. The offline command is
`scripts/newsletter_attribution.py`; it uses the Python standard library and does
not call a provider, deploy a Worker, change scheduled posts, or send email.
Store private ledger snapshots, original exports, import databases, and generated
reports under ignored `output/newsletter-attribution/` or an access-controlled
directory outside the repository. Reports contain aggregates, with no subscriber,
signup, event, or newsletter identifiers. Small counts can nevertheless be
sensitive; review a report before sharing it.

## Campaign links

The initial register preserves all 75 combinations already accepted by the
Almanack organic adapter: three landing segments, five content placements
(01–04 and bio), and five platforms. Registration is evidence of an allowed link,
not evidence that a post was scheduled or published. Unknown titles, dates,
permalinks, and batch values remain explicitly unknown. Existing `utm_campaign`
and `utm_content` values stay unchanged; `code` gives each complete legacy tuple
a distinct internal identity. The commerce campaign is outside this service.

Validate the register and generate an existing link:

```powershell
.\tools\bin\generated\python.cmd scripts/newsletter_attribution.py validate-register
.\tools\bin\generated\python.cmd scripts/newsletter_attribution.py link almanack-organic-pinterest-weekend-01
```

Register a new post by adding one reviewed object. Use a distinct `code` and
`utm_campaign` per post/platform placement. A weekly batch belongs only in
`batch`. This example illustrates the schema; it is not a registered or
scheduled post:

```json
{
  "code": "almanack-20261024-facebook-post01",
  "platform": "facebook",
  "format": "image_post",
  "title": "Verified content title",
  "destination": "https://outsideinprint.org/subscribe/weekend/",
  "landing_path": "/subscribe/weekend/",
  "scheduled_at": null,
  "published_permalink": null,
  "batch": "2026-10-24",
  "attribution_scope": "post",
  "legacy": false,
  "utm_campaign": "almanack-20261024-facebook-post01",
  "utm_source": "facebook",
  "utm_medium": "organic_social",
  "utm_content": "post01"
}
```

For a shared Instagram bio destination, retain `attribution_scope: channel_link`.
Never relabel it as a particular post. Set dates and permalinks only from verified
scheduling/publication evidence. New register entries must be released to both
frontend and Worker before using their links. Do not edit already scheduled
posts during this rollout.

## CSV import contract

Export Meta, Pinterest, and GoatCounter manually. Preserve the original file
privately. Normalize only the necessary rows into this exact UTF-8 CSV shape:

```csv
campaign_code,metric,value,period_start,period_end,bucket_kind
almanack-organic-facebook-weekend-01,outbound_clicks,12,2026-10-10T00:00:00-04:00,2026-10-17T00:00:00-04:00,interval
```

Use the provider's explicit campaign/post mapping. Missing campaign evidence is a
gap to investigate, not permission to guess. GoatCounter's legacy referrer label
`almanack-organic|platform=facebook|segment=weekend|post=weekend-01` maps to the
complete matching register tuple. Only import campaign **page visits** as
`page_visits`; exclude events such as `newsletter_submit` and `funnel_view` from
that metric. A browser form attempt is not an accepted provider signup.

When both analytics and the new attribution switch are enabled, a new non-legacy
registered tuple produces `oip-campaign|code=<code>` in GoatCounter. Import only
ordinary `event=false` page views carrying that label as tagged landing-page
visits. This mapping uses current-page tags only; subsequent untagged navigation
does not add new-campaign visits. Record that definition in the import provenance.
Legacy labels retain their existing session behavior and must not be described
as having the same landing-page-only scope. Neither measure is unique people.

Allowed metrics are `reach`, `impressions`, and `outbound_clicks` for Meta and
Pinterest, and `page_visits` for GoatCounter. Record the provider's actual metric
definition in a separate JSON file, for example:

```json
{"outbound_clicks":"Outbound link clicks reported by Meta for the specified post and interval; copied from the export definition."}
```

The wording is an example, not a substitute for reviewing the provider's export.
Supply the source's calendar timezone and date range, with an **exclusive** end.
Intervals need explicit UTC offsets. Daily rows must span one local calendar day;
use `interval` for an actual provider interval total. Do not relabel daily buckets
as interval totals to evade a timezone mismatch.

```powershell
.\tools\bin\generated\python.cmd scripts/newsletter_attribution.py import-csv --csv output/newsletter-attribution/meta-normalized.csv --db output/newsletter-attribution/imports.sqlite --source meta --date-start 2026-10-10 --date-end 2026-10-17 --timezone America/New_York --definitions output/newsletter-attribution/meta-definitions.json
```

Each import records source, SHA-256 of the normalized file, source date range,
timezone, metric definitions, and UTC import time. Reimporting identical bytes
with identical provenance is a no-op. Identical metric rows in another file are
also skipped. Conflicting or overlapping rows roll back the entire import.
Correct a disputed import only after reviewing the original export and preserving
the old database; build a replacement database from reviewed source files. Do not
add revised totals to an existing interval. Original files stay private and their
names are not copied into the aggregate report.

Daily buckets in another timezone remain visible as source observations and are
excluded from exact Eastern totals. Intervals crossing the report boundary are
also withheld. There is no proportional allocation. Reach is non-additive across
days: a weekly reach total needs one exact-week provider observation. Impressions,
outbound clicks, and visits stay separate. Absent data is unavailable, not zero;
partial coverage is explicitly labeled.

## Private ledger snapshot contract

The Worker admin export returns `schema_version: 1` with the following shape.
The identifiers below are placeholders. The snapshot is private and must never be
committed or attached to a public report:

```json
{
  "schema_version": 1,
  "exported_at": "2026-10-19T12:00:00Z",
  "newsletter_id": "private-provider-id",
  "baseline": {"completed_at": null, "subscriber_count": 0, "known_test_count": 0, "gaps": []},
  "health": {
    "last_reconciliation_success_at": null,
    "last_reconciliation_attempt_at": null,
    "last_reconciliation_error": null,
    "webhook": {"checked_at": null, "status": "unknown", "last_delivery_at": null}
  },
  "signups": [{
    "signup_ref": "random-reference",
    "subscriber_id": "private-subscriber-id",
    "campaign_code": null,
    "accepted_at": "2026-10-10T05:00:00Z",
    "is_new": true,
    "is_test": null
  }],
  "subscribers": [{
    "subscriber_id": "private-subscriber-id",
    "status": "unactivated",
    "is_test": null,
    "is_baseline": false,
    "campaign_code": null,
    "acquisition_signup_ref": "random-reference",
    "signup_at": "2026-10-10T05:00:00Z",
    "first_confirmed_at": null,
    "first_confirmation_observed_at": null,
    "confirmation_time_known": false
  }],
  "events": [{
    "event_id": "private-event-id",
    "subscriber_id": "private-subscriber-id",
    "type": "unsubscribed",
    "occurred_at": null,
    "observed_at": "2026-10-16T10:00:00Z",
    "event_time_known": false
  }]
}
```

All timestamp strings have explicit offsets; exports use UTC. `is_test: null`
means unreviewed and is excluded from non-test counts. Only explicit `false`
qualifies as non-test. Review known owner/test records by documented identity;
plus-address syntax alone is insufficient. Missing list arrays or health/baseline
objects fail validation instead of becoming empty counts. Conflicting duplicate
identities fail; identical retries are deduplicated.

`first_confirmed_at` is populated only with supported timestamp evidence. When a
reconciliation observes an active subscriber but cannot recover confirmation time,
keep that field null, set `first_confirmation_observed_at`, and set
`confirmation_time_known: false`. Signup time is never used as confirmation time.
The original acquisition mapping remains fixed after unsubscribes/resubmissions.
Retain pre-existing subscribers as baseline records, excluded from new campaigns.

Snapshot `gaps` must contain authored operational statements, with no emails,
subscriber IDs, or raw provider error bodies. Snapshots reject email/IP/raw-body
fields. Do not place arbitrary provider responses into the snapshot. The report
selects operational health fields and reduces reconciliation error details to a
boolean. Webhook status `enabled` (or `healthy`) means a verified current enabled/working hook;
the last received delivery by itself does not establish this.

## Weekly and baseline commands

```powershell
.\tools\bin\generated\python.cmd scripts/newsletter_attribution.py baseline --ledger output/newsletter-attribution/ledger.json --output output/newsletter-attribution/baseline.json
.\tools\bin\generated\python.cmd scripts/newsletter_attribution.py report --ledger output/newsletter-attribution/ledger.json --db output/newsletter-attribution/imports.sqlite --week-start 2026-10-10 --output output/newsletter-attribution/week-2026-10-10.json
```

`--week-start` must be a Saturday. The interval is Saturday 00:00 through the
following Saturday 00:00, America/New_York, excluding the ending boundary. DST
weeks contain 167 or 169 hours; the command converts each calendar boundary
separately. It uses IANA timezone data when available. A standard-library fallback
implements US Eastern rules for 2007–2099 on Windows without timezone data;
dates outside that range require IANA data.

For each observed campaign and an explicit unknown-attribution group, the report
provides accepted **new** non-test signups, known-time first confirmations this
week, unknown-time confirmations observed this week, eventual confirmations from
this week's signup cohort, pending members of that cohort, and all pending
non-test acquisitions as of the snapshot.
The cohort confirmation rate is eventual confirmed acquisitions divided by accepted
new signups from the same cohort. It is null for an empty cohort. Delayed
confirmations can improve the cohort rate in a later export without appearing in
the earlier week's confirmed-this-week count. Unsubscribes do not erase acquisition.

Audience totals describe the snapshot time, including current active non-test
subscribers, current unsubscribed non-test subscribers, and unique non-test
subscribers with an unsubscribe event during the week. Unknown unsubscribe times
are reported separately by observation date unless dated evidence for that
subscriber was observed at the same time or later. Older dated evidence cannot
hide a later unknown observation after resubscription. This is a conservative
evidence reconciliation rule, not proof of a lifecycle-cycle match; a payload
without a reliable event identity cannot distinguish every repeated undated cycle.
Active means still subscribed under the provider lifecycle:
`regular`, `premium`, `gifted`, `trialed`, `churning`, `churned`, `paused`, or
`past_due`; it does not promise that paused readers currently receive deliveries.
`unpaid` and `upcoming` are not silently classified as active. Unreviewed test classifications are
counted separately and make the eligible totals incomplete. The report does not
claim an end-of-week audience reconstructed from a later status snapshot.

Successful reconciliation becomes stale at 36 hours and verified webhook health
at two hours, matching the Worker's health endpoint. Recent failed deliveries are
reported even when the hook remains enabled. A failed fetch leaves prior counts intact with a warning. A snapshot before
the week ending boundary is marked incomplete. Reports contain the underlying
provider observations and import receipts so timezone/coverage gaps remain visible.
No automatic social APIs, dashboard application, cleanup, or email delivery is
introduced. Retention approval and rollout gates belong to the deployment guide.

Focused verification:

```powershell
.\tools\bin\generated\python.cmd tests/test_newsletter_attribution.py
```
