# OIP Commerce Pages and Queue Service

This isolated Cloudflare project implements the server-side portion of Outside In Print's approved Square direct-commerce design. The public edge is a Pages Functions project; durable webhook work runs in a separate Queue consumer Worker because Pages can produce Queue messages but cannot consume them. The Pages entrypoint is `functions/[[path]].js`, the consumer entrypoint is `consumer/index.js`, and shared logic remains in `src/`. It is inert until separately provisioned, configured, and deployed. EPUB, paperback, reader-support, and custom-monthly gates default closed.

## Implemented interfaces

| Method and path | Purpose |
|---|---|
| `POST /api/books/epub` | Validate an enabled known SKU plus declared U.S. country, verify Cloudflare's production country signal and the exact Square catalog variation/price, then create a Square-hosted EPUB checkout. |
| `POST /api/books/physical` | Validate a U.S.-only cart of one through six enabled paperback copies, bind the destination to authoritative jurisdiction evidence, verify exact Square catalog and inventory state, reserve inventory locally, and create a Square-hosted shipping checkout. |
| `POST /api/support/one-time` | When the overall support gate is open, validate `{ "amount_cents": 500..50000 }` in whole-dollar increments and create a Square-hosted one-time checkout. |
| `POST /api/support/monthly` | When the overall support gate is open, create a hosted monthly subscription checkout. The public v1 storefront offers only fixed `$5` monthly support; other amounts remain blocked until `CUSTOM_MONTHLY_ENABLED=true`. |
| `POST /api/square/webhook` | Verify Square's HMAC, store only safe identifiers and a payload hash, enqueue the event, and return without calling Square or Resend. |
| `GET /download/{token}` | Stream a private EPUB from R2 while enforcing revocation, 14-day expiry, and five-download limit. |
| `POST /admin/resend` | Reissue active order downloads after cryptographic Cloudflare Access validation. |
| `GET /health` | Return an unprivileged service and gate status. |

The EPUB request body is exactly `{ "sku": "OIP-..-EPUB", "country_code": "US", "email": "reader@example.com" }`. The email is normalized, used to prepopulate Square's hosted checkout, and never stored raw in D1. The physical request body is exactly this shape:

```json
{
  "items": [
    { "sku": "OIP-AN-PB", "quantity": 1 }
  ],
  "destination": {
    "country": "US",
    "address_line_1": "...",
    "address_line_2": "...",
    "locality": "...",
    "administrative_district_level_1": "FL",
    "postal_code": "..."
  }
}
```

The physical cart may contain one to three distinct known paperback SKUs and one through six copies in total. Duplicate SKUs, EPUB SKUs, client-supplied prices, discounts, tax amounts, tax rates, counties, shipping amounts, totals, and extra fields are rejected. Shipping is available only to the 50 states and D.C.; international, territory, APO/FPO/DPO, P.O. box, general-delivery, rural-route, and other unsupported special-address cases fail closed. Mandatory USPS Media Mail is `$4.99` for one book, `$5.99` for two or three books, and `$7.49` for four through six books. Mixed physical/digital checkout is not an interface this route can express.

The declared country is not treated as proof for either book route: production requests also require Cloudflare's trusted `request.cf.country` geolocation value to equal `US` before a checkout link is created. Each EPUB Order carries a compact server-authenticated U.S. reference bound to its issue time and SKU. If a completed Payment exposes a country, it must still equal `US`; if Square omits country, fulfillment requires that signed reference. Arbitrary Square orders cannot supply it. Local Hugo testing can bypass only the edge-country check with the explicit `ALLOW_LOCAL_ORIGINS=true` development setting. The public support request body remains exactly `{ "amount_cents": integer }`. A successful checkout response contains both `checkout_url` and the compatibility alias `url`. Browser requests are accepted only from `ALLOWED_ORIGINS`.

Both reader-support endpoints are also controlled by `SUPPORT_CHECKOUT_ENABLED`, which defaults closed. Keep it `false` while infrastructure is provisioned and whenever public support has not passed its separate activation gates. The fixed `$5` monthly route does not bypass this overall gate.

Clients must send a unique `Idempotency-Key` for each user checkout intent and reuse it only when retrying the same EPUB SKU, exact physical cart and destination, or support amount and cadence. The physical browser keeps one key in memory for the exact serialized form intent and changes it only when the payload changes or the server confirms that the old intent expired/cannot be reused. A missing or malformed key is rejected. Square receives a hashed, namespaced idempotency key; D1 claim fencing prevents concurrent link creation and caches only a matching, unexpired `LINK_CREATED` physical link.

## Security and privacy boundaries

- Square hosts card entry. The service never receives or stores card data.
- Webhook signatures use `SQUARE_WEBHOOK_NOTIFICATION_URL + raw_request_body` exactly. Changing scheme, hostname, path, slash, or bytes breaks verification by design.
- Authentic webhook ingress performs only bounded body parsing, HMAC verification, one D1 record, and one Queue send before returning `2xx`. Square and Resend calls never run in the webhook response path.
- The Queue consumer uses `max_batch_size=1` and `max_concurrency=1`. A 120-second processing lease handles crash recovery; every claim has a fencing token, so a displaced handler cannot mark a reclaimer's work failed or complete. D1 uniqueness, conservative revocation, monotonic subscription versions, deterministic download tokens, and Resend idempotency make replayed side effects safe.
- D1 stores event hashes and opaque Square IDs, not webhook payloads, addresses, or raw buyer emails.
- A physical destination is normalized transiently, sent to Square for hosted checkout, and reduced in D1 to a keyed HMAC plus state/county jurisdiction facts. No customer street address is stored in D1, logs, or tracked configuration. `ADDRESS_LOOKUP_HMAC_SECRET` is required in both Pages and the Queue consumer so checkout-time and post-payment address bindings are comparable without retaining the address.
- Buyer email is sent transiently to Square as `pre_populated_data.buyer_email`, then read from the completed Payment or one unambiguous final Order fulfillment recipient. It is stored only as a peppered SHA-256 value.
- Download tokens are deterministic 256-bit HMAC outputs keyed by `DOWNLOAD_TOKEN_SECRET` and scoped to fulfillment id plus generation. This lets an uncertain email retry reproduce the same URL and Resend idempotency key without storing the bearer token. Only SHA-256 token values are stored.
- EPUBs remain in a private R2 bucket and are streamed with private/no-store headers.
- Do not enable raw-URI request logging or Logpush for `/download/*`; the bearer token appears in that path even though D1 stores only its hash.
- Public support, EPUB, and physical link creation is origin restricted and rate-limited using a salted IP hash. Raw IP addresses are not retained. Physical checkout uses the separate, conservative `PHYSICAL_RATE_LIMIT_MAX=3` and `PHYSICAL_RATE_LIMIT_WINDOW_SECONDS=1800` defaults; support and EPUB routes retain the generic rate-limit defaults.
- Secrets belong in Cloudflare secret bindings. Never put them in `wrangler.toml`, `.dev.vars` committed to Git, source, logs, or command arguments.
- `/admin/*` must be covered by a Cloudflare Access application. The Function also verifies the assertion's RS256 signature against the configured Access issuer's keys, plus issuer, audience, expiry, and email allowlist. It intentionally does not treat a bare email header as authentication.
- Admin resend keeps the currently valid token active while sending the same derived URL. A D1 resend-attempt sequence supplies a stable, new Resend idempotency key. Expiry and download allowance reset only after Resend confirms acceptance; uncertain attempts reuse the same sequence.

