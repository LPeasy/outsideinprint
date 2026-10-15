# Newsletter attribution rollout record

Prepared October 15, 2026 against `origin/main` at
`7fbf5d0af9a246afddcb15ff076bcb603f381381`. The approved isolated backend is
provisioned. Frontend activation is blocked by the provider firewall; production
signup still uses the existing Buttondown form. The site PR remains a draft.

## Approval scope

On October 15, 2026 the owner explicitly approved provisioning the isolated
`oip-attribution` Worker and D1 database, persistent secrets, and the proposed
privacy and retention policy. That approval covers configuration in the existing
OIP Cloudflare account and implementation of the 90-day detail limit. No paid
upgrade, firewall bypass, or forwarding of visitor IP addresses is included.
System changes require reviewed PR approval before merging under the shared OIP
publication policy. This draft does not authorize merge or frontend activation.

## Release checklist

- [x] Inspect current verified repository instructions and preserve dirty work.
- [x] Identify all standalone forms and existing Buttondown action/tag.
- [x] Verify API access, newsletter identity, metadata support, and complete list.
- [x] Identify one owner and one earlier test subscriber from explicit receipts.
- [x] Prepare register, client, service, migration, importer/report, and focused tests.
- [ ] Review the seven unclassified baseline records privately.
- [x] Approve resource/access/secret configuration and privacy/retention scope.
- [ ] Verify the effective subscriber-creation allowance for this account.
- [x] Provision only the approved isolated service/database; apply migrations.
- [x] Install approved secrets and exact newsletter/webhook settings. Keep
  public signup disabled while operating reconciliation and health checks.
- [ ] Review/publish the privacy notice with the actual activated behavior.
- [x] Seed campaigns and run a fresh protected baseline before accepting signups.
- [x] Configure one signed webhook for created, confirmed, unsubscribed,
  type-changed, deleted, and complained events.
- [ ] Inspect the real test payload's
  field names privately; record a redacted shape and signature-verification
  result. Do not rely on sample fields that were not actually received.
- [ ] Enable backend signup for the controlled test while the public frontend
  stays disabled. Use a genuinely unused owner-controlled address and a
  predesignated `TEST_SIGNUP_REFS` UUID. The previously documented test address
  can verify resubscription only; it remains a baseline subscriber.
- [ ] Test a signup **from the deployed Worker** under current provider spam
  controls. The observed newsletter auditing mode is aggressive. Require a
  legitimate pending record and delivered confirmation; do not silently add
  visitor IP forwarding or firewall bypass if the Worker origin is blocked.
- [ ] Confirm the email, verify the signed first-confirmation evidence and
  campaign mapping, unsubscribe, and verify current state plus test exclusion.
  Record actual event identity/time fields. If time remains unavailable, retain
  unknown confirmation time and use the separately labeled observation count.
- [x] Run one successful deployed reconciliation and webhook health check.
- [x] Enable scheduled reconciliation/health; failed checks raise Cloudflare
  scheduled-invocation errors and `/health` reports unhealthy ledger operations.
- [ ] Verify operator notification delivery before public activation; Cloudflare
  metrics and the health endpoint alone do not prove an alert reaches a person.
- [ ] Review/merge the checked site PR; activate the frontend endpoint/switch only
  after the above checks pass. Enable tab storage only after its privacy approval.
- [ ] Verify the fresh Pages workflow receipt for exact `commitSha` and
  `generatedAtUtc`, then run one production form smoke check.
- [ ] Produce the first report from the private snapshot and supplied provider
  CSV exports. Missing exports stay unavailable, never zero.
- [x] Record privacy/retention approval: October 15, 2026.
- [x] Validate and enable approved aggregation/purge after complete reconciliation.

## Staged backend evidence

The isolated Worker is `oip-attribution`, at
`https://oip-attribution.red-snow-678d.workers.dev`; its only database binding is
the new `oip-attribution` D1 database. Migrations 0001–0003 applied successfully.
API, admin and webhook-signing credentials plus private identity lists are
Cloudflare secret bindings. Restricted local recovery files are outside Git.
Observability logging is disabled. No paid upgrade or unrelated service changed.

The deployed baseline completed at **2026-10-15T16:13:59.222Z**, with nine records,
two known owner/test records and seven unreviewed records. A full deployed
reconciliation with enabled retention succeeded at **16:15:21.378Z**. The webhook
configuration was enabled with zero failed attempts; this is configuration
evidence, not proof of a delivered confirmation.

