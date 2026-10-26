# Bob's Almanack welcome bridge

This small Cloudflare Worker starts the native Resend welcome automation after a
signed Buttondown `subscriber.confirmed` webhook. Resend owns the three messages
and day-2/day-4 delays. Buttondown remains the newsletter system. There is no
subscriber import, bulk enrollment, timer, email renderer, or unsubscribe sync.

## Enrollment contract

1. Verify Buttondown's HMAC-SHA256 signature over the original request bytes using
   the dedicated signing key for this newsletter's webhook.
2. Require a subscriber ID and reject a mismatched newsletter when explicitly
   supplied. Buttondown's provider-side webhook preview observed on 2026-10-26
   omits `data.newsletter`; that field is optional. Retrieve the exact subscriber
   ID from Buttondown with the configured `Buttondown-Context` newsletter header;
   never trust an email in the webhook.
   Normalize legacy UUIDs and current TypeIDs to one canonical `sub_` TypeID before
   the owner-test filter, API lookup, and ledger reservation. Normalize the API's
   returned ID before comparing it too. Explicit newsletter IDs likewise compare
   by their canonical `news_` TypeID. TypeIDs require exactly 26 lowercase Crockford
   base32 characters and a first character no greater than `7` (128-bit limit).
3. Require canonical `type: regular`, a valid email, and `creation_date` at or after
   the fixed UTC cutover and no later than the current time. Imported records are
   excluded. Old pending records that confirm later are also excluded. Other
   subscription types are intentionally outside this free newsletter bridge.
4. Insert a permanent D1 reservation keyed by Buttondown subscriber ID, then claim
   it atomically before attempting `POST https://api.resend.com/events/send`.
5. Send event `oip.almanack.confirmed.v1` with string payload fields
   `enrollment_ref` (random UUID) and `sequence_version` (`welcome-v1`).

At most one event request is attempted for each Buttondown subscriber ID, including
concurrent UUID/TypeID deliveries and subsequent sequence-version changes. Existing
TypeID ledger keys remain unchanged. This is not an
exactly-once delivery guarantee: a crash between reservation and POST can leave an
unsent welcome requiring review. Deleting and recreating a Buttondown subscriber
creates a new identity; the bridge does not deduplicate that new ID by email.

The first enabled confirmation binds the configured cutover in D1. Changing it
later fails closed. Keep that database and cutover across deployments. Never
replace the database or clear reservation rows to retry delivery.

## Local verification and CI

Use the repository's pinned Node 24 toolchain:

```powershell
.\tools\bin\generated\node.cmd --test workers/oip-welcome/test/welcome.test.mjs
.\tools\bin\generated\node.cmd --test tests/classify_changes.test.mjs tests/ci_workflow.test.mjs
```

The fixture uses Node's built-in SQLite to exercise real SQL atomic reservations.
It makes no network calls and uses only synthetic identities. No Worker runtime
or deployment has been exercised by these tests. CI runs the welcome suite in the
existing worker job when this directory changes and during full system checks.
The initial CI selector change appropriately triggers the repository's system
validation. Later Worker-only changes do not require a Hugo build on the PR.

## Configuration and deployment handoff

This source package is prepared, not deployed. The existing newsletter-attribution
worktree and Worker are unchanged. A separate deployment is necessary because that
Worker is not present on current main; this bridge does not depend on merging it.

Required setup after the system diff has been reviewed:

1. Create a separate Cloudflare Worker and persistent D1 database; apply
   `migrations/0001_welcome.sql`. Copy `wrangler.example.jsonc` to the ignored
   `wrangler.local.jsonc` and fill the actual D1 binding and newsletter ID.
2. Store `BUTTONDOWN_API_KEY`, `RESEND_API_KEY`, `WEBHOOK_SIGNING_KEY`, and
   `ADMIN_TOKEN` as Worker secrets. Signing/admin tokens must be random and at least
   32 characters. Keep credentials out of files, shell arguments, logs and reports.
   Resend permissions must allow sending events. Existing commerce credentials and
   its deployment are unrelated.
3. Set the immutable `WELCOME_CUTOVER_AT` to an explicit UTC instant and retain
   `WELCOME_ENABLED: false` during preparation. Verify the native Resend event
   schema and published automation use the exact event name above. The automation
   must be ready before real confirmations can reach it.