## Free-plan operational monitoring

Task 2 keeps monitoring inside the existing Pages, Worker, Queue, D1, and Resend stack. It adds no paid monitoring product, new service, new account, API token, Resend webhook, or HTTP ingress on the consumer Worker. `migrations/0003_operational_monitoring.sql` adds four sanitized operational tables: one fenced heartbeat row, short-lived Queue canary receipts, hashed DLQ receipts, and a code/count-only alert ledger.

The consumer retains the exact `*/5 * * * *` trigger. When `OPERATIONS_MONITORING_ENABLED=true`, each scheduled run:

1. fences a D1 heartbeat;
2. marks an unreceived primary-Queue canary stale after 600 seconds;
3. detects active fulfillments whose initial Resend delivery is `FAILED`, whose initial delivery remains `PENDING` for 900 seconds, whose admin resend is `FAILED`, or whose admin-resend claim remains stale `PENDING`;
4. runs the existing conservative physical-link expiry maintenance;
5. records and sends a new opaque canary through `OPERATIONAL_CANARY_QUEUE` to the same primary Queue consumed for commerce events; and
6. delivers pending sanitized operational alerts through the environment's existing `RESEND_API_KEY`.

The scheduled consumer does not fetch Pages or any other health URL. Pages `/health` must be verified from the public Internet before and after each approved deployment, so the evidence exercises the public route rather than a Worker-to-Worker subrequest. Ongoing Pages visibility comes from Cloudflare's Pages deployment-failure notifications and persisted logs. The five-minute cron monitors D1, Queue delivery, fulfillment state, physical-link maintenance, and the alert ledger only.

The consumer has two Queue consumer entries: the primary Queue and its matching DLQ. It dispatches them by Cloudflare's `batch.queue` value. A primary canary is recognized before commerce validation and produces a D1 receipt. The DLQ path reads only the Cloudflare Queue message ID, stores its SHA-256 hash, creates the aggregate code `DLQ_MESSAGE_RECEIVED`, and acknowledges the message after D1 persistence. It never reads or processes the DLQ body as a commerce event. A D1 failure leaves the DLQ message retryable.

Operational email contains only environment, allowlisted condition code, timestamps, and an aggregate observation count. It contains no recipient copy, buyer email/hash, order/payment/fulfillment ID, Queue payload, download token, address, or secret. `OPERATIONAL_ALERT_EMAIL` is a consumer-only owner-direct protected binding. Never place its value in a resource map, generated Wrangler file, Git, logs, screenshots, evidence, or a command line. Production uses the minimum owner monitoring recipient. Sandbox must use only a Resend official test recipient. The sender and reply-to reuse `DOWNLOAD_EMAIL_FROM` and `DOWNLOAD_EMAIL_REPLY_TO`.

Alert deduplication uses one D1 row and one stable Resend idempotency key per condition per 21,600-second window. If Resend is unreachable, rate-limited, or rejects the operational email, the alert remains `PENDING`, the same idempotency key is retried by the five-minute cron, the heartbeat becomes degraded, and the scheduled invocation fails with a sanitized error code. This does **not** create an independent alert channel: a broken Resend service or key can prevent both fulfillment email and the email reporting that failure. The independent Free-plan visibility is the public `/health` operational status, Cloudflare's Pages deployment-failure email, failed Worker invocation/Queue metrics, and persisted Workers Logs. The consumer Wrangler explicitly enables persisted logs with `[observability]`, `enabled = true`, and `head_sampling_rate = 1`; application-thrown errors remain fixed sanitized codes and never include buyer, order, email, payload, or secret data. Those provider views must be verified in the approved deployment packet; the application never claims that Resend can prove its own delivery.

Consumer nonsecret bindings are exact and environment-specific:

- `OPERATIONS_MONITORING_ENABLED` — `false` for bootstrap; change only this value to `true` after the Pages health URL/custom domain, D1 migration, Queue bindings, shared consumer secrets, and owner-direct alert target are ready.
- `OPERATIONAL_ENVIRONMENT` — `SANDBOX` or `PRODUCTION`.
- `OPERATIONAL_HEALTHCHECK_URL` — the environment's exact HTTPS `/health` URL used by the approval packet and external public probe. The consumer validates this configuration but does not fetch it.
- `OPERATIONAL_PRIMARY_QUEUE` and `OPERATIONAL_DLQ_QUEUE` — exact same-environment Queue names.
- `OPERATIONAL_CANARY_STALE_SECONDS=600`.
- `OPERATIONAL_FULFILLMENT_STALE_SECONDS=900`.
- `OPERATIONAL_ALERT_REPEAT_SECONDS=21600`.

The consumer also binds `OPERATIONAL_CANARY_QUEUE` as a producer to that same primary Queue. Leave monitoring disabled during the clean bootstrap. The provisioning generator's explicit state transition and final validation exist to prevent a premature or silent enable. Turning monitoring on does not open commerce: all checkout gates remain closed, and the Task 2 provider binding and value for `SQUARE_WEBHOOK_SIGNATURE_KEY` remain absent.

## EPUB fulfillment gate

All three SKU definitions exist in `src/catalog.js` but are unavailable by default:

- `OIP-AN-EPUB` — 999 cents — R2 key `epubs/oip-an.epub`
- `OIP-PS-EPUB` — 999 cents — R2 key `epubs/oip-ps.epub`
- `OIP-WC-EPUB` — 999 cents — R2 key `epubs/oip-wc.epub`

Open a title only after its ISBN, proof, metadata, inventory/file, and KDP Select checks pass by adding its SKU to `EPUB_ENABLED_SKUS`. The service then independently retrieves the completed payment, order, and catalog variation and requires:

- `COMPLETED` USD payment tied to the same order;
- payment and order both tied to the configured `SQUARE_LOCATION_ID`;
- no full or partial refund;
- explicit U.S. country proof when `REQUIRE_EPUB_US_COUNTRY_PROOF=true`;
- a valid buyer email;
- only known, enabled EPUB catalog variations;
- quantity one, exact configured price, zero discount, and zero tax; and
- payment, order, and expected line totals that reconcile.

Opening an EPUB checkout also requires a SKU-to-variation binding in `SQUARE_EPUB_CATALOG_VARIATION_IDS`, encoded as a JSON object. Before Square creates a hosted link, the service retrieves that exact `ITEM_VARIATION` and requires the same object ID, SKU, fixed USD price, online location availability, and sellable state. The checkout request contains only quantity one plus that catalog variation ID—no ad hoc price, tax, shipping, service charge, or discount. Tipping, coupons, loyalty redemption, Cash App Pay, and Afterpay/Clearpay are disabled. Post-payment processing repeats the exact configured-variation, price, location, U.S.-country, zero-tax, zero-discount, and reconciliation checks before delivery.

## Physical paperback checkout gate

All three paperback SKU definitions exist in `src/catalog.js`, but each remains unavailable unless it is explicitly present in `PAPERBACK_ENABLED_SKUS` and has an exact `SQUARE_PAPERBACK_CATALOG` entry:

- `OIP-AN-PB` — *The American Nightmare: Keep Dreaming, Kid*
- `OIP-PS-PB` — *The Parable of the Sheep*
- `OIP-WC-PB` — *The Water Cycle: Risk, Infrastructure, and Public Memory*

Each map entry supplies only the exact Square `variation_id` and approved `price_cents`; the browser cannot choose either value. Before reserving stock, the service retrieves every catalog variation and requires the bound object ID, SKU, catalog version, fixed USD price, location availability, sellable state, inventory tracking, no sold-out location override, and one unambiguous integer `IN_STOCK` count at `SQUARE_LOCATION_ID`. The cart then receives a conditional D1 reservation against that observed Square count. All `ACTIVE`, `ORPHANED_REVIEW`, and `PAID_PENDING` reservations count against availability, including an overdue reservation not yet handled by the scheduled cleanup, so delayed cron execution cannot create a second oversold link. A repeated request with the same idempotency key can reuse only its exact existing SKU/catalog/quantity tuple. Reservation ownership is fenced by the current 180-second checkout claim token. The service renews and checks that claim around every Square provider call and immediately after Payment Link creation; a displaced handler cannot release or overwrite a reclaimer's reservation, expose the returned link, or delete the shared idempotent Square link.

The 30-minute local reservation is not a claim that Square itself reserves stock: Square Payment Links do not provide that guarantee. The consumer's five-minute cron inspects expired unpaid physical links. It deletes a Square link only while its order remains `DRAFT`, waits until Square confirms the resulting `CANCELED` state, then releases the matching reservation and marks the binding `EXPIRED`. A still-`DRAFT`, `OPEN`, or otherwise ambiguous order is deferred so a completed-payment/webhook race wins. One failed row creates a deterministic open `PHYSICAL_LINK_EXPIRY_ERROR` review and does not starve later cleanup rows; if that review cannot be persisted, the scheduled run fails for external alerting after checking the remaining rows. A stale reservation with no durable link binding is moved to `ORPHANED_REVIEW` and remains counted until an operator proves any Square link is unusable; it is never released on an unsafe guess. The cron never deletes a link after a completed payment. A new customer intent needs a new idempotency key after expiry.

### Florida jurisdiction and tax evidence

Florida checkout requires two independently versioned evidence sets created and bound by `migrations/0002_physical_checkout.sql`:

- D1 stores the active PointMatch-derived statewide manifest selected by `POINTMATCH_DATASET_VERSION` and `POINTMATCH_SCHEMA_VERSION`. The private R2 object `${POINTMATCH_SHARD_PREFIX}/${POINTMATCH_DATASET_VERSION}/index.json` is canonical, immutable, and pinned independently by `POINTMATCH_INDEX_ROOT_SHA256`; its sorted entries bind every ZIP5 shard's exact object key, row count, and SHA-256 hash.
- The private `JURISDICTION_BUCKET` stores the address records as per-ZIP5 JSON shards at `${POINTMATCH_SHARD_PREFIX}/${POINTMATCH_DATASET_VERSION}/zip5/<ZIP5>.json`. A shard contains only address HMAC-to-jurisdiction records, not raw street addresses. The statewide address population is never loaded into D1.
- D1 stores the active 67-county Florida rate manifest and county rows selected by `FL_SALES_TAX_RATE_VERSION`, with the 6% state rate and exact county surtax. The resolver validates and canonical-hashes all 67 ordered rows and requires the digest to match both the D1 manifest and `FL_SALES_TAX_RATE_ROOT_SHA256` before selecting a county.

At lookup, the service derives ZIP5, hashes and strictly validates the complete private index against both digest pins, requires exactly one indexed member, then reads only that shard and verifies its bounded size, hash, dataset version, schema version, ZIP5, and record count before matching. The normalized address lookup uses only `ADDRESS_LOOKUP_HMAC_SECRET`-keyed hashes. Unit-specific addresses must resolve at the unit level unless the imported record explicitly says the unit cannot affect jurisdiction. Checkout fails closed for a missing `JURISDICTION_BUCKET` binding, malformed shard prefix, missing provider manifest/index/shard, hash/schema/version/count mismatch, stale or out-of-period manifest, zero or multiple matches, nonexact match, pending effective date, special case, invalid county FIPS, missing county rate, incomplete 67-row rate set, or inconsistent rate arithmetic.

The implementation includes the schema, private-shard reader, resolver, and a deterministic private importer/validator under `tools/`. It **does not include any actual PointMatch records, address HMACs, jurisdiction shards, Florida rate dataset, source digest, or production mapping**. The importer requires an explicit operator-reviewed mapping because the application does not assume an official source header or unit-semantic field. See `tools/README.md`. Provisioning must privately bind an authoritative current release, run and validate the importer, upload and re-read every private object, load the manifests/rates, and preserve evidence before any Florida paperback SKU is opened.

Florida books and mandatory shipping receive the same explicit destination rate. Non-Florida U.S. shipments receive no Florida tax only after a live, transaction-specific USPS Addresses API v3 city/state lookup confirms that the submitted ZIP5 belongs to the submitted state. `US_ZIP_STATE_PROVIDER` is empty by default; non-Florida checkout fails closed until licensed USPS access, an allowlisted packet-bound base URL/version, OAuth client credentials, and sandbox evidence are separately approved and provisioned. USPS ZIP responses are never cached, persisted, mined, or used to build a ZIP table. This check does not assert that OIP lacks obligations in another state, which remains a separate nexus/registration decision.

