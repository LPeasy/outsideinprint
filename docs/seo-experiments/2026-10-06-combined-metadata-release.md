---
record_date: 2026-10-06
status: draft_not_deployed
pull_request: 147
baseline_source_ref: codex/jack-stratton-metadata-20261006
gsc_evidence_source: owner_supplied_verified_snapshot
gsc_snapshot_supplied_on: 2026-10-06
gsc_independently_retrieved: false
gsc_inspected_at_utc: null
deployment_at_utc: null
deployment_commit: null
deployment_run_url: null
google_pickup_first_observed_at_utc:
  jack_stratton: null
  mongol_empire: null
  public_private_pay: null
  standard_of_living: null
  camp_mystic: null
camp_mystic_candidate_version: "3.0"
camp_mystic_candidate_revision_date: "2026-10-06"
camp_mystic_candidate_edition: "Fifth web edition"
post_pickup_comparison_windows: null
---

# Combined metadata release: frozen baseline

Status: **DRAFT; not deployed.** This record supplements the preserved [Jack Stratton baseline](2026-10-06-jack-stratton-metadata.md) for the owner-approved five-page expansion of PR #147. It does not authorize merge or deployment.

The Jack record remains unchanged and is authoritative for that page's exact old and approved fields, supplied search figures, and observation details. The four additional pages and their supplied Search Console snapshot are recorded below.

`title` supplies the visible H1. `metadata_title` is the existing SEO-title field used by the HTML title, Open Graph, Twitter, and structured-data consumers. Where that field is absent, the resolver falls back to `title`; absence is not an empty authored value.

## Stable page identifiers and publication records

| Page | Canonical URL | Original publication date | Baseline version | Baseline edition |
| --- | --- | --- | --- | --- |
| Jack Stratton | https://outsideinprint.org/essays/jack-stratton-and-the-vulfpeck-model/ | 2025-05-28 | 2.0 | Seventh web edition |
| Mongol Empire | https://outsideinprint.org/essays/the-economics-of-the-mongol-empire/ | 2025-02-17 | 2.0 | Fourth web edition |
| Public and private pay | https://outsideinprint.org/essays/public-vs-private-pay-who-really-earns-more/ | 2025-08-19 | 2.0 | Fourth web edition |
| Standard of living | https://outsideinprint.org/essays/standard-of-living-vs-quality-of-life-what-the-numbers-miss/ | 2025-05-12 | 1.3 | Fourth web edition |
| Camp Mystic | https://outsideinprint.org/essays/camp-mystic-evacuation-timeline-guadalupe-river-flash-flood-july-4-2025/ | 2025-09-07 | 2.0 | Fourth web edition |

All slugs, canonical URLs, and original publication dates remain unchanged. Jack, Mongol Empire, Public Pay, and Standard of Living retain their bodies, source links, artwork, versions, editions, revision histories, and other fields outside the approved metadata changes.

Camp Mystic includes a separately approved, narrow body reconciliation with newer reporting. Its title, absent `metadata_title`, anchors, canonical URL, and original publication date remain unchanged. The candidate is version **3.0**, **Fifth web edition**, with a revision dated **2026-10-06**; see the [Camp Mystic editorial audit](../editorial-audits/99-refinement/camp-mystic-evacuation-timeline-guadalupe-river-flash-flood-july-4-2025-99-refinement-report.md). Camp is therefore a combined metadata-and-body change.

## Frozen source evidence

The following old values were read from the draft branch before its four-page expansion. Source files are under `content/essays/`; blob identifiers preserve which records supplied this baseline even after the branch advances.

| Source file | Baseline blob SHA |
| --- | --- |
| `the-economics-of-the-mongol-empire.md` | `ee617ee00d93710139d81dbcca1541d22092b2bb` |
| `public-vs-private-pay-who-really-earns-more.md` | `49e8d040688415e1a935e38e359c13d327a29bae` |
| `standard-of-living-vs-quality-of-life-what-the-numbers-miss.md` | `43fd5b45c2398e1572772a4f288395cad461d3c6` |
| `camp-mystic-evacuation-timeline-guadalupe-river-flash-flood-july-4-2025.md` | `8ebc1816d8bbdd0e90ec87cb7c3d6189d8689cea` |

### Mongol Empire

| Field | Before | Approved after |
| --- | --- | --- |
| `title` / H1 | The Economics of the Mongol Empire | The Economics of the Mongol Empire |
| `metadata_title` | Absent; falls back to `title` | Mongol Empire Economy: Trade, Money and the Silk Road |
| `subtitle` | How Genghis Khan Expanded a Global Trade Network | How Genghis Khan and His Successors Expanded Eurasian Trade |
| `description` | History often remembers Genghis Khan as a ruthless conqueror, but his most lasting impact was also economic: a protected trade network across much of Eurasia. | How the Mongol Empire reshaped Silk Road trade through protected routes, paper money, and a vast postal network ~ and what its economic legacy reveals. |

### Public and private pay

| Field | Before | Approved after |
| --- | --- | --- |
| `title` / H1 | Public vs Private Pay: Who Really Earns More? | Public vs. Private Sector Pay: Who Really Earns More? |
| `metadata_title` | Absent; falls back to `title` | Public vs. Private Sector Pay: Salary and Benefits Compared |
| `subtitle` | Jobs, Benefits, and Work-Life Trade-Offs Across Sectors | Salaries, Benefits, and Work-Life Trade-Offs Across Sectors |
| `description` | Public-sector compensation combines wages, benefits, pensions, and job security differently across occupations. This guide explains why simple averages mislead. | Compare U.S. public and private sector pay, benefits, and pensions ~ with 2025 data and a look at job security and occupational differences. |

