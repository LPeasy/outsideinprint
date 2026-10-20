# Optional GA4 purchase reporting

Status: implementation preparation only. Both tracked configuration examples are
OFF with blank Google identifiers and activation cutoff. No account setup,
secret installation, D1 migration, deployment, test purchase, or Google event is
authorized by this source change.

## Scope and provider source

The website records consented `begin_checkout`; this consumer is the only
`purchase` emitter. It reports an eligible direct EPUB purchase only after the
existing signed-webhook path retrieves a Square `COMPLETED` payment and validates
the order, catalog, amount, currency, country, location, and absence of refunds.
Customer download email is attempted before the optional Google request.
Google errors never change fulfillment or webhook retry behavior.

The real purchase timestamp is
`payment.card_details.card_payment_timeline.captured_at`, with
`card_details.status=CAPTURED`. Missing capture time, unsupported/non-card
tenders, or capture outside the attribution bounds are omitted. Never substitute
`created_at`, `updated_at`, webhook receipt time, or a fabricated timestamp.
The thanks page is not proof of payment. Support, paperback, Kindle, Steam,
refund adjustments, and historical backfills are outside this first release.
A later refund does not automatically send a GA4 refund event; Square and the
accounting records remain authoritative for net sales.

Choose the existing intended GA4 web stream and import its purchase source into
Merchant Center once. Before activation, inspect GA4, Google Ads, Merchant Center,
and any tag manager for existing purchase emitters/imports. Do not also enable
a direct Merchant purchase tag, browser purchase event, thank-you URL conversion,
or second primary purchase action for these same transactions.

## Checkout contract

`POST /api/books/epub` optionally accepts:

```json
{
  "measurement": {
    "version": 1,
    "consent": "granted",
    "client_id": "123456789.1234567890",
    "session_id": "1802851140",
    "captured_at": 1802851200
  }
}
```

The values above are synthetic examples. The browser must obtain actual IDs
from the consented Google tag, after `begin_checkout`, without inventing them.
This object conveys browser attribution; it does not prove a sale or override
server policy. The server accepts exact fields and numeric ID shapes, a context
no older than 30 minutes, at most five seconds of clock skew, and a session
no older than 24 hours. Invalid/missing measurement does not prevent checkout.
There is no browser-controlled `is_test`, environment, transaction ID, amount,
order ID, or production flag.

On the first checkout request, the Worker snapshots trusted mode, stream ID,
selected internal SKU and its exact configured Merchant item ID,
stores only consented client/session IDs and time, creates one random opaque
transaction ID, then binds the order ID from Square's verified link response.
Retries cannot replace the original mode/consent/stream/product mapping or add tracking to an old
checkout. No consent, OFF, TEST, preactivation, malformed context, or missing
mapping remains ineligible after a later configuration change.

The actual capture must occur within 30 minutes of the checkout context, no
earlier than the session start, and within 24 hours of that session start.
Dispatch must also occur within 24 hours of the original session start. A delayed
webhook can qualify when its real capture met those limits. The approved GA4
session timeout must be at least the bound 30-minute window; changes require
reviewing this contract. This source does not promise complete attribution or
keyword visibility.

## Default-closed activation settings

| Setting | Pages | Consumer | Preparation value |
| --- | --- | --- | --- |
| `GA4_PURCHASE_MODE` | Required | Required | `off` |
| `GA4_MEASUREMENT_ID` | Exact selected stream | Same exact stream | Empty |
| `GA4_MERCHANT_ITEM_IDS` | Verified SKU-to-item-ID JSON | Same exact mapping | `{}` |
| `GA4_PURCHASE_LIVE_AFTER` | Same approved epoch seconds | Same cutoff | Empty |
| `GA4_API_SECRET` | Never needed | Managed secret only | Absent |

`live` requires `SQUARE_API_BASE_URL=https://connect.squareup.com` and
`DOWNLOAD_BASE_URL=https://downloads.outsideinprint.org`. Pages additionally
requires `PUBLIC_HOST=downloads.outsideinprint.org`; the consumer requires
`OPERATIONAL_ENVIRONMENT=PRODUCTION`. A property change withholds old context.
All unknown/missing modes behave as OFF. The secret is used only in the fixed
Google Measurement Protocol endpoint, with redirects rejected and a three-second
timeout. It must not enter a file, CLI argument, screenshot, error, or log.
Disable outbound URL/request/body logging because Google's protocol places its
secret in the request URL. Never log checkout bodies or attribution identifiers.

An approved release must apply migration `0004_purchase_measurement.sql`, deploy
the consumer and Pages integration with matching approved configuration, verify
the consented Google tag/stream, and bind a future activation cutoff. Consumer
secret installation and provider-account changes have their own approval gates.
The historic Task 2 provisioning generator is deliberately unchanged; its
generated configurations omit these optional settings and therefore remain OFF.
Do not alter old frozen packets or use them to authorize new settings.