### Square order and shipping model

Paperback lines use their exact `catalog_object_id` and `catalog_version`; there is no browser price and no base-price override. Mandatory USPS Media Mail is one fixed Square order `service_charge` named `USPS Media Mail` with:

- `calculation_phase: SUBTOTAL_PHASE`;
- `treatment_type: LINE_ITEM_TREATMENT`;
- `scope: ORDER`; and
- `taxable: true` plus the explicit Florida tax reference for Florida orders, or `taxable: false` outside Florida.

Florida tax is one explicit `ADDITIVE`, `LINE_ITEM` tax applied to every paperback line and the mandatory shipping service charge. `pricing_options.auto_apply_taxes` and `auto_apply_discounts` are both false. The service first submits the proposed order to Square's CalculateOrder endpoint and treats Square's returned line, shipping, aggregate tax allocations, and total as authoritative. It refuses to create a Payment Link unless those allocations, exact catalog versions, service-charge properties, and arithmetic reconcile; it then requires the returned Payment Link to echo the exact no-tip/no-coupon/no-loyalty/card-wallet checkout options, including `merchant_support_email: support@outsideinprint.org`, and requires the created `DRAFT` order to contain exactly one `SHIPMENT` fulfillment and the same values. This line-by-line authority matters where tax rounding differs from a tax computed once on an aggregate subtotal.

For bookkeeping, the service charge is mandatory shipping revenue mapped to `4070 Shipping Revenue`; it is not paperback revenue and it is not a checkout `shipping_fee`. Collected Florida tax remains a liability, not revenue. The downstream private Square export and DR-15 bridge must preserve the separate book, shipping, tax, fee, refund, and payout values.

### Post-payment review, not fulfillment

A completed physical payment enters the Queue workflow, but this slice never buys postage, creates a label, marks an order shipped, emails a shipment notice, or decrements a separate bookkeeping inventory ledger. It produces only `PAID_REVIEW_READY` after all checks pass; an operator must perform the separately controlled fulfillment workflow.

Before reaching that state, the consumer retrieves the completed Square Payment and Order and repeats the exact order, location, currency, catalog object/version, quantity, price, tax allocation, mandatory shipping, discount, refund, and card/wallet tender checks. It requires exactly one Square `SHIPMENT` fulfillment, hashes the final Square recipient address, compares it to the checkout-time HMAC, and reruns the current bound jurisdiction resolver. State, county, rate/evidence versions, and resolution method must remain identical. It queries Square `ADJUSTMENT` inventory changes and requires an exact `IN_STOCK`→`SOLD` quantity/location match for every variation before changing the reservation from `PAID_PENDING` to `SOLD_VERIFIED`. Because Square's public docs do not define whether `InventoryAdjustment.transaction_id` equals the Order ID or Payment ID, `SQUARE_INVENTORY_TRANSACTION_ID_KIND` is empty by default and the order remains retryable/non-shippable until sandbox evidence binds it to exactly `ORDER_ID` or `PAYMENT_ID`.

Missing shipment-recipient propagation and missing/unbound exact inventory-adjustment evidence are retryable Queue conditions and remain `PAYMENT_PROCESSING`. Address, jurisdiction, totals, catalog, tax, inventory, refund, or reservation-integrity failures move the payment to `HELD` with an opaque manual-review reason. Refund/dispute events that arrive first retrieve and bind the payment/order, promote the exact reservation to `PAID_PENDING`, and hold it as `REFUNDED`/`DISPUTED`; the later payment webhook cannot revive it. No hold auto-ships. A human must reconcile Square, inventory, tax, and the final address through private evidence before any separately approved release or refund.

Square payments that are neither bound to a physical checkout nor eligible EPUB payments are ignored. Eligibility failures that need human attention create opaque `fulfillment_reviews` rows. Any completed refund revokes all downloads tied to an EPUB payment because Square's PaymentRefund does not reliably allocate the refund to an order line. A partially refunded EPUB payment cannot create a token later if its refund event arrived first. Partial revocation creates an explicit manual-review row.

Any refund or dispute creates a durable payment block as well as revoking existing downloads. This prevents a later, out-of-order payment event from creating access. A favorable dispute resolution requires a separately approved block-clearance and admin-resend workflow; it does not reactivate access automatically.

Support checkout explicitly disables tipping, coupons, loyalty redemption, Cash App Pay, and Afterpay/Clearpay. Card entry and supported card-backed Apple Pay/Google Pay remain available. One-time and monthly orders carry separate OIP reference ids for bookkeeping classification.

## Provisioning checklist — not executed by this repository change

Task 2 records two distinct environment-specific logical SQUARE_WEBHOOK_SIGNATURE_KEY targets:

- Sandbox: Pages project `oip-commerce-sandbox`, commerce environment `SANDBOX`, and binding name `SQUARE_WEBHOOK_SIGNATURE_KEY`, with deterministic identity `oip-commerce-sandbox:SANDBOX:SQUARE_WEBHOOK_SIGNATURE_KEY`.
- Production: Pages project `oip-commerce`, commerce environment `PRODUCTION`, and binding name `SQUARE_WEBHOOK_SIGNATURE_KEY`, with deterministic identity `oip-commerce:PRODUCTION:SQUARE_WEBHOOK_SIGNATURE_KEY`.

Task 2 leaves both Cloudflare provider bindings and signature-key values absent. Task 3 creates exactly one Sandbox and one Production webhook subscription under its own separately approved action. The owner creates each matching provider binding by entering its signature key after its subscription exists. Both tasks require their own content-frozen packet, exact approval, and single attempt.

### Task 2 — infrastructure deployment only

#### Locked noninteractive Wrangler procedure

Run every command from this `workers/oip-commerce` directory with the packet-pinned Wrangler release. Do not use a global or floating Wrangler, do not use `--keep-vars`, and do not let Wrangler rewrite either generated TOML file. Wrangler 4.126.0 does not support `--update-config` for TOML. A D1 identifier must enter the controller only as bounded JSON on stdin through `bind-d1`; it must never be a command-line argument or copied into tracked configuration.

1. Run `task2_provisioning_configs.py generate` with the exact R3 resource-map root and private-root configuration. Validate `--phase precreate`. Create the Pages projects explicitly with the production branch locked to `main`:

   ```text
   wrangler pages project create oip-commerce-sandbox --production-branch main
   wrangler pages project create oip-commerce --production-branch main
   ```

