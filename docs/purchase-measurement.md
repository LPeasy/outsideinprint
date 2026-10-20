# Optional purchase measurement

Prepared on October 20, 2026. This is an unpublished implementation. Source defaults are disabled; it does not establish a live GA4 property, Merchant Center link, worker deployment, or reporting result.

## Coverage and evidence

GA4 supplies consented browser acquisition context. The commerce worker supplies the only `purchase` event, after checking the signed Square webhook against the current payment, order, catalog, amount, currency, and fulfillment rules. Visiting `/shop/thanks/` does not emit a purchase. Existing GoatCounter `checkout_start` events remain attempt counts.

This version covers eligible direct EPUB card purchases through the OIP worker. It does not measure paperback checkout, support payments, Amazon, Steam, or other external sales. It withholds purchases without usable consented context, confirmed card capture time, or a valid session window. Buyers do not have to return from Square. Browser restrictions and consent choices still cause undercounting. Reporting is not an accounting ledger or a guarantee of keyword attribution.

The first production changeover has no historical backfill. Orders created while measurement is off or in test mode cannot become eligible when live mode is enabled. Refunds present before verification exclude the purchase; this version does not send later refund adjustments. Use Square for net sales and reconciliation.

## One emitter and duplicate prevention

- Do not add a browser `purchase` event, thank-you-page conversion, second server emitter, GTM purchase tag, or a direct Merchant website purchase source alongside this design.
- Bind attribution, the GA4 measurement ID, trusted mode, an opaque transaction ID, the selected internal SKU and its exact Merchant item ID, and the Square-returned order ID when the checkout is created. Browser input cannot select live/test mode or supply the Merchant item ID.
- Claim a unique order and transaction in D1 before the first network send. Repeated webhook IDs, different webhook IDs for the same order, and concurrent handlers cannot create another send attempt.
- An interrupted claim or uncertain network response stays uncertain. There is no automatic resend, lease recovery, backfill, or ledger deletion path. This deliberately favors undercounting over duplicate purchases.
- HTTP 2xx means `SENT_UNVERIFIED`, not proof that Google processed or displayed the event. Keep that distinction in receipts and dashboards.

## Test exclusion

Local tests replace every provider request with synthetic responders. They do not call Google, Square, Resend, or their validation endpoints.

Before any separately approved controlled production checkout, set the trusted worker mode to `test` **before creating the checkout** and verify the captured test mode. A test checkout remains excluded after live mode resumes. Sandbox, zero-dollar, legacy, pre-activation, unmapped, and non-EPUB orders cannot emit purchases. An owner-controlled exclusion registry can suppress a known order before dispatch; it cannot recall an already sent event. Never assume a refund, a browser flag, or a later dashboard filter will remove a test purchase. Never conduct an unmarked production test while live reporting is enabled.

## Configuration and rollout sequence

| Surface | Setting | Prepared value |
| --- | --- | --- |
| Website | `params.purchase_analytics.enabled` | `false` |
| Website | `params.purchase_analytics.measurement_id` | empty |
| Website build override | `ANALYTICS_PURCHASE_ENABLED` | unset until approved activation |
| Website build override | `ANALYTICS_PURCHASE_MEASUREMENT_ID` | private binding to the approved stream |
| Worker | `GA4_PURCHASE_MODE` | `off` |
| Worker | `GA4_MEASUREMENT_ID` | empty |
| Pages and consumer | `GA4_MERCHANT_ITEM_IDS` | `{}`; private verified SKU-to-Merchant-item-ID JSON |
| Worker secret | `GA4_API_SECRET` | owner-controlled secret store only |
| Worker | `GA4_PURCHASE_LIVE_AFTER` | explicit future activation cutoff, epoch seconds |