`GA4_MERCHANT_ITEM_IDS` is private, nonsecret runtime configuration. Do not put
the live account inventory in source. Its JSON object maps internal EPUB SKUs to
exact Merchant item-ID strings. Preserve case and numeric-looking IDs as strings.
The bounded contract accepts 1–50 unique entries, at most 4096 JSON characters,
SKU keys matching `OIP-[A-Z]+-EPUB`, and item IDs of 1–128 ASCII letters, digits,
dots, underscores or hyphens, starting with a letter or digit. Duplicate item
IDs, invalid entries, absent configuration, and unmapped SKUs suppress measurement.
The checkout SKU must also pass the existing commerce catalog and enabled-SKU
checks; Merchant approval alone does not enable a product for purchase.

The server emits the snapshotted Merchant ID only for one verified item whose
internal SKU matches the snapshot and whose current consumer mapping is unchanged.
A mapping correction cannot rewrite historical checkout bindings or revive
excluded checkouts. It applies to new checkouts; affected old purchases remain
unmeasured. These guards do not block checkout, fulfillment, or delivery email.

## Controlled tests and duplicate prevention

Production controlled purchases MUST start with Pages in trusted `test` mode
before checkout creation. The persisted TEST marker survives later return to
live mode. Sandbox is always excluded by production guards. The browser cannot
assert that a test is live. There is no automatic way to recognize an unmarked
owner purchase; an unmarked production purchase is a real sale to the system.

For an already-created order, an independently approved operator may insert its
exact private Square order ID into `purchase_measurement_exclusions` with reason
`CONTROLLED_TEST` before payment/dispatch. This registry has no public endpoint.
Do not race an active dispatch or assume a late exclusion can retract a sent
event. Verify suppression before the owner pays. Tests of the integration itself
use synthetic fixtures and transport interceptors; neither Google collection nor
Google's debug endpoint is contacted by the test suite.

One SQLite/D1 atomic unique claim per Square order is committed as `ATTEMPTING`
before any network call. The stable random `transaction_id` adds Google-side
deduplication without exposing the Square order/payment ID. The local ledger
also prevents repeats across payment events, queue deliveries, email retries,
concurrent invocations, and property changes.

| Ledger status | Meaning | Automatic resend |
| --- | --- | --- |
| `ATTEMPTING` | Active call, or interrupted uncertain attempt | Never |
| `SENT_UNVERIFIED` | HTTP 2xx only; no ingestion/reporting proof | Never |
| `REJECTED` | Definite non-2xx, including 429/503 | Never |
| `UNKNOWN` | Timeout or other uncertain transport outcome | Never |
| `EXCLUDED` | Controlled-test suppression detected before dispatch | Never |

Treat stale `ATTEMPTING` as UNKNOWN. Inspect read-only and obtain a separately
reviewed correction plan; do not clear the ledger or replay webhooks to resend.
At-most-once transport deliberately favors missing a conversion over duplicates
when a process dies after claiming and before sending.

## Data minimization and verification

Outgoing payloads contain the consented client/session IDs, real capture time,
opaque transaction ID, exact mapped Merchant item ID, public product title,
quantity, USD value, and
`ad_user_data=DENIED`, `ad_personalization=DENIED`. No raw Square order/payment
IDs, email (including hashes), customer/address data, download token, user ID,
arbitrary URL, or `srsltid` is sent by the server. Analytics consent is a local
gate, not an unsupported Measurement Protocol consent field.

Client/session/time fields are scrubbed after any completed dispatch attempt.
The consumer's existing five-minute schedule removes expired identifiers in
batches of 500 after the session's 24-hour attribution window, without sending
events or deleting transaction evidence. A retention failure signals a failed
scheduled invocation after ordinary monitoring completes. Changing the mode to
OFF stops collection and sending while this expiry cleanup continues. Keep the
mode setting present when disabling measurement so the cleanup remains active;
legacy deployments without the setting perform no optional-schema queries.
Apply the migration before deploying even the explicitly configured OFF consumer.
Preserve the
minimal order mapping, test exclusions and dispatch ledger as private duplicate
prevention evidence; never automatically purge them or export them publicly.

Review counts by terminal status without customer identifiers. Verify actual
arrival and correct single purchase in GA4, then Merchant Center performance
after its reporting delay. Compare legitimate real transactions to Square with
the controlled-test exclusions applied. Local tests and HTTP 2xx do not prove
provider reporting. No real purchase is required or authorized by these tests.

The new local suite uses Node 24's built-in SQLite with the actual migrations and
an outbound-network tripwire. It covers production/consent/time/stream gates,
trusted test suppression, exact item mapping and mapping drift, concurrent deduplication, interrupted/unknown/rejected
attempts, real capture time, privacy cleanup, and checkout-to-fulfillment order.
