# OIP release dispatcher

This Worker supplies the release clock; GitHub still builds, gates, deploys and
verifies the site. It has no repository content-write, Pages, payment, email or
customer-data credentials. The only repository is `LPeasy/outsideinprint` and
the only dispatch target is `.github/workflows/deploy.yml` on `main`.

## Provisioning and cutover

1. Merge the reviewed support code through the checked PR flow. Deploy this
   directory with the existing pinned Wrangler installation. Use `--keep-vars`
   for subsequent updates to preserve the scoped App IDs and service variables. Supply
   `SOURCE_COMMIT_SHA` as the reviewed main SHA. The new Durable Object defaults
   to inactive; deploying or restarting cannot activate publication.
2. Install the owner-approved private GitHub App on this repository only, with
   **Actions read/write**, **Contents read-only** and mandatory Metadata read.
   Store `GITHUB_APP_PRIVATE_KEY` and a random 256-bit `ADMIN_SECRET` using
   `wrangler secret put`. Supply the nonsecret `GITHUB_APP_ID` and
   `GITHUB_INSTALLATION_ID` as Worker variables. Never deploy an owner PAT.
3. Use the authenticated `/admin/probe` endpoint with `{"ids":["registered-id"]}`.
   The ID must be in its actual approved window. The five-minute Cron runs a
   source-bound `release_probe` through GitHub. It must produce a matching
   admission artifact, successful `release-ready`, and skipped site/deploy jobs.
   Read `/admin/state` for the exact canary run and result. This does not mark
   a real release complete or build the website.
4. Initial activation starts the new clock. Earlier release operations keep
   their existing publication records and are not replayed or reverified. Confirm
   activation precedes the next queued release. Pausing or redeploying preserves
   that original boundary, allowing later overdue work to catch up normally.
5. In a separate checked cutover PR, set `scripts/ci/release-dispatcher.json` to
   `mode: "cloudflare"` and regenerate the marked workflow block with the
   maintained helper. Keep daily/Monday maintenance unchanged. After its exact
   production receipt passes, POST `{"enabled":true}` to `/admin/control`.
   Activation refuses a missing canary or unmerged cloud mode.
6. Observe one actual Cron tick and its persisted state. Preserve provisioning,
   canary, source SHA and cutover receipts outside the public repository.

The initial migration from GitHub cron is intentionally staged. Support code
with `mode: "github"` is not a completed cutover. A future release adds only its
normal source-bound registry entry; it needs no Worker deployment or local timer.

## Operation

Cron runs every five minutes in UTC. Eligibility uses the current instant,
never the event's nominal scheduled time or a future Hugo clock. Work inside
`[releaseAt, endsAt)` is eligible, including overdue work. An explicitly approved
`rebuildAt` remains a separate operation. Expired windows require operator
attention; the dispatcher never extends them. Ordinary main pushes and maintenance
can independently publish already eligible content.

A single repository Durable Object serializes requests. It writes intent and a
nonce before the dispatch POST. Later ticks find `OIP release <nonce>` and record
the actual run ID. Active GitHub builds wait. An uncertain POST is never repeated;
it is reconciled for up to 30 minutes and then blocked. Genuine failures remain
blocked. A deliberately skipped superseded run can follow current main while
its approved bindings remain intact. A successful run must have the exact
canonical commit and original generation timestamp, both current-main guards,
successful route/SEO steps and passed declared release checks. The Worker reuses
those artifacts; it does not rerun live page smoke tests.

`GET /health` exposes only enablement, source version, last tick and an attention
flag. All `/admin/*` endpoints require the encrypted admin bearer secret.
`GET /admin/state` supplies the durable evidence. Disable with
`POST /admin/control {"enabled":false}`; this stops new releases without erasing
state or interrupting an existing run. Failed work is not automatically retried
by disabling/re-enabling. Investigate it and obtain the appropriate authorization
before an intentional recovery. Inspect Cloudflare errors and durable attention
records after a failure. Do not infer email delivery from web publication.

Cloudflare is an independent trigger, not a promise of minute-exact availability.
An unavailable GitHub platform, invalid source, failed build or failed live check
still needs diagnosis. Keep the two services' evidence distinct.

## Focused validation

Run `node --test workers/oip-release-dispatcher/test/*.test.mjs` plus the affected
workflow/admission/feed fixtures and `git diff --check`. The service has no npm
dependencies. CI retains required release checks. Do not run a full local site
build, image-library audit or browser suite for scheduler-only changes.
