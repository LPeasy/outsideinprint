# Analytics System

## Bob's Almanack organic landing pages

Three separate entry pages (`/subscribe/weekend/`, `/subscribe/everyday-history/`, and `/subscribe/dialogue/`) use the same existing Buttondown newsletter account and tag. Their visible signup names Bob's Almanack; existing signup copy elsewhere is unchanged.

Use `utm_campaign=almanack-organic`, `utm_medium=organic_social`, and an allowlisted `utm_source` (`facebook`, `instagram`, `linkedin`, `pinterest`, or `x`). For individual posts, `utm_content` must be the route segment followed by `-01`, `-02`, `-03`, or `-04`, preserving the twelve fixed post codes. Use the same code for the same core post across platforms. Shared profile links have three additional fixed codes: `weekend-bio`, `everyday-history-bio`, and `dialogue-bio`. Each is accepted only on its matching `/subscribe/<segment>/` route; arbitrary segments or bio text are rejected. These codes identify the shared bio placement; they cannot identify which post led someone to the profile. Do not assign a numbered post code to a shared bio link or interpret bio visits as post-01 results.

Ready-to-use links:

| Placement | Link |
| --- | --- |
| Pinterest Weekends post 01 | `https://outsideinprint.org/subscribe/weekend/?utm_source=pinterest&utm_medium=organic_social&utm_campaign=almanack-organic&utm_content=weekend-01` |
| Instagram shared Weekends bio | `https://outsideinprint.org/subscribe/weekend/?utm_source=instagram&utm_medium=organic_social&utm_campaign=almanack-organic&utm_content=weekend-bio` |
| Instagram shared Everyday History bio | `https://outsideinprint.org/subscribe/everyday-history/?utm_source=instagram&utm_medium=organic_social&utm_campaign=almanack-organic&utm_content=everyday-history-bio` |
| Instagram shared Dialogue bio | `https://outsideinprint.org/subscribe/dialogue/?utm_source=instagram&utm_medium=organic_social&utm_campaign=almanack-organic&utm_content=dialogue-bio` |

Use the complete bio URL for each matching Instagram destination, preserving all four parameters exactly once. Auto-added `utm_source=ig`, `utm_medium=social`, and `utm_content=link_in_bio` without the campaign are not valid Almanack attribution; duplicate or rewritten parameters are rejected. The Pinterest URL already uses an individual post code. These links require the updated adapter to be released before the new platform and bio codes can be attributed; the source change does not update any social profile or retroactively relabel visits.

The analytics adapter stores only platform, route-derived segment, post code, and expiry in tab-scoped `sessionStorage` (`oip.almanack-acquisition.v1`). It expires thirty minutes after the tagged entry, without extending on navigation. A valid new entry replaces the old one; explicit invalid or other campaign parameters clear it. It survives same-origin sample reading and return navigation. Missing or blocked storage never prevents signup. Analytics-off builds do not access this storage. No email, visitor ID, arbitrary query value, or raw referrer is added to analytics or storage.

Pageview and event referrers carry the fixed label `almanack-organic|platform=instagram|segment=weekend|post=weekend-01`. `funnel_view` counts a landing-page load; `internal_promo_click` counts sample/illustration clicks; `newsletter_submit` counts a browser-valid submission attempt, not a confirmed subscription or unique new subscriber. Browser traffic can be blocked or undercounted. These pages are excluded from essay-read events.

The provider form still posts directly to Buttondown with the existing `outside-in-print` tag. There is no client confirmation callback, acquisition tag, webhook, or subscriber export in this change. Report provider-confirmed new subscribers separately from attempts; per-post confirmed conversions are unavailable. Existing subscribers and repeated submissions must not be counted as new confirmed acquisitions merely because a tag or attempt exists.

Focused checks: `tests/almanack_attribution.test.mjs` runs the adapter directly with a simulated clock and tab storage and is included in `tests/all.test.mjs`. `tests/test_subscriber_funnel_contract.ps1` checks rendered landing pages; the Almanack cases in `tests/hosted_analytics_browser.test.mjs` validate network behavior in CI. Browser checks intercept analytics and prevent all real provider submissions.

## Weekly email is the main report

Outside In Print has selected GoatCounter's hosted weekly email for routine traffic review. The hosted dashboard at <https://outsideinprint.goatcounter.com> is optional for closer inspection. Use Google Search Console occasionally to check search impressions, clicks, and indexing; site analytics cannot measure search exposure before someone visits.

