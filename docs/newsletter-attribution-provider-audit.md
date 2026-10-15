# Newsletter attribution provider audit

Verified October 15, 2026. This audit used official documentation, the repository, existing private test receipts, and authenticated read-only Buttondown requests. It made no production changes, subscribed nobody, sent no email, and created no credentials or webhooks.

## Existing path and infrastructure

The existing shared newsletter form posts directly to `https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint` with `embed=1` and the `outside-in-print` tag. The shared partial, homepage form, shortcodes, and signup landing pages must retain that working fallback. Existing analytics count submission attempts, not confirmed subscriptions. Reverting the frontend attribution switch restores the provider form; retain the ledger for diagnosis.

The inspected repository already has separate Bob and commerce services. Neither is a suitable shared newsletter acquisition backend. Use an isolated attribution Worker and D1 database. Existing infrastructure source is not evidence that new Cloudflare resources, secrets, access controls, billing, or deployment permissions are configured.

Existing Almanack links use `almanack-organic` with numbered `utm_content` values and channel-level bio codes. Preserve these meanings and scheduled URLs. The existing GoatCounter adapter uses a fixed 30-minute expiry; the new attribution policy calls for 30 minutes of inactivity. They are different definitions and require explicit changeover documentation. GoatCounter recognizes campaign/source query values, but that alone does not establish subscriber acquisition. [GoatCounter campaign documentation](https://www.goatcounter.com/help/campaigns)

## Read-only baseline

The complete Buttondown subscriber list was captured at `2026-10-15T15:23:11.6654096Z`: one page, nine records, `next=null`. The newsletter identity matches Outside In Print / `OutsideInPrint`. Its timezone is `America/New_York`; test mode is false. API and metadata features are enabled. No existing webhook was configured. The existing `outside-in-print` tag was verified through the complete tag list. The observed firewall auditing mode is `aggressive`; Worker-origin signup acceptance therefore remains a material rollout check.

| Baseline measure | Count |
| --- | ---: |
| All records | 9 |
| Regular | 5 |
| Pending (`unactivated`) | 2 |
| Unsubscribed | 2 |
| Explicitly verified owner records | 1 regular |
| Explicitly documented signup-test records | 1 unsubscribed |
| Regular excluding verified owner/test records | 4 |
| Unsubscribed excluding verified owner/test records | 1 |
| Other records with no explicit owner/test evidence found | 7 |

All nine records have source `embedded_form`; none has a campaign value. Creation dates range from March 12 to October 2, 2026. Historical campaign attribution remains unknown. Four active records is a provisional count after known exclusions, not proof that every remaining record is a genuine reader.

The owner record matches the exact established owner-preview recipient in the Almanack skill and a confirmed private delivery receipt. The separate test record matches the exact address in the October 1 signup test report and before/after receipts, which document signup, confirmation, and unsubscribe. Its current state remains unsubscribed. No classification was based solely on a plus-address.

Pseudonymous IDs, statuses, timestamps, baseline markers, and classification evidence are stored outside the repository in the task's restricted private baseline snapshot. It contains no email addresses, email hashes, IP addresses, or full referrers. The private directory grants access only to the current Windows user, SYSTEM, and Administrators. The existing test address remains in a separate restricted test-selection file because it is needed for a later owner-controlled test; do not copy it into the ledger, logs, Git, or research library.

That existing test subscriber can verify resubscription. A new-acquisition end-to-end check needs an unused owner-controlled address; a baseline record cannot become a new acquisition.

## Buttondown request contract

Authenticate with `Authorization: Token ...` and scope requests using `Buttondown-Context` containing the observed newsletter ID. An authenticated read with the newsletter's current `news_` TypeID succeeded; do not impose the older UUID-only wording from the authentication guide. Pin `X-API-Version: 2026-04-01`, the documented current version, so schema behavior does not silently follow newsletter settings. [Authentication](https://docs.buttondown.com/api-authentication), [API versioning](https://docs.buttondown.com/api-versioning)

Create with explicit `type: "unactivated"`, native `utm_campaign`, `utm_medium`, `utm_source`, and random signup-reference metadata. `regular` bypasses confirmation. Default collisions return an error. Do not use attribution-bearing upserts: `add` merges existing data; omitting its type can immediately reactivate an unsubscribed address. The documented `add` flow with explicit `unactivated` requires another confirmation. Proxy-origin traffic can trigger spam detection. The supported firewall-bypass header has a five-per-hour limit and removes protection; leave it off. Visitor-IP forwarding needs separate review. [Subscriber creation](https://docs.buttondown.com/api-subscribers-create)

`GET /v1/subscribers/{id_or_email}` supports exact email lookup; percent-encode its path and never log that URL. Subscriber-list `email_address` filtering is substring matching, so it cannot replace exact identity validation. [Retrieve subscriber](https://docs.buttondown.com/api-subscribers-retrieve), [list subscribers](https://docs.buttondown.com/api-subscribers-list)

For a verified existing `unsubscribed` record, PATCH with only `type: "unactivated"` sends another confirmation. This transition is not available for arbitrary lifecycle states. Preserve original acquisition metadata and return the same neutral visitor message for existing and new addresses. [Subscriber updates](https://docs.buttondown.com/api-subscribers-update)

Use `X-Idempotency-Key`, a random string of at most 200 characters, for the same logical request and retries. The documentation does not establish an unlimited retention window; do not invent one. [Idempotency](https://docs.buttondown.com/api-idempotency-keys)

The OpenAPI creation-error enum includes `email_already_exists`, `subscriber_already_exists`, and separately `rate_limited`, `subscriber_suppressed`, and `ip_address_spammy`. Parse `code`; never equate all HTTP 400 responses with duplicate subscriptions. Error objects provide `detail` and optional `code`/`metadata`; schema failures use HTTP 422. [OpenAPI schema](https://docs.buttondown.com/openapi.json), [error format](https://docs.buttondown.com/api-error-codes)

The observed GET rate-limit header was 600. The documented creation default is 100/day; this account's effective creation allowance has not been independently established. Daily creation exhaustion can return HTTP 400, while general throttling uses HTTP 429 and `Retry-After`. Preserve response limit/reset headers without logging private response data. [Rate limits](https://docs.buttondown.com/api-rate-limits)

List pagination follows `next` until null, with `results` and `count`. Validate the next-page origin/path, detect loops, and impose a page bound before forwarding authorization. [Pagination](https://docs.buttondown.com/api-pagination)

## Webhook and reconciliation contract

Verify `X-Buttondown-Signature: sha256=<hex>` with HMAC-SHA256 over the original request bytes. Validate newsletter and subscriber identity. `subscriber.confirmed` is distinct from `subscriber.created`; record confirmation once, while later unsubscribe changes current audience state separately. [Webhook reference](https://docs.buttondown.com/api-webhooks-introduction)

The current OpenAPI `WebhookEvent` schema requires `id`, `event_type`, and `data`; `id` is an event TypeID. It defines no timestamp field. The prose example omits `id`, and `data` is event-specific. A real signed payload must therefore be inspected before relying on field placement. A subscriber type transition has `date` and `type`; it is not automatically proof of double-opt-in confirmation. [OpenAPI schema](https://docs.buttondown.com/openapi.json)

Delivery is at least once and unordered. Buttondown retries failures, treats only 2xx as success, and disables a webhook after five consecutively failing events. Persist before acknowledging. Re-fetch current subscriber state when ordering is uncertain. Monitor status and delivery failures; silence is not health. [Delivery behavior](https://docs.buttondown.com/events-and-webhooks-introduction)

`GET /v1/webhooks` exposes enabled/disabled status. `GET /v1/webhooks/{id}/attempts` exposes statuses and attempt/completion information; its error text may contain private values and must not enter public logs. [Webhook list](https://docs.buttondown.com/api-webhooks-list), [delivery attempts](https://docs.buttondown.com/api-webhooks-attempts-list)

For setup, `POST /v1/webhooks` requires `event_types` as a flat string array and `url` as a string. Optional fields are `status` (`enabled` or `disabled`, default enabled), `description`, and `signing_key` (at most 255 characters). Supply a strong random signing key; an empty default does not provide signature verification. The generated request example incorrectly adds arrays around scalar fields and nests `event_types`; use the declared schema types. The retrieval schema includes `signing_key`, so setup verification must inspect it in memory and redact response bodies. Successful webhook-list access alone does not prove creation permission. [Webhook creation](https://docs.buttondown.com/api-webhooks-create), [webhook retrieval](https://docs.buttondown.com/api-webhooks-retrieve), [OpenAPI schema](https://docs.buttondown.com/openapi.json)

The account and newsletter GET responses inspected for the deployment preflight expose no subscriber-creation quota field. The public schema exposes no separate quota-discovery endpoint. The general GET limit is not evidence of an account-specific daily POST allowance; retain the conservative documented daily budget until supported account evidence establishes otherwise.

The events endpoint does not list confirmations among supported filters. If the confirmation time cannot be established, store observation time separately with confirmation time unknown. Never substitute signup time. [Events API](https://docs.buttondown.com/api-events-list)

Use D1 transactional batches for related writes and unique constraints for duplicate safety. Daily reconciliation at `0 10 * * *` runs at 10:00 UTC; weekly report boundaries must independently use America/New_York. [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [Workers cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Remaining rollout evidence

Later deployment preflight found a runtime/documentation mismatch: the deployed Worker rejected `redirect: "error"`; the request helper now uses `manual` and rejects every 3xx response before parsing. Current Cloudflare documentation still lists `error`. Recipient-side inspection of two successful Worker list requests found no visitor-IP headers: the observed source and forwarded chain were Cloudflare addresses, distinct from the direct client. Comparisons were performed in memory; no raw IPs or header maps were retained. Signup POSTs use the same explicit header constructor. [Workers Request](https://developers.cloudflare.com/workers/runtime-apis/request/), [Cloudflare header behavior](https://developers.cloudflare.com/fundamentals/reference/http-headers/), [API request retrieval](https://docs.buttondown.com/api-api-requests-retrieve)

The authorized controlled Worker signup at 16:18:25 UTC returned HTTP 400 with `subscriber_blocked`: the provider identified its firewall as the reason. This is a concrete rollout blocker until supported signup acceptance is established. No bypass or visitor-IP forwarding was added by the audit; the request must not be retried through another signup path.

- The owner approved the isolated Worker/D1 and persistent secrets; the backend is provisioned and its complete nine-record baseline fetch succeeded. Public form activation remains disabled. Any paid change still requires its own approval.
- Verify the real signed webhook shape, current creation allowance, and legitimate Worker-origin signup behavior before switching forms. Do not silently forward visitor IPs or bypass the provider firewall.
- Complete an owner-controlled new-address acquisition/confirmation/unsubscribe test plus test exclusion, and a successful deployed reconciliation.
- Review the revised privacy notice and retention/deletion policy. Automated cleanup remains disabled until approved.
- After backend checks pass, activate forms, perform the single production smoke check, and retain deployment/rollback evidence. Current audit evidence does not establish that rollout is complete.