The controlled signup at **16:18:25 UTC** returned a definitive provider HTTP 400
`subscriber_blocked`: “This subscriber was blocked by your firewall.” Exact
lookup found no created subscriber and no confirmation email arrived. Its single
reserved test attempt is recorded as rejected, with zero accepted acquisitions.
No second submission path, firewall bypass or visitor-IP forwarding was used.
See [the prepared provider follow-up](newsletter-attribution-provider-follow-up.md).
Resolve the supported provider configuration before retrying or switching forms.
The owner authorized that request, and it was sent to Buttondown support on
October 15. Its questions cover the exact firewall reason, cached
rejection/retry behavior and actual creation allowance. A response is pending.

A later read-only monitoring check refreshed the existing Cloudflare session and
successfully read Worker settings. Notification-policy access returned HTTP 403;
no new access was granted. Operator alert configuration and delivery remain
unverified and must be checked through authorized notification access before
public activation.

Final staged settings are `SIGNUPS_ENABLED=false`, `TEST_ONLY_MODE=true`,
`RECONCILIATION_ENABLED=true`, and `RETENTION_ENABLED=true`. Scheduled reconciliation
runs at 10:00 UTC; the other hourly trigger checks webhook health. The Hugo
attribution and storage switches remain false. `/health` describes ledger and
webhook operations; a healthy response does not establish signup readiness.

The runtime rejected Fetch `redirect: "error"` even though current documentation
lists it. The service now uses `manual` and explicitly rejects every 3xx response;
credentials never follow redirects. A regression test covers that behavior.
Buttondown's stored headers for successful Worker GETs showed no visitor IP:
the observed source and forwarding chain were Cloudflare addresses. Comparisons
were made in memory; no raw IPs or header maps entered the ledger or logs.

The baseline and local suite do not establish production readiness. Completion
requires the live confirmation/campaign join, duplicate/test exclusion, successful
reconciliation, and a repeatable report from actual available source data.

## Rollback

If signup regresses, disable `params.newsletter.attribution.enabled` in `hugo.toml`
through the checked OIP release flow and verify its production receipt. Both
forms retain the original action:
`https://buttondown.com/api/emails/embed-subscribe/OutsideInPrint`, `embed=1`,
and `tag=outside-in-print`. Do not replay uncertain in-flight Worker submissions
through that native path. Keep the Worker ledger and reconciliation available
for diagnosis. Do not drop D1, delete history, or reset acquisition counts.

Backend kill switch alone prevents new API signups but leaves enhanced public
forms unavailable; it is not a restoration of the previous form path. Until a
site rollback deploy completes, users with already-loaded enhanced forms receive
the retry message. Record this deployment latency in incident handling; no
automatic dual-path fallback is implemented because it can duplicate requests.

## Approved privacy scope

The reviewed notice is prepared in `content/privacy/index.md` for the checked
site release. It describes the service conditionally while forms remain disabled:

> When you use a standalone newsletter signup form, Outside In Print's Cloudflare
> service passes your email address to Buttondown, which sends the confirmation
> email and manages the subscription. Outside In Print's attribution database
> does not keep your email address or an email hash. It keeps a random signup
> reference, Buttondown subscriber identifier, approved campaign code, clean
> landing-page path, subscription state, and the available signup/confirmation
> evidence. These identifiers are private pseudonymous information.
>
> Approved campaign values can remain in this browser tab for up to 30 minutes of
> inactivity using session storage. Ordinary internal navigation preserves the
> latest explicitly tagged arrival. When storage is unavailable or disabled by
> privacy choices, the form uses approved tags on the current page or records the
> source as unknown. This service does not use fingerprinting, cross-device
> matching, email-based visitor tracking, or a persistent marketing cookie.
>
> Cloudflare processes the signup request and hosts this limited attribution
> ledger. Buttondown retains subscription information under its own practices.
> Outside In Print does not forward visitor IP addresses from this service to
> Buttondown. The provider may see the service's network address. Access to the
> ledger and private reports is restricted.

The approved 90-day detailed-record limit is enforced after complete successful
reconciliation when `RETENTION_ENABLED=true`. Compact acquisition and weekly
lifecycle summaries remain only while the provider subscriber exists. Verified
provider deletion replaces eligible historical counts with anonymous totals and
removes linked private records. Private exports require the same deletion review.
Optional commerce newsletter preferences retain their existing separate behavior.