The selected reporting format is GoatCounter's native weekly email: ten leading pages, per-page changes, and referrers. Its top-pages list can include custom events. Do not describe that email as a pageviews-only report, a custom scorecard, or a sales report.

**Account setup status:** sign-in is still required to enable weekly email, make the dashboard private, confirm `America/New_York`, exclude events from the dashboard traffic total, and update its displayed website from the legacy GitHub Pages URL to `https://outsideinprint.org`. Record the verification date and saved settings here after checking the signed-in GoatCounter account. Do not treat this guide as evidence that delivery or private access is enabled.

On September 15, 2026, Search Console showed verified ownership of `sc-domain:outsideinprint.org` and a successful submission of `https://outsideinprint.org/sitemap.xml`. Its displayed last-read date was May 30 with 200 discovered pages; that older result does not establish that the current sitemap has been recrawled.

The initial Search Console baseline covers August 17–September 13, 2026, the latest available 28-day window on September 15. Its account figures and leading pages/queries are saved locally in `output/measurement/search-baseline-2026-09-15.md`, which is ignored by Git and is not published with the site. Search Console uses California reporting dates, not the GoatCounter `America/New_York` day boundary. Keep future checks occasional and use explicit dates; no recurring export is required.

For a weekly review:

1. Check which pages and source labels received recorded visits.
2. Compare the per-page changes with the previous period and note recently published or promoted work.
3. Use the hosted dashboard to inspect a page or an event when the email raises a useful question.
4. Treat low counts and one-week changes as preliminary evidence. Make editorial changes after a pattern persists.

GoatCounter visits are not a count of identifiable people. Reloads and repeat visits can be grouped by GoatCounter's temporary session logic. Events are separate activity records and must not be added to page visits as traffic.

## Public collection and attribution

Public tracking is controlled by `ANALYTICS_ENABLED=true`; `hugo.toml` keeps tracking disabled by default. The locally hosted, pinned GoatCounter client sends only to `https://outsideinprint.goatcounter.com/count`. There are no provider URL or script overrides. Local previews do not send analytics unless deliberately enabled for testing.

The client sends page paths, public page titles, and the existing events below. It removes URL query strings and fragments from analytics page paths and prevents the GoatCounter client from sending the current URL query separately. Referrers are reduced to these fixed labels:

- `google`, `bing`, `newsletter`, `social`, `ai_referral`, `other`, `internal`, `direct_unknown`
- `newsletter-2045-launch` and `social-2045-launch` for the approved campaign
- `almanack-organic|platform=<fixed-platform>|segment=<fixed-segment>|post=<fixed-post>` for the organic landing-page campaign described above

Without a valid, unexpired Almanack entry, same-site navigation is classified as `internal` first. The existing `2045-launch` behavior remains: `utm_source=buttondown` maps to the newsletter campaign label, and `facebook`, `instagram`, `linkedin`, or `x` map to the grouped social campaign label. The new `almanack-organic` campaign accepts only the route, platform, medium, and post combinations documented above and retains them across same-site navigation. Other campaign values fall back to the referring site's classification. Full external referrer URLs, arbitrary campaign text, and query values are not analytics fields.

### Ready-to-share 2045 product links

Use these links in the named external channel. Keep internal site links untagged. All four social links report as `social-2045-launch`; Buttondown reports as `newsletter-2045-launch`.

| Channel | Copy this product link |
| --- | --- |
| Buttondown | `https://outsideinprint.org/shop/2045/?utm_source=buttondown&utm_campaign=2045-launch` |
| Facebook | `https://outsideinprint.org/shop/2045/?utm_source=facebook&utm_campaign=2045-launch` |
| Instagram | `https://outsideinprint.org/shop/2045/?utm_source=instagram&utm_campaign=2045-launch` |
| LinkedIn | `https://outsideinprint.org/shop/2045/?utm_source=linkedin&utm_campaign=2045-launch` |
| X | `https://outsideinprint.org/shop/2045/?utm_source=x&utm_campaign=2045-launch` |

The source label describes the information available for that request. Browser privacy controls and absent referrers can produce `direct_unknown`; the label does not prove how a reader originally found the site.

### Attribution changeover: September 15, 2026

Release `2147388` introduced the fixed source labels and went live at approximately 19:14–19:16 UTC on September 15, 2026 (15:14–15:16 in `America/New_York`). September 15 is a partial changeover day; September 16 is the first full reporting day under the new classification. Do not compare source-label totals across this changeover or backfill the historical snapshots with the new labels.

## Existing events and their limits

