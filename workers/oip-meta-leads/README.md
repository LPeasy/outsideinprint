# Meta newsletter lead handoff — prepared, disabled

This separate Worker prepares a small Meta Instant Form pilot. It is **not
deployed, connected, enabled, or provider-tested**. No credentials, database,
webhook, schedule, lead, subscriber, or email was created by this work.

The owner authorized campaign and signup-flow preparation for review, with no
launch or advertising spend. Keep every activation switch off until the reviewed
form, ads, provider access, and permitted processing path are approved. The
example has an empty form registry and no cron schedule. Its Page ID is the
non-secret ID observed in Meta Business Suite; the other bindings are deliberately
unconfigured.

## Proposed route

1. A person submits the reviewed Higher intent Meta form with their email and a
   required consent checkbox. The saved draft is
   `OIP_FreeSaturday_Intro3_v1_REVIEW`. The checkbox copy is:

   > Yes, send me the free Outside In Print newsletter and three introductory emails after I confirm my email.

2. Meta sends a signed Page `leadgen` notification. The Worker verifies the raw
   body HMAC, Page, approved form, approved ad, and campaign time window, then
   queues only the lead reference and fixed attribution. It does not take an
   email from that webhook or make a provider request during intake.
3. A later scheduled invocation retrieves that exact lead from Meta. It requires
   matching lead/form/ad/time, a single email field, and a single matching
   `custom_disclaimer_responses` checkbox with the exact approved affirmative
   value. Consent is never inferred from an email, form submission, or an
   absent checkbox response.
4. An atomic reservation permits at most five Buttondown creation attempts in a
   rolling hour, shared by scheduled and manual processing. Both paths sample a
   live clock at each reservation after Meta retrieval; a backward clock step
   within a pass cannot backdate the reservation. The Worker posts
   `type: unactivated` with the existing `outside-in-print` tag and fixed paid
   campaign UTMs. It does not set `regular`, import records, set collision
   overwrite/add behavior, patch existing subscribers, or forward visitor IPs.
5. Buttondown sends its confirmation message. A successful create response is
   **pending confirmation**, not a confirmed acquisition or email delivery.
6. The existing `oip-welcome` confirmation bridge performs its own canonical
   eligibility check and starts the existing Resend sequence. This Worker never
   calls Resend. Its API-created records are not provider CSV imports; the
   welcome bridge intentionally excludes imported records. The actual joined
   path remains an acceptance-test requirement before launch.

Meta's CRM panel currently requires an active form; the form was preserved as a
draft for review. No existing CRM connection was established. A custom adapter
also needs actual app/Page permissions and lead access. Those are prerequisites,
not work this source package claims to have completed. A reviewed Meta CSV
retrieval procedure would be a separate, explicit fallback; no CSV ingestion or
Buttondown bulk-import path is implemented or silently substituted here.

## Exact consent binding

Meta's own Business SDK declares `custom_disclaimer_responses` as a list whose
items have `checkbox_key` and `is_checked`. The SDK types `is_checked` as a string.
Actual draft-form keys and values have not been observed. Request the field
explicitly and inspect a redacted canonical test response after the owner permits
the required form activation/test. Record the exact key and value type in the
reviewed registry. Do not guess `"true"`, coerce truthiness, treat a string
`"false"` as true, or read a checkbox from `field_data`.

Registry shape (illustrative placeholders, **not deployable configuration**):

```json
[
  {
    "formId": "REPLACE_AFTER_FORM_REVIEW",
    "adIds": ["REPLACE_AFTER_AD_REVIEW"],
    "campaignCode": "oip-meta-newsletter-pilot",
    "consentVersion": "newsletter-intro3-v1",
    "consentCheckboxKey": "REPLACE_FROM_CANONICAL_TEST",
    "consentCheckedValue": "REPLACE_WITH_OBSERVED_AFFIRMATIVE_VALUE",
    "startsAt": "REPLACE_WITH_APPROVED_ISO_TIME",
    "endsAt": "REPLACE_WITH_APPROVED_ISO_TIME"
  }
]
```

`consentCheckedValue` accepts only exact `"true"`, `"1"`, `"yes"`, or boolean
`true`, and only the type/value actually configured passes. This flexibility does
not assert that Meta returns all these representations. Duplicate/missing
responses, a different key, an unchecked value, and a type mismatch are held.
Keep the saved form copy/readback with the consent version; review any form-copy
change as a new version. Queued rows snapshot their form/ad/campaign/consent
binding immutably. Removing or changing that approval holds them before a GET.

## Configuration and review gates