2. Create each D1 database without `--update-config` and capture Wrangler's human-readable output privately. Wrangler 4.126.0 has no JSON-output flag for `d1 create`. The private controller must extract and validate exactly one UUID in memory, transform it into exactly this schema with no extra keys, and pipe it directly to the matching command without printing the identifier or placing it on a command line:

   ```json
   {"schema_version":"1.0","environment":"SANDBOX","database_name":"oip-commerce-sandbox","database_id":"<PRIVATE_D1_ID>"}
   ```

   ```text
   <PRIVATE_JSON_PRODUCER> | python tools/task2_provisioning_configs.py <LOCKED_GLOBAL_ARGUMENTS> bind-d1 --environment SANDBOX
   <PRIVATE_JSON_PRODUCER> | python tools/task2_provisioning_configs.py <LOCKED_GLOBAL_ARGUMENTS> bind-d1 --environment PRODUCTION
   ```

   `bind-d1` rejects oversized or malformed input, duplicate or extra keys, protected fields, a mismatched environment/name, invalid or reused identifiers, and partial writes. It atomically places the same identifier in the private Pages and consumer configs without printing it. Run `validate --phase predeploy`, then `activate --environment <ENVIRONMENT>` so both active configs are installed together.

3. With the matching environment activated, set `CI=true` and apply all three D1 migrations with `--remote` and the active `wrangler.toml`. Do not pass a database identifier. The database-name arguments are `oip-commerce-sandbox` and `oip-commerce`, respectively:

   ```text
   CI=true wrangler d1 migrations apply oip-commerce-sandbox --remote --config wrangler.toml
   CI=true wrangler d1 migrations apply oip-commerce --remote --config wrangler.toml
   ```

   Verify the remote schema with `tools/task2-schema-proof.sql` before deployment.

4. A bootstrap consumer deployment must run from this commerce root and pass the positional entrypoint `consumer/index.js` with the private bootstrap config; otherwise that private config path can resolve `main` against the wrong directory. After D1, Queue, R2, cron, and observability bindings are ready, activate the environment and deploy again with the active full config:

   ```text
   wrangler deploy consumer/index.js --config <PRIVATE_BOOTSTRAP_CONFIG> --strict
   wrangler deploy consumer/index.js --config wrangler.consumer.toml --strict
   ```

   The full config—not ad hoc flags—installs both Queue consumers, the canary producer, the five-minute cron, and Workers Logs.

5. Build `public`, activate the matching Pages config, and deploy Pages with the exact frozen source commit and clean-tree assertion. `wrangler pages deploy` does not accept `--config`; the activated `wrangler.toml` is auto-loaded from the exact `--cwd` commerce root:

   ```text
   wrangler pages deploy public --project-name oip-commerce-sandbox --branch main --commit-hash <EXACT_FROZEN_COMMIT> --commit-dirty=false --cwd <COMMERCE_ROOT>
   wrangler pages deploy public --project-name oip-commerce --branch main --commit-hash <EXACT_FROZEN_COMMIT> --commit-dirty=false --cwd <COMMERCE_ROOT>
   ```

   Enter all Task 2 Pages secrets and bindings before the final deployment that uses them; any binding change requires another exact deployment. The accepted Production deployment is the final exact deployment after all Task 2 Pages bindings exist.

6. Associate the Production Pages custom domain before adding the external-DNS CNAME. Keep `OPERATIONS_MONITORING_ENABLED=false` through bootstrap. After external public health, D1, Queue, shared consumer secrets, and the owner-entered alert target pass, run `set-monitoring --state enabled`, reactivate that environment, and redeploy the consumer with the full config. Leave every commerce gate closed and leave `SQUARE_WEBHOOK_SIGNATURE_KEY` entirely absent; Task 3 owns that binding.

1. Confirm the separately approved Square account, `OIP Online` location, catalog variations with exact SKUs, existing `$5/month` subscription-plan variation, and tax configuration. Do not create or mutate Square catalog or subscription objects during Task 2. Paperback variations must already have fixed USD prices, be present and sellable at the online location, track inventory, and have an evidenced accepted-copy count before later activation.
2. Provision the packet-bound, fully separate Sandbox and Production Cloudflare Pages projects, Queues, dead-letter Queues, D1 databases, private R2 buckets, and consumer Workers. Pages Functions remain the Queue producer and a separate Worker remains the Queue consumer. Never reuse a generated resource identifier across environments. Use a current stable Wrangler release supporting Pages D1/R2/Queue producer bindings and Worker Queue consumers. Pin that version; do not assume a global or floating CLI.
3. Copy `wrangler.toml.example` and `wrangler.consumer.toml.example` to separate untracked Sandbox and Production provisioning configurations and replace resource IDs with the exact packet-bound values. Within one environment, Pages and the consumer must bind the same D1 database, private EPUB R2 bucket, and private jurisdiction R2 bucket under the exact bindings `DB`, `EPUB_BUCKET`, and `JURISDICTION_BUCKET`. On provisioning day, reverify and set the same exact Square API version supported by all used endpoints; never deploy `SET_DURING_PROVISIONING`. Sandbox must explicitly set `SQUARE_API_BASE_URL=https://connect.squareupsandbox.com`; it must never inherit the Production default.
4. Create D1 and apply `migrations/0001_initial.sql`, followed by `migrations/0002_physical_checkout.sql`, then `migrations/0003_operational_monitoring.sql`, with the verified Wrangler release. The immutable baseline remains support-only; the second migration expands the request-kind constraint to `EPUB` and `PHYSICAL` and adds versioned Florida evidence tables, address-HMAC bindings, physical review state, and inventory reservations; the third adds only sanitized operational heartbeat, Queue canary, DLQ receipt, and alert-ledger state. Record local and remote migration results as private deployment evidence and verify the exact schema before accepting traffic.
5. Create a private EPUB R2 bucket and upload final EPUBs to the exact, case-sensitive keys below. Do not expose an R2 public URL and do not put EPUB files in Git:
   - `epubs/oip-an.epub`
   - `epubs/oip-ps.epub`
   - `epubs/oip-wc.epub`
   Separately create the private jurisdiction bucket bound as `JURISDICTION_BUCKET`. It must have no public URL. Upload only the canonical immutable index and importer-produced, HMAC-only PointMatch shards at the exact indexed keys; never put the source dump, index/shard objects, or address hashes in Git.
