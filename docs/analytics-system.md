# Analytics System

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

Same-site navigation is classified as `internal` first. The only campaign identifier accepted is the exact value `2045-launch`: `utm_source=buttondown` maps to the newsletter campaign label, and `facebook`, `instagram`, `linkedin`, or `x` map to the social campaign label. Other campaign values fall back to the referring site's classification. Full external referrer URLs, arbitrary campaign text, and query values are not analytics fields.

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