Use a new isolated D1 database; never reuse the welcome or attribution database.
The example is not a deployment script. If later approved, copy it to ignored
`wrangler.local.jsonc`, fill a verified Graph version and existing newsletter ID,
and apply the migration only to the new database.

Required Worker secrets, to be configured only when authorized:

- `META_APP_SECRET`: raw webhook signature verification.
- `META_VERIFY_TOKEN`: at least 32 random characters for the challenge exchange.
- `META_PAGE_ACCESS_TOKEN`: permissioned access to this Page's leads.
- `BUTTONDOWN_API_KEY`: existing approved newsletter access.
- `EMAIL_HMAC_KEY`: at least 32 random characters, retained with the database.
- `ADMIN_TOKEN`: at least 32 random characters for private operations.

The first processing run binds the newsletter and email-HMAC key fingerprint to
D1. Changing either fails closed. Never clear those bindings or reservation rows
to retry a request. Tokens stay in secret storage, never shell arguments or
tracked files. Provider URLs use fixed hosts, authorization headers and no
redirect following. Runtime logging is disabled in the example.

Before any live test or activation, review these concrete gaps:

- Publish/activate the exact owner-approved form when authorized; obtain its ID,
  approved ad IDs, launch window, canonical consent key/value, and actual Meta
  webhook shape. Test leads that omit ad identity will fail closed; do not relax
  the production allowlist to make such a fixture pass.
- Verify app access, `leadgen` Page subscription, lead retrieval permissions and
  the business/Page lead-access assignment using the current Meta setup guide.
  Exact applicable permissions depend on the account/app setup. A successful
  webhook challenge alone proves none of these.
- Verify Buttondown account creation allowance and that the existing generic tag
  remains available. The docs describe a default creation limit of 100/day;
  the rolling-hour cap does not override the account's daily limit. Any 429 is
  retained as a rejected attempt for review, never automatically retried.
- Resolve the previously observed Cloudflare-origin spam firewall behavior.
  `TRUSTED_SOURCE_BYPASS` is false. Turning it on requires an approved trusted
  Meta-lead source and provider-supported use, and does not disable confirmation.
  The five-attempt rolling-hour cap remains in force for either mode. Do not
  forward visitor IPs or try another creation path after an uncertain response.
- Review public consent/privacy and explain weekly Buttondown delivery plus the
  three Resend introductions. The existing services' unsubscribe controls are
  separate; this package adds no cross-provider unsubscribe synchronization.
- Approve retention/deletion handling for this new private ledger. It stores
  persistent pseudonymous identifiers; it has no automatic purge mechanism.
  For this bounded pilot, preserve dedup/uncertain reservations and record a
  closeout/deletion review. Do not claim an automatic 90-day deletion policy.
- The prepared shared CI source includes this suite in the selectable Worker job
  through `worker_meta_leads`, with its directory in the sparse checkout. Local
  classifier/workflow/release-gate tests passed; no remote CI has run. Required
  checks must pass on the reviewed PR before a release merge.
- After review, an owner-controlled end-to-end test must demonstrate one new
  pending record, delivered confirmation, one confirmed identity, one existing
  welcome run, duplicate rejection, and attribution reconciliation. Synthetic
  tests do not establish provider delivery. Do not replay uncertain events.
- Only after those checks should an explicit cron (for example, every five
  minutes) and the intake/dispatch switches be enabled, synthetic-only disabled,
  and operational monitoring assigned. More than five arrivals/hour remain
  queued; expect confirmation delay and monitor queue age. No ad launch is part
  of this sequence unless separately authorized.

## Routes and states

An optional **secret** `OWNED_TEST_JSON` can bind one separately approved Meta test
that lacks a canonical ad ID. It contains exact Page/form/lead IDs, the canonical
creation instant in ISO UTC, an expiry no more than 24 hours after creation, the
existing-key email HMAC, and the observed consent key/value. Keep this contract
out of source, aggregate records and logs. Signed notices must match its identity
and time and have an absent/zero ad ID. Canonical retrieval must omit `ad_id` and
return the exact approved inbox HMAC and affirmative consent. Expiry is checked
again before dispatch. Remove the secret after the test; retain its permanent
ledger reservation. Production forms still require exact numeric ad IDs.

Test rows use the explicit `owned-test` ad marker, `oip-owned-test` campaign and
`owned_test` medium. They cannot pass the paid approval registry. This path uses
the same queue, scheduled processor, canonical retrieval, rate cap, pending-only
Buttondown creation and duplicate reservation as production. A locally signed
operator replay is a replay test, not evidence of an authentic Meta delivery.
Do not infer notification retries from generic webhook documentation; retain
actual provider-delivery evidence for the acceptance result.