6. Set Task 2 protected values through the Cloudflare dashboard or an approved non-logging direct-entry flow. Values shared by Pages and the consumer must be byte-identical within one environment and different across Sandbox and Production where required:
   - `SQUARE_ACCESS_TOKEN`
   - `SQUARE_LOCATION_ID`
   - `SQUARE_MONTHLY_PLAN_VARIATION_ID` — Production Pages only; Sandbox remains absent until its later Sandbox action
   - `RESEND_API_KEY` — one separately created, domain-restricted, sending-only key per environment
   - `EMAIL_HASH_PEPPER`
   - `DOWNLOAD_TOKEN_SECRET`
   - `RATE_LIMIT_SALT` — one independently generated value per environment, Pages only
   - `ADDRESS_LOOKUP_HMAC_SECRET`
   - `USPS_API_CLIENT_ID` and `USPS_API_CLIENT_SECRET` only after licensed USPS Addresses API access is approved
   Set `ADDRESS_LOOKUP_HMAC_SECRET` independently in both Pages and the consumer; the byte value must be identical, but it must never appear in configuration, logs, commands, screenshots, evidence exports, or Git. Set the nonsecret `SQUARE_EPUB_CATALOG_VARIATION_IDS` JSON mapping in both the Pages and consumer configurations only after the Square variations are created and verified. Set `SQUARE_EPUB_REDIRECT_URL` to the approved OIP return page. Keep the map empty while every EPUB gate is closed.
   For paperback checkout, set `SQUARE_PHYSICAL_REDIRECT_URL`, set `SQUARE_MERCHANT_SUPPORT_EMAIL` to exactly `support@outsideinprint.org`, set the `SQUARE_PAPERBACK_CATALOG` JSON map of exact `variation_id` and `price_cents` values, and set the title gate `PAPERBACK_ENABLED_SKUS` in Pages. Set `POINTMATCH_DATASET_VERSION`, `POINTMATCH_SCHEMA_VERSION`, `POINTMATCH_SHARD_PREFIX`, `POINTMATCH_INDEX_ROOT_SHA256`, `FL_SALES_TAX_RATE_VERSION`, and `FL_SALES_TAX_RATE_ROOT_SHA256` consistently in Pages and the consumer. Keep `US_ZIP_STATE_PROVIDER`, `USPS_ADDRESSES_API_BASE_URL`, `USPS_OAUTH_TOKEN_URL`, and `USPS_ADDRESSES_API_VERSION` empty until the separately approved USPS packet binds the exact licensed endpoint. Keep `SQUARE_INVENTORY_TRANSACTION_ID_KIND` empty until Square sandbox evidence proves `ORDER_ID` or `PAYMENT_ID`. Keep the paperback map `{}`, the merchant-support email blank, the enabled list empty, and all unverified provider/rate values closed until their evidence is accepted.
   Keep the generic `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_SECONDS` controls for support/EPUB. Set the physical-specific controls to `PHYSICAL_RATE_LIMIT_MAX=3` and `PHYSICAL_RATE_LIMIT_WINDOW_SECONDS=1800` in Pages unless reviewed abuse evidence supports another separately approved value.
7. Use the private importer/validator documented in `tools/README.md` for the approved Florida PointMatch-derived source and current 67-county rate source. Keep the exact mapping, inputs, source bindings, HMAC secret, generated bundle, and provenance outside Git. The importer normalizes addresses exactly as the resolver expects, immediately HMACs each streamed row without raw-row spooling, produces deterministic per-ZIP5 JSON shards plus one canonical sorted private-R2 index, produces the canonical 67-row rate table and transaction-control-free D1 SQL, and validates the complete bundle before atomic publication to a new private directory. It rejects symlink, junction, reparse-point, redirected-realpath, and short-name aliases across private inputs and output, then repeats those checks immediately before final rename. It deliberately fails if the operator has not explicitly mapped source headers, categorical meanings, and `PRIMARY` versus `UNIT` jurisdiction semantics. Upload index/shards under the configured prefix/version; load only the statewide manifest, rate manifest, and 67 county rows into D1. Pin the canonical index and canonical 67-row rate digests in both deployments. Re-read every uploaded object, verify its SHA-256 and embedded metadata, verify aggregate counts/effective and stale dates, and preserve source-license/provenance evidence privately. No provider rows, index/shard objects, address HMACs, rate rows, source digest, production mapping, or source dump are supplied by this repository. Do not create or cache a USPS ZIP table; non-Florida verification is a live per-transaction call under the approved USPS terms.
8. Configure Resend's verified sender and a Cloudflare Access application covering `/admin/*` before exposing that route. Keep the Sandbox and Production Resend keys separate; bind each key only to that environment's Pages project and consumer. Enter `OPERATIONAL_ALERT_EMAIL` directly into the consumer only. Sandbox sends only to Resend's official test recipients.
   Set `CF_ACCESS_ISSUER` to the exact `https://<team>.cloudflareaccess.com` issuer, `CF_ACCESS_AUD` to that application's audience tag, and `ADMIN_EMAILS` to the minimum operator allowlist.
9. Set the fixed nonsecret `SQUARE_WEBHOOK_NOTIFICATION_URL` in each Task 2 Pages deployment before Task 3:
   - Sandbox: `SQUARE_WEBHOOK_NOTIFICATION_URL=https://oip-commerce-sandbox.pages.dev/api/square/webhook`
   - Production: `SQUARE_WEBHOOK_NOTIFICATION_URL=https://downloads.outsideinprint.org/api/square/webhook`
   These values configure the deployed service's signature-verification input only. Task 2 creates no Square webhook subscription and leaves both `SQUARE_WEBHOOK_SIGNATURE_KEY` provider bindings and values absent.
10. Associate `downloads.outsideinprint.org` with the Production Cloudflare Pages project.
11. Configure the external-DNS CNAME for `downloads.outsideinprint.org` only after the Cloudflare Pages custom-domain association definitely exists.
12. Deploy the consumer's `*/5 * * * *` scheduled trigger together with both Queue consumer entries and the primary-Queue canary producer binding. Keep `OPERATIONS_MONITORING_ENABLED=false` during bootstrap. After the exact Pages health URL/custom domain and consumer protected bindings are ready, verify Pages `/health` externally and make the packet's one explicit transition to `true`. After deployment, verify Pages `/health` externally again, then verify D1 heartbeat, canary send/receipt, payload-blind DLQ receipt/alert, stale/failed fulfillment email detection, alert cooldown/retry, physical cleanup behavior, Pages deployment-failure notifications, and persisted logs without a test transaction.
13. Keep `SUPPORT_CHECKOUT_ENABLED=false` throughout infrastructure provisioning and until a separate approved activation opens reader support. Keep `CUSTOM_MONTHLY_ENABLED=false` until Square sandbox evidence proves the selected override persists through two simulated renewal cycles. If override proof fails, provision/reuse static Square plan variations for every amount being offered, set `CUSTOM_MONTHLY_STRATEGY=static`, and populate `CUSTOM_MONTHLY_STATIC_PLAN_VARIATIONS` as a cents-to-variation-ID JSON map. The route fails closed for unmapped amounts. Catalog creation is deliberately not performed from public checkout code and remains a separate approval-controlled provisioning action.
14. Keep every EPUB SKU absent from `EPUB_ENABLED_SKUS`, its storefront offer `disabled`, and its public `checkout_endpoint` empty until its title-level ISBN, proof, metadata/file, inventory, and KDP Select launch gates pass. Opening a title requires all three controls to agree: the enabled-SKU gate, the exact Square variation map, and the storefront endpoint.
15. Keep every paperback SKU absent from `PAPERBACK_ENABLED_SKUS`, its storefront offer `disabled`, and its physical checkout endpoint empty until every physical activation blocker below is evidenced. Opening a title requires the enabled-SKU gate, exact Square paperback map, provider/rate evidence, accepted inventory, and storefront endpoint to agree.
16. Complete Task 2 by verifying CORS, host enforcement, Access JWT validation, both exact webhook notification URLs, Queue producer and both consumer bindings, scheduled cleanup and DLQ alerts, all three D1 migrations, EPUB and jurisdiction R2 bindings/object privacy, shard index/object hash parity, email sender authentication, Square catalog versions/prices/SKUs/inventory, physical HMAC consistency across deployments, Florida jurisdiction/rate imports, and all infrastructure acceptance tests in the approved plan. The accepted state has zero Square webhook subscriptions, zero `SQUARE_WEBHOOK_SIGNATURE_KEY` provider bindings, zero signature-key values, and every public checkout and catalog gate closed.