### Standard of living

| Field | Before | Approved after |
| --- | --- | --- |
| `title` / H1 | Standard of Living vs. Quality of Life: What the Numbers Miss | Standard of Living vs. Quality of Life: What the Numbers Miss |
| `metadata_title` | Standard of Living vs. Quality of Life: What GDP Misses | Standard of Living vs. Quality of Life: Key Differences |
| `subtitle` | GDP is UP… So Why Does Life Feel So Hard? | GDP Is Up… So Why Does Life Feel So Hard? |
| `description` | Standard of living measures income and material conditions; quality of life also includes health, time, security, community, and meaning. Here is what GDP misses. | Standard of living measures income and material conditions; quality of life also includes health, time, security, community, and meaning. Here is what GDP misses. |

The title and description are preserved verbatim. The subtitle retains the single U+2026 ellipsis.

### Camp Mystic

| Field | Before | Approved after |
| --- | --- | --- |
| `title` / H1 | Camp Mystic Evacuation Timeline ~ Guadalupe River Flash Flood (July 4, 2025) | Camp Mystic Evacuation Timeline ~ Guadalupe River Flash Flood (July 4, 2025) |
| `metadata_title` | Absent; falls back to `title` | Remains absent; falls back to the unchanged `title` |
| `subtitle` | Why 30 Minutes Matters ~ Testing the Official Accounts Against the USGS Hunt Gauge | Why 30 Minutes Matters ~ Reported Evacuation Times and the Limits of the USGS Hunt Gauge |
| `description` | When reporters began reconstructing the events at Camp Mystic on the night of July 4, 2025, the story turned on a timeline | Compare reported Camp Mystic evacuation times with USGS Hunt gauge records from July 4, 2025, with clear limits on what the data can establish. |

The old description has no terminal period. The separately approved body reconciliation is recorded in the October 6 version 3.0 revision entry and linked editorial audit; this does not broaden the approved metadata scope.

## Frozen owner-supplied Search Console snapshot

The owner supplied this verified snapshot on **October 6, 2026**. These figures were not independently retrieved during preparation of this record. No inspection time was supplied, so no UTC inspection timestamp is inferred.

[Supplied fixed-date Google Search Console report](https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aoutsideinprint.org&breakdown=page&metrics=CLICKS%2CIMPRESSIONS%2CCTR%2CPOSITION&start_date=20260906&end_date=20261003&compare_start_date=20260809&compare_end_date=20260905)

Property: `sc-domain:outsideinprint.org`. Search type: **Web**. Breakdown: page. Both periods contain **28 days, inclusive**:

- Recent: September 6–October 3, 2026.
- Prior: August 9–September 5, 2026.

| Page | Recent clicks | Recent impressions | Recent CTR | Recent average position | Prior clicks | Prior impressions | Prior CTR | Prior average position |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Camp Mystic | 25 | 329 | 7.6% | 5.7 | 12 | 183 | 6.6% | 8.5 |
| Mongol Empire | 7 | 681 | 1% | 7.5 | 1 | 67 | 1.5% | 39.7 |
| Public and private pay | 2 | 538 | 0.4% | 7.8 | 1 | 459 | 0.2% | 23.6 |
| Standard of living | 0 | 443 | 0% | 11.7 | 1 | 114 | 0.9% | 39.9 |

Figures preserve the supplied display precision; rounded CTR is not replaced by a recalculation. Jack's separate figures and report settings remain in its original baseline. The Web setting above applies to this four-page snapshot and does not establish missing settings for the earlier Jack observation.

Query, device, and country breakdowns were not supplied for these four pages. Historical deployment dates for the old metadata are unknown.

## Interpretation limits

These are low-click-volume baselines with substantial changes in average position and impressions. CTR differences may reflect ranking position, query mix, device, country, or changing search demand rather than title or description quality.

All five articles have September 27, 2026 revision entries within the recent baseline window. Those earlier body/source revisions complicate the pre/post comparison. Camp Mystic's new body reconciliation adds a further confound: any subsequent change cannot be isolated to metadata alone.

Google may rewrite titles and snippets or draw snippets from article bodies. Results will be treated as directional observations, not causal estimates or promises of traffic improvement.

## Release and comparison protocol

1. After explicit publication approval and successful production deployment, record the actual deployment timestamp, commit, and run URL. Verify each live title/H1, subtitle, metadata description, social/schema fields, canonical URL, and publication record. Verify unchanged bodies for the four metadata-only articles and the approved narrow Camp reconciliation. Keep the frozen before values and supplied baseline figures intact.
2. Record first observed Google pickup separately for each exact canonical URL. Preserve the query, observation date, device, country, and displayed title/snippet. First observed pickup is not an exact indexing timestamp. Leave pickup pending where evidence is unavailable.
3. For each page, compare a complete 28-day reporting window after observed pickup with the frozen September 6–October 3 baseline. Start after the observed pickup day, exclude deployment/transition days, record exact inclusive dates, and wait until all 28 dates are complete in Search Console. Do not derive the window from draft preparation or assume all pages are picked up together.
4. Retain the exact-page filter and Web search setting for these four pages. Compare clicks, impressions, CTR, and average position. Examine query mix and like-for-like query/device/country segments where volume permits. Record missing baseline controls and any changed filters rather than implying they were held constant. Follow Jack's original record for its baseline settings.
5. Report uncertainty, intervening content/site changes, ranking changes, and Camp's body reconciliation alongside the results. Extend observation when volume is too low for a useful decision. Do not attribute a few clicks or rounded CTR movements to metadata alone.

This record creates no schedule, indexing request, provider action, or analytics-account change. Deployment, pickup, and post-pickup comparison dates remain pending.