1. Recheck Merchant Center conversion sources and the website/worker inventory. Auto-tagging was enabled in a separately approved action; it alone does not collect purchases.
2. Reuse the approved GA4 property and its reviewed account settings. Keep exact account identifiers and settings evidence private. The owner personally reviews and accepts any required agreements.
3. Use the approved web stream for the canonical website. Verify enhanced measurement, Google signals, advertising personalization, and optional user-provided data collection are disabled. Enhanced measurement must be off so automatic form, history, and outbound events cannot collect unsanitized URLs.
4. Handle the Measurement Protocol secret directly through owner-controlled interfaces; never put it in chat, source, evidence, commands, or logs. Verify property and stream bindings before activation.
5. Review the system change through the repository PR process. Apply the additive D1 migration and deploy worker code in `off` mode under the approved worker release process. Release the website with purchase analytics disabled. Verify release receipts before activation.
6. Link the approved GA4 property as the Merchant conversion source. Use one purchase source. Inspect any existing GA4 purchase/key-event settings before adding or changing them; do not manufacture another purchase event or Google Ads import. Bind the exact Merchant item IDs verified for eligible products in private `GA4_MERCHANT_ITEM_IDS` configuration on both Pages and consumer. Merchant IDs are case-sensitive strings and may differ from internal EPUB SKUs. Checkout snapshots the selected SKU and mapped ID; the verified server event uses that stored ID only while the current trusted mapping still agrees. Missing, malformed, removed, or changed mappings suppress measurement without affecting checkout or fulfillment. Keep the mapping aligned with the approved checkout SKU allowlist; a visible Merchant listing does not enable checkout.
7. Only after the approved production bindings, test exclusions, privacy UI, and consent behavior have been checked, set a fresh cutoff and enable live collection. Frontend and worker must point to the same property. Keep tests excluded at creation.

Each account mutation and deployment requires its own approved scope under the LLC controls. The bootstrap approval does not authorize later stream creation, credentials, source linking, live events, purchases, publication, or deployment.

The production workflow forwards both website build overrides to its site build and output checks. Empty overrides preserve the disabled source defaults. The public privacy notice must carry the actual release date; the prepared October 20 date must change if publication occurs later.

## Consent and data limits

No Google script, cookie, or request occurs before opt-in. Allow and decline controls have equal weight; preferences remain available. Google advertising storage and personalization stay denied. The browser sends sanitized page metadata and bounded landing `srsltid`, then obtains real client/session identifiers. Missing, blocked, stale, or late callbacks omit attribution without preventing checkout. Checkout waits no more than 300 ms for optional measurement context.

The server sends the exact mapped Merchant item ID, public product title, USD value, a random transaction ID, and the consented client/session identifiers. It does not send buyer email, raw Square order/payment/customer IDs, card data, download links, or payment secrets. Withdrawing consent stops new browser collection and new checkout context; it cannot recall already attached checkout context or previously sent events. The public privacy text explains this limitation.

## Reporting acceptance after setup

Do not create a production purchase solely to seed reporting. Use the first naturally occurring eligible, consented, non-test sale. Confirm one private ledger attempt and the corresponding GA4 purchase after processing, then check Merchant Center's performance dashboard over an explicit date range. Excluded test orders must have no purchase attempt. Keep exact identifiers and evidence in the private vault.

If the ledger reports `SENT_UNVERIFIED` but reports remain empty, inspect property/stream binding, consent, session timing, source linking, date ranges, and processing status read-only. Do not replay an event to force a dashboard result. Record reporting as pending until observed. Compare tracked eligible purchases with Square's broader sales total without expecting equality.

## References

- [Google Analytics Measurement Protocol reference](https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference?client_type=gtag)
- [Measurement Protocol use cases and session attribution](https://developers.google.com/analytics/devguides/collection/protocol/ga4/use-cases)
- [Google consent implementation](https://developers.google.com/tag-platform/security/guides/consent)
- [Square card capture timeline](https://developer.squareup.com/reference/square/objects/CardPaymentTimeline)

Sources were checked on October 18, 2026. Recheck transaction-critical controls on the execution date.