### Task 3 — staged webhook hardening, subscriptions, and signature binding

Task 3 uses one content-frozen approval packet and completes Sandbox before Production. Its execution-day preflight must prove the exact current Pages releases, the clean target commit/tree, both healthy HTTPS endpoints, both absent `SQUARE_WEBHOOK_SIGNATURE_KEY` bindings, all closed public gates, the exact Square applications and event lists, zero existing subscriptions, and Square support for creating a subscription with `enabled=false`. If disabled creation is unavailable or any bound fact drifts, stop and revise the packet before mutation.

For each environment, in order:

1. Create exactly one idempotent, disabled Square subscription for the exact notification URL, explicit API version, and packet-bound event list. Do not create an enabled subscription while the signature key is absent.
2. After that disabled subscription definitely exists, the owner directly transfers its returned signature key into the matching Pages production environment as `SQUARE_WEBHOOK_SIGNATURE_KEY`. Never relay, capture, log, screenshot, hash, or persist the value.
3. Deploy Pages exactly once from the packet-bound clean target commit/tree and production branch so the hardened raw-body reader, timing-safe signature validation, shared event-ID validation, and new encrypted binding become active together. Change no other binding or public gate and perform no consumer, resource, DNS, Access, Resend, catalog, checkout, payment, subscriber, sale, or publication mutation.
4. Verify the exact target release, endpoint health, closed gates, binding presence without value capture, and an invalid-signature `401` with zero D1/Queue side effects. Then update only the same subscription ID to `enabled=true` and run exactly one Square `order.updated` subscription test.
5. Verify one idempotently persisted and Queue-processed test event, the exact enabled subscription URL/events/version, strict environment isolation, and zero commercial effects.

On definite failure, stop without automatic retry. The packet may authorize at most one disable of each definitely known affected subscription, one owner-direct key removal, and one exact same-source cleanup Pages deployment when required to make removal active. Do not delete subscriptions. An uncertain create, deployment, enable, or test result is `UNKNOWN`; keep every public gate closed and do not proceed to Production. If Production fails after Sandbox succeeds, restore Sandbox too so Task 3 remains all-or-nothing.

### Physical activation blockers

Physical checkout remains dormant until every applicable blocker is closed with private evidence:

- The paperback edition has its own assigned ISBN, final metadata, approved print package, accepted physical proof, approved MSRP, and counted sellable inventory. A draft, proof-only copy, rejected copy, or unfinished title is not inventory.
- Packed weights and packaging costs have been tested against the `$4.99`/`$5.99`/`$7.49` bands, the two-business-day shipping workflow is ready, and published shipping/return terms match the implementation.
- The Florida sales-tax registration is active, destination treatment is approved, the exact current PointMatch index/shards and 67-county rate table are digest-pinned and privately evidenced, and fail-closed resolver tests pass. Licensed live USPS verification is separately activated and tested before any non-Florida shipping is enabled. The repository contains no provider data or credentials that can satisfy either gate by itself.
- The exact Square variation exists at `OIP Online` with matching SKU, approved fixed USD price, inventory tracking, location availability, no sold-out override, and an evidenced accepted-copy count. Catalog, Inventory, Orders, Payment Links, Payments, refunds, and disputes used by this service have been tested with least-privilege access.
- D1 migrations `0001`, `0002`, and `0003`, Pages/consumer secrets and matching version variables, Queue, DLQ, scheduled expiry cleanup/monitoring, webhook signatures, host/origin enforcement, physical-specific rate limiting, alerts, and private evidence export are operational.
- Sandbox tests cover Florida and live USPS-verified non-Florida destinations, address units and rejection cases, shipping bands, Square line-level rounding, catalog drift, low/ambiguous inventory, concurrent reservations, cron/payment races, duplicate webhooks, refunds/disputes, final-address and resolver drift, exact Square inventory-adjustment transaction-ID semantics, and the manual-review boundary.
- The storefront endpoint stays empty and the offer stays disabled until a separate release approval. One separately approved low-value live checkout/refund must reconcile before ordinary customer traffic. This implementation does not authorize deployment, publication, inventory release, or shipment.

Only the exact Task 3 packet may authorize the bounded Pages hardening deployments and owner-direct signature-key entry above. Other deployment, DNS, Square/Cloudflare account creation, catalog mutation, and live checkout tests require their own project approvals and remain outside this implementation.

The Pages project uses `public/` only for `_routes.json`; all included routes execute the catch-all Function. After safely filling untracked configurations, intended local inspection uses `wrangler pages dev public`. Event processing must be tested through a local Queue/consumer environment or test suite—there is no synchronous production fallback. Eventual approved deployment must use the frozen commit, active configuration, explicit `consumer/index.js` entrypoint, and exact commands in the locked procedure above. Neither deployment is run by this source change.

## Production ingress controls

