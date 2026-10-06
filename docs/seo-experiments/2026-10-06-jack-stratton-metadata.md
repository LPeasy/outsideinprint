---
record_date: 2026-10-06
status: draft_not_deployed
baseline_commit: f4d535a0199d4e0ef9983b2d798040e46a532323
baseline_observed_at_utc: "2026-10-06T16:50:00Z"
baseline_observation_time_precision: approximate
evidence_source: owner_supplied_gsc_inspection
deployment_at_utc: null
deployment_commit: null
deployment_run_url: null
google_pickup_first_observed_at_utc: null
---

# Jack Stratton metadata baseline and comparison plan

Status: **DRAFT; deployment PENDING.** The wording below is approved for preparation. Publication approval and a successful production deployment remain required. The null release fields above are placeholders, not evidence that this change is live.

Canonical page and exact-page GSC filter: <https://outsideinprint.org/essays/jack-stratton-and-the-vulfpeck-model/>.

Source file: `content/essays/jack-stratton-and-the-vulfpeck-model.md`. Old values were read with `git show f4d535a0199d4e0ef9983b2d798040e46a532323:content/essays/jack-stratton-and-the-vulfpeck-model.md`.

## Proposed fields

The requested SEO title is stored in the existing `metadata_title` field, which the metadata resolver reads. The `title` supplies the visible H1. Values below are verbatim.

| Field | Before | Approved after |
| --- | --- | --- |
| `title` / H1 | How Jack Stratton Hacked the Music Industry with Funk, Friends, and Irresistible Groove | Jack Stratton: Vulfpeck Founder, Producer, and Bandleader |
| `metadata_title` | Jack Stratton and Vulfpeck’s Independent Music Model | Jack Stratton: Vulfpeck Founder, Producer, and Bandleader |
| `subtitle` | The Man Behind Vulfpeck, the Funk Collective That Outsmarted the System | His musical roots, minimalist funk, and independent path from Sleepify to Madison Square Garden. |
| `description` | A profile of Jack Stratton and Vulfpeck’s independent model, from Sleepify and Madison Square Garden to fan-first releases and creative control. | Explore Jack Stratton’s musical roots, production style, and role as Vulfpeck’s founder, from Sleepify to Madison Square Garden and independent artist control. |

Scope is limited to the four approved metadata fields: `title`, `metadata_title`, `subtitle`, and `description`. Version, edition, revision history, and all dates remain unchanged. The article body, source links, artwork, slug, canonical URL, and original publication date (`2025-05-28`) remain unchanged. The unpublished broad rewrite remains withdrawn. The existing body is version 2.0, revised September 27, 2026; that body revision falls within the more recent baseline window. The historical deployment date of the old metadata is unknown.

## Frozen owner-supplied baseline

The owner supplied a live Google Search Console inspection on October 6, 2026, at approximately 16:50 UTC. These figures were not independently retrieved. The [supplied GSC report link](https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aoutsideinprint.org&num_of_days=28&compare_date=PREV&breakdown=query&metrics=CLICKS%2CIMPRESSIONS%2CCTR%2CPOSITION&page=!https%3A%2F%2Foutsideinprint.org%2Fessays%2Fjack-stratton-and-the-vulfpeck-model%2F) uses relative date parameters; the fixed dates and displayed figures below preserve the observation.

Both windows contain 28 days, inclusive:

| Exact-page metric | September 6 through October 3, 2026 | August 9 through September 5, 2026 |
| --- | ---: | ---: |
| Clicks | 8 | 4 |
| Impressions | 2,949 | 1.27K (rounded display; precise total not supplied) |
| CTR | 0.3% | 0.3% |
| Average position | 10.3 | 11.5 |

The supplied query rows are not exhaustive. `jack stratton` accounts for approximately 74% of the page's impressions in the more recent window.

| Query | Recent clicks | Recent impressions | Recent CTR | Recent position | Prior clicks | Prior impressions | Prior CTR | Prior position |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jack stratton | 5 | 2,187 | 0.2% | 10.8 | 1 | 903 | 0.1% | 11.6 |
| jack stratton vulfpeck | 0 | 48 | Not supplied | 9.2 | Not supplied | Not supplied | Not supplied | Not supplied |
| jack vulfpeck | 0 | 28 | Not supplied | 9.0 | Not supplied | Not supplied | Not supplied | Not supplied |
| vulfpeck jack stratton | 0 | 28 | Not supplied | 9.9 | Not supplied | Not supplied | Not supplied | Not supplied |

The owner-supplied search result showed the short SEO title, “Jack Stratton and Vulfpeck’s Independent Music Model.” Its snippet drew from the body biography rather than the meta description. No Bing data was supplied. Device, country, search-type settings, and a complete query export were not supplied, so this record does not infer them.

The proposed wording puts Stratton's identity and role first, matching the dominant supplied query more directly. Confidence in that intent match is **moderate**; confidence in a traffic lift is **low**. Eight recent clicks, rounded CTR, changing position, the September body revision, and unknown historical metadata deployment timing prevent attributing the observed baseline changes to metadata.

## Comparison after approval and publication

1. After successful publication, fill in the actual UTC deployment timestamp, deployed commit hash, and production run URL. Verify the live H1, search-title metadata, subtitle, description, canonical URL, and preserved body before marking the release complete. Keep this frozen baseline intact.
2. Record when Google pickup is first observed for the exact URL, with the query, observation date, device, country, and displayed title/snippet. Google may rewrite either field; a differing display does not by itself establish that pickup failed. Distinguish the first observed pickup from an unknown exact indexing time. Until pickup is supported by evidence, keep it pending.
3. Compare the first complete 28-day reporting window after observed pickup against the frozen September 6 through October 3 baseline. Exclude deployment/transition days from the post-change window, record its exact inclusive dates, and wait until all dates are complete in the report. Preserve the same exact-page filter and report settings. Do not set dates from the draft preparation time.
4. Compare clicks, impressions, CTR, and average position for the page and each of the four named queries. Retain any additional query rows separately. Record device and country breakdowns and compare like-for-like segments where volume allows. Check position and query-mix changes before interpreting CTR or click changes; record any filter differences or missing baseline controls explicitly.
5. Report the result as directional evidence, not a causal estimate. Do not claim a lift from a few clicks or rounded percentages. Note intervening body, metadata, site, or ranking changes and extend observation if volume is too low for a useful decision. No Bing conclusion is supported without separate Bing evidence.

This record creates no schedule, provider action, indexing request, or external-app write. Follow-up dates remain unset until an approved deployment and observed pickup provide the starting points.