The site retains `essay_read_start`, `essay_read`, `pdf_download`, `newsletter_submit`, `internal_promo_click`, `collection_click`, `external_link_click`, `game_store_click`, `book_sample_open`, `checkout_start`, `studio_inquiry_email_prepare`, and `studio_inquiry_direct_email`.

The reading-page Share control adds no analytics event. It shares the resolved public title and clean canonical URL, without campaign parameters or fragments. Opening a device's share sheet is not evidence that a link was sent or that another reader visited.

Reading events are secondary engagement signals. On eligible reading pages, `essay_read_start` fires after 15 seconds of active time; `essay_read` requires 90 seconds and at least 75 percent scroll depth. Hidden-tab time is excluded. These thresholds are a proxy for reading, not proof that someone read or understood the piece.

`book_sample_open` records a sample-link click. `checkout_start` records an attempt to begin checkout, not a completed purchase. `newsletter_submit` records a form submission attempt, not a confirmed subscriber. Studio events record preparation of a draft or a direct-email click, not a sent or received inquiry.

Event metadata can include the public page, product code, format, collection, and link position. It excludes inquiry answers, email addresses, order identifiers, payment amounts, and other customer information. Existing commerce and newsletter providers remain the authorities for completed transactions and confirmed subscriptions.

Existing discovery slots include `article_collection_context` for article collection links and `studio_sample_exit` for marked Studio links. Slot labels identify where a click occurred; they do not establish a later inquiry or sale.

### Collection illustration measurement — September 19, 2026 changeover

Expanded collection illustration anchors use the same `collection_click` event, `collection_page` source slot, and article/collection metadata as their title links. This slot now combines title and illustration activations; it does not distinguish the two surfaces. Each link activation emits one event. Magnifiers only open the image viewer and must not emit an article-click event. September 19, 2026 is the measurement changeover: earlier collection-page totals covered titles only. September 19 is a partial changeover day; September 20 is the first full reporting day under the expanded coverage. Do not treat an increase across that boundary as evidence of readership growth, or refresh historical snapshots to manufacture continuity.

### Homepage featured-link measurement — September 19, 2026 changeover

The homepage's existing `homepage_v2_featured_lead` and `homepage_v2_featured_supporting` slots count title-link clicks. The September 19, 2026 release adds `homepage_v2_featured_lead_image`, `homepage_v2_featured_lead_cta`, and `homepage_v2_featured_supporting_image` for the other article links using the same `internal_promo_click` event. Illustration zoom and fallback controls are not article links and should not count as article clicks. Group the relevant title, image, and CTA slots for post-publication lead or supporting-card click totals. Historical totals for the existing slots are title-only. September 19 is a partial measurement-changeover day; September 20 is the first full reporting day under the expanded coverage. Do not present the new grouped totals as continuous with that older baseline.

The homepage Buttondown form posts directly to the provider. Keep `newsletter_submit` and its `homepage_reader_banner` slot as a form-attempt signal, never as a confirmation event. During weekly review, inspect Buttondown's provider-native confirmed active subscriber total and net change separately from GoatCounter attempts, using explicit periods. Do not calculate a homepage attempt-to-confirmed conversion rate: other signup channels, unsubscribes, and confirmation lag prevent a valid match. Keep subscriber identities out of GoatCounter, public files, and repository exports; do not join email addresses to site analytics. There is no site-side confirmed-subscriber callback; automated confirmation attribution would require a separate server-side integration and is outside this measurement change.

## Historical files are not current reporting

The committed `data/analytics/*.json` snapshots last contain data dated **April 14, 2026**. The import/export scripts, fixtures, and SEO rollout reports are retained as historical tools. Do not use them as current traffic reports or refresh them as part of this reporting setup.

The GitHub analytics refresh workflow remains disabled. Its scheduled trigger has been removed from source; `workflow_dispatch` is retained only for deliberate historical-tool use. Running that tool can commit refreshed snapshots, so it is not part of the weekly reporting operation.

For interpreting the preserved importer only: `GOATCOUNTER_PUBLIC_SITE_URL` Default: `https://outsideinprint.org/`.

There is no active custom dashboard, analytics export pipeline, local reporting service, or additional reporting schedule to configure. Native weekly email delivery is managed in GoatCounter.

## References

- [GoatCounter sessions and visitors](https://www.goatcounter.com/help/sessions)
- [GoatCounter events](https://www.goatcounter.com/help/events)
- [Google Search Console performance](https://support.google.com/webmasters/answer/7042828?hl=en)
- [SEO account checks](seo-admin-checklist.md)
