# Newsletter attribution rollout record

Prepared October 15, 2026 against `origin/main` at
`7fbf5d0af9a246afddcb15ff076bcb603f381381`. Implementation is a reviewable,
disabled draft. Production signup still uses the existing Buttondown form.

## Approval scope

Before configuration, obtain owner approval for the isolated `oip-attribution`
Worker and D1 database in the existing OIP Cloudflare account, persistent secret
bindings/access, and the privacy/retention proposal below. No paid upgrade,
firewall bypass, or forwarding of visitor IP addresses is included. Existing
credential availability is not approval to install it as a persistent secret.
System changes require reviewed PR approval before merging under the shared OIP
publication policy. This draft does not authorize merge or frontend activation.

## Release checklist

- [x] Inspect current verified repository instructions and preserve dirty work.
- [x] Identify all standalone forms and existing Buttondown action/tag.
- [x] Verify API access, newsletter identity, metadata support, and complete list.
- [x] Identify one owner and one earlier test subscriber from explicit receipts.
- [x] Prepare register, client, service, migration, importer/report, and focused tests.
- [ ] Review the seven unclassified baseline records privately.
- [ ] Approve resource/access/secret configuration and privacy/retention scope.
- [ ] Verify the effective subscriber-creation allowance for this account.
- [ ] Provision only the approved isolated service/database; apply the migration.
- [ ] Install approved secrets and exact newsletter/webhook settings. Keep
  `SIGNUPS_ENABLED`, `RECONCILIATION_ENABLED`, and the Hugo frontend switch false.
- [ ] Review/publish the privacy notice with the actual activated behavior.
- [ ] Seed campaigns and run a fresh protected baseline before accepting signups.
- [ ] Configure one signed webhook for created, confirmed, unsubscribed,
  type-changed, deleted, and complained events. Inspect the real test payload's
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
- [ ] Run one successful deployed reconciliation and webhook health check.
- [ ] Enable scheduled reconciliation/health and configure failure monitoring.
- [ ] Review/merge the checked site PR; activate the frontend endpoint/switch only
  after the above checks pass. Enable tab storage only after its privacy approval.
- [ ] Verify the fresh Pages workflow receipt for exact `commitSha` and
  `generatedAtUtc`, then run one production form smoke check.
- [ ] Produce the first report from the private snapshot and supplied provider
  CSV exports. Missing exports stay unavailable, never zero.
- [ ] Record the approved retention review date; keep cleanup disabled until its
  aggregation/purge implementation is reviewed and enabled explicitly.

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

## Proposed privacy notice text for review

This is proposed operational disclosure, not a claim about currently active
behavior or legal certification. Replace the standalone-signup paragraph and add
the relevant analytics/provider/retention details only as part of activation:

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

The proposed 90-day detailed-record limit and subscriber-lifecycle deletion
wording must match an approved, implemented retention procedure before becoming
a public promise. Until then, keep this attribution integration disabled.
Optional commerce newsletter preferences retain their existing separate behavior.