- Set `PUBLIC_HOST=downloads.outsideinprint.org`. Application routing returns `404` on `*.pages.dev`, preview-deployment, or other hosts. Do not register Square against a preview URL.
- Place `/admin/*` behind Cloudflare Access and deny it on preview hostnames. The Function independently validates the Access JWT.
- Apply an edge rate-limit rule to `/api/support/*` and `/api/books/epub` in addition to the D1 limit. Start at 30 requests per IP per minute with managed challenge/block, then tune from abuse evidence.
- Give `POST /api/books/physical` a separate Cloudflare WAF/rate-limit rule aligned to its lower application default of three link-creation attempts per IP per 30 minutes. Require the production host and expected method/content type, enforce a small request-body limit, and use managed challenge/block for suspicious automation before it can trigger catalog, inventory, tax, or Payment Link calls. Keep generic support/EPUB thresholds independent. Do not enable request-body logging: a physical request contains a transient street address even though the application stores only its HMAC.
- Apply a stricter edge rule to repeated invalid methods and oversized requests. Allow only `POST` to the webhook path, but do not rely on an IP allowlist for Square; the exact HMAC is authoritative.
- Exclude `/download/*` URI paths from raw request logging because they contain bearer tokens. Never cache `/download/*` responses.
- Protect the Queue consumer from HTTP ingress: it has only Queue and scheduled handlers and no `fetch` handler. Keep `max_batch_size=1`, `max_batch_timeout=1`, `max_concurrency=1`, and ten retries on both primary and DLQ consumers. Keep the primary's matching DLQ and leave the DLQ consumer without a recursive DLQ.
- Use the application canary and DLQ receipt for end-to-end delivery evidence, the sanitized D1 alert ledger for stale/failed Resend state, and Cloudflare Queue metrics/Workers Logs for depth, retries, failed invocations, `webhook_events.status='FAILED'`, open reviews, and events stuck beyond the lease. Do not put commerce identifiers or payloads into operational alerts or logs.

## Retention and maintenance

Each checkout request performs a bounded cleanup pass of at most 100 rows per table:

- rate-limit buckets older than 24 hours are removed;
- failed or incomplete checkout-link requests older than seven days are removed; and
- completed nonphysical checkout-link cache rows older than 30 days are removed.

This operational cleanup explicitly excludes `PHYSICAL` checkout requests and never purges `physical_checkout_bindings` or `physical_inventory_reservations`. An expired link and an `ORPHANED_REVIEW`, `RELEASED`, `PAID_PENDING`, or `SOLD_VERIFIED` reservation remain reconciliation evidence; the five-minute cron changes lifecycle state but is not a record-purge job. The cleanup also never touches payment evidence, webhook evidence, fulfillments, payment blocks, reviews, subscription state, or Florida provider/rate manifests.

Before any physical record is purged, export an encrypted private packet containing the opaque Square link/order/payment/refund/dispute identifiers, SKU/quantity, catalog object and version, price, merchandise/shipping/tax/total allocations, state/county and PointMatch/rate versions, address HMAC, inventory source count and reservation lifecycle, timestamps, status, and hold reason. Do not export the HMAC secret, a raw street address, a raw email, a webhook body, or card data. Reconcile that packet to the exact Square exports, `4040 Direct Physical Book Revenue`, `4070 Shipping Revenue`, merchant fees/payouts, `2200 Sales and Other Taxes Payable`, weighted-average inventory/COGS movements, and every affected DR-15 period. The export needs its own content hash, evidence ID, covered-date range, and proof of successful private-vault recovery before deletion can be considered.

Keep physical commerce evidence, `webhook_events`, `fulfillments`, `payment_blocks`, `fulfillment_reviews`, and `subscription_events` for seven years alongside the private Square exports and accounting evidence required by the approved plan. Expired/revoked token hashes and email hashes remain evidence, not usable credentials or contact records. After the retention period, purge only through a separate approval-controlled, referentially safe migration that preserves the export manifest and proves row counts and reconciliation before and after deletion. Do not run an automatic audit-table deletion job.

At least quarterly, inspect D1 row counts, failed/open/orphan-review rows, oldest operational rows, storage usage, private PointMatch index/shard parity, and both private R2 buckets. Once evidence exceeds seven years, archive and delete it only through a separate approval-controlled, reconciliation-preserving maintenance action. Retain the Square exports and bookkeeping bridge that prove each removed row's period was reconciled.

The EPUB bucket keeps only the currently approved deliverable at each configured key; archive superseded EPUB binaries privately before replacement and never overwrite a live file without title-level approval and download smoke testing. Jurisdiction index/shard objects are versioned evidence and follow a different rule: never overwrite an object under an existing dataset version. Before deleting a retired shard/version, confirm that no retained physical binding references it and all affected tax periods are exported and reconciled. Preserve the D1 manifest, private-index/shard hashes, source metadata, and—when the provider license permits—an encrypted private archive; if the license forbids archival, preserve the permitted provenance and hash evidence instead.

## Local tests

The service has no third-party package dependency. From the website repository root:

```powershell
.\tools\bin\generated\node.cmd --test .\workers\oip-commerce\test\commerce.test.mjs .\workers\oip-commerce\test\monitoring.test.mjs .\workers\oip-commerce\test\florida-tax-importer.test.mjs .\workers\oip-commerce\test\pointmatch-source-preparer.test.mjs
```

Tests cover EPUB required-email normalization, unknown/disabled/non-U.S. rejection, authoritative Cloudflare country proof and spoofed-header rejection, signed-reference fallback when Square omits country, final Order-recipient email fallback, exact catalog binding/price/order validation, zero-tax checkout, route/CORS behavior, D1 and provider idempotency, checkout claim fencing, support amount constraints, bounded retention cleanup, strict host behavior, configured payment methods, fast Queue-based webhook intake, Queue replay/leases/fencing, deterministic token/email/resend idempotency, monthly override/static lookup and the disabled custom gate, exact post-payment location/variation/price/tax/geography/gate eligibility, refund/dispute ordering, monotonic subscription state, atomic download counts, and cryptographic Cloudflare Access validation.

Physical coverage additionally includes paperback-only request shape, U.S. and address restrictions, total quantity one through six, all three shipping bands, dormant SKU gates, client-price/tax injection rejection, exact catalog version/price/location/inventory checks, integer inventory parsing, claim-token-fenced D1 reservation concurrency/idempotency, delayed-cron oversell prevention, orphan-review fencing, private canonical index/shard digest validation, PointMatch unit rules, stale/ambiguous/pending/special failure, canonical 67-row rate validation plus 6%, 7.5%, and 8% fixtures, default-closed live USPS ZIP/state matching, Florida/non-Florida tax treatment, Square CalculateOrder line-level rounding authority, taxable shipping service-charge structure, exact created-link options/DRAFT shipment reconciliation, completed-payment address/resolver rebinding, transaction-specific inventory-adjustment retry/hold behavior, exact reservation tuples, refund/dispute-before-payment ordering, and safe `DRAFT` deletion versus `OPEN` payment races. Passing local tests does not provision USPS/Florida evidence, bind Square inventory semantics, or open a title gate.