4. For an owner-only end-to-end test, use a separate staging database and set
   `TEST_SUBSCRIBER_ID` to the owner-controlled test subscriber. That subscriber
   must satisfy the creation-date cutoff. Enable only this test environment and
   send an authentic Buttondown confirmation. Verify one Resend run, its actual
   delivery, then replay that webhook and verify no second run. A direct Resend
   owner pilot tests the automation but does not validate this bridge.
5. Create a separate Buttondown webhook pointing to
   `https://<worker-host>/webhooks/buttondown`, subscribed only to
   `subscriber.confirmed`, with its signing key equal to `WEBHOOK_SIGNING_KEY`.
   Do not replace the existing attribution webhook.
6. Coordinate the production cutover: retain the old Buttondown welcome until the
   Resend flow and bridge are ready; then disable that native welcome, enable this
   bridge and its webhook, and remove the test-only ID. Record the cutover instant
   and any handoff interval. Requests received while disabled or test-only are
   acknowledged without enrollment, so inspect that bounded interval if the
   webhook was already enabled. Do not backfill the existing list.
7. Verify an owner-controlled post-cutover confirmation through the deployed
   bridge, plus the authenticated aggregate status. Retain the deployment version,
   configuration (without secrets), migration result and provider run evidence.

The repository's checked PR/release-ready path governs merging this system diff.
The repository Pages workflow does not deploy this standalone Worker. Cloudflare
provisioning/deployment and Buttondown/Resend activation remain separate operations;
a green PR does not establish that welcomes are live.

## Failures and review

`GET /health` returns non-sensitive configuration/enabled booleans. It is not a
provider-delivery check. `GET /admin/status` requires `Authorization: Bearer
<ADMIN_TOKEN>` and returns only aggregate state counts plus `review_required`.
There is no public subscriber lookup and no retry or enrollment endpoint.

| State | Meaning | Action |
| --- | --- | --- |
| `pending` | No event POST has begun; preparation did not finish. | Inspect the fault. A repeated signed webhook can retry preparation, including a fresh canonical GET. |
| `dispatching` | Durable claim exists; the process may still be running or its outcome was lost. | If it persists, inspect Resend runs before deciding anything. Never clear or re-send automatically. |
| `accepted` | Resend returned the documented matching event acknowledgement. | Verify the automation/run separately; this does not prove email delivery. |
| `uncertain` | Timeout, connection error, 5xx/redirect, or unexpected success body. | Inspect provider run/log evidence using the stored `enrollment_ref`; never blindly retry. |
| `rejected` | Resend returned a definite 4xx response other than timeout. | Correct the configuration/limit problem and review the specific enrollment. No automatic retry. |

Buttondown canonical GET or pre-dispatch storage failures return 503. Once the
external event can have been attempted, the webhook acknowledges success and keeps
the permanent reservation even if saving the result fails. No background task or
lease expiry replays an uncertain POST. Keep operator monitoring of the aggregate
status and provider runs; this package does not install a notification service.

The ledger stores subscriber IDs, random enrollment references, timestamps, state,
and fixed diagnostic codes. It stores no email, email hash, raw webhook, IP,
credentials, or provider response/error body. The canonical email exists only in
memory and in the necessary outgoing Resend request. Worker logging is disabled in
the example configuration.

## Verified provider references

Checked 2026-10-26:

- [Buttondown webhook signature and confirmed-event contract](https://docs.buttondown.com/api-webhooks-introduction)
- [Buttondown canonical subscriber endpoint](https://docs.buttondown.com/api-subscribers-retrieve)
- [Buttondown subscriber states](https://docs.buttondown.com/api-subscribers-introduction)
- [Buttondown UUID/TypeID compatibility and object prefixes](https://buttondown.com/blog/how-we-migrate-typeID)
- [TypeID encoding specification and reference vectors](https://github.com/jetify-com/typeid/tree/main/spec)
- [Resend event send endpoint](https://resend.com/docs/api-reference/events/send-event)

The Resend event response contains `object: event` and the event name, not a unique
delivery/run ID. This endpoint's reference does not document an idempotency key;
the bridge does not borrow email-send idempotency assumptions.