| Route | Behavior |
| --- | --- |
| `GET /health` | Non-sensitive switch/configuration booleans; no delivery assurance. |
| `GET /webhooks/meta` | Exact challenge response only with explicit verification switch and correct token. |
| `POST /webhooks/meta` | Verified Meta notices only; disabled intake returns 503 and stores nothing. |
| `GET /admin/status` | Authenticated aggregate counts, oldest queued age and review flag (including queue age over 15 minutes); confirmed subscribers explicitly not measured here. |
| `POST /admin/process` | Authenticated bounded queue pass, sharing the same reservation/rate rules as scheduled work. |
| `POST /admin/synthetic-preview` | Authenticated canonical-shape check restricted to `@example.invalid`; no network or database writes. |

| State | Meaning |
| --- | --- |
| `queued` | Signed lead reference accepted; no Buttondown POST reserved yet. Transient Meta GET failures retry after five then ten minutes; deferred rows yield their slots to later leads. Queued failures appear in the review flag. |
| `held` | Canonical lead/consent invalid, approval changed, permanent Meta retrieval rejection, or three failed transient retrievals; requires review. |
| `duplicate` | Another lead already reserved the normalized email HMAC; no new POST. |
| `dispatching` | Durable claim exists. A crash may have occurred before or after POST. Never automatically release/retry. |
| `pending_confirmation` | Valid 201 response for matching `unactivated` API subscriber; confirmation not yet measured. |
| `rejected` | Definite Buttondown 4xx other than 408; no retry or alternative pathway. Existing/suppressed identities remain unchanged. |
| `uncertain` | Timeout, connection failure, redirect, 5xx, or unexpected success; inspect provider evidence before any decision. |

At most one POST is attempted per reserved lead/email, including concurrent
deliveries. This sacrifices automatic recovery after a crash to avoid duplicate
confirmation emails. It is not an exactly-once guarantee. The public webhook is
acknowledged after durable queueing; operator monitoring is required for later
failures. No alert delivery or monitoring automation is provisioned here.

## Measurement and data

The ledger retains Meta lead/Page/form/ad IDs, approved campaign/consent binding,
timestamps, failed-retrieval count/backoff fields, a keyed HMAC of trimmed/lowercased
email, Buttondown subscriber ID, state, and fixed diagnostic codes. It does not retain plain email, raw Meta
payload, names, telephone numbers, IPs, tokens, or provider response bodies. The
email lives in memory during the necessary Meta read and Buttondown POST. HMAC
values and subscriber/lead IDs are private pseudonymous data, not anonymous data.
Case normalization is conservative deduplication; no Gmail alias/dot rewriting is
performed. Deleting/recreating identities can still defeat cross-system
deduplication outside this ledger.

Count confirmed acquisitions only by joining successful pending-record subscriber
IDs with actual Buttondown status/confirmation evidence, excluding tests and
preexisting subscribers. Do this in a restricted operator report; no subscriber
IDs or emails belong in public campaign files. `pending_confirmation` counts,
Meta leads, and site submit counts are not confirmed subscribers. This package
does not send audience lists, email hashes, or conversion events back to Meta.

## Synthetic verification

Use the pinned Node wrapper, with no package installation required:

```powershell
.\tools\bin\generated\node.cmd --test workers/oip-meta-leads/test/meta-leads.test.mjs
```

The suite uses in-memory Node SQLite with the real migration and atomic SQL, fixed
synthetic IDs, reserved email domains, and injected mock network responses. It
covers signature/allowlist checks, exact disclaimer consent, duplicate/concurrent
delivery, immutable attribution, HMAC dedup, rolling-hour rate limits with slow
retrieval and live manual-processing clocks, queue starvation, bounded read
retries, suppressed identity rejection, lost claims/results, configuration drift,
and zero-network synthetic mode. It does not test Cloudflare deployment, Meta access, Buttondown
delivery, or the complete welcome path.

## Provider sources

Verified October 26, 2026:

- [Meta-owned lead-retrieval setup guide](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md)
- [Meta Lead field definitions](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/lead.py)
- [Meta disclaimer response fields and types](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/userleadgendisclaimerresponse.py)
- [Meta webhook payload validation](https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads)
- [Buttondown creation, confirmation, collisions, firewall and rate limits](https://docs.buttondown.com/api-subscribers-create)
- [Existing welcome bridge](../oip-welcome/README.md)

The direct Meta documentation was rate-limited during broader campaign research;
the accessible Meta-owned repository and SDK establish the shape used here.
Live response and permission verification remain required.
