# Newsletter attribution validation — October 15, 2026

Focused checks passed, including **38 Worker tests and 22 reporting tests** on
the final backend/reporting changes. Previously passing unaffected client,
analytics, and CI-selector/workflow checks remain recorded below.

| Coverage | Passing cases |
| --- | ---: |
| Worker, real SQLite migration/transactions, provider fixtures | 38 |
| Browser attribution and submission | 13 |
| Existing/new GoatCounter campaign mapping | 13 |
| CI changed-path selection | 7 |
| CI workflow safety | 10 |
| CSV import, reporting, baseline, Eastern/DST boundaries | 22 |
| Targeted public privacy-notice contract | 1 |

The isolated pinned-Hugo fixture passed with the integration disabled and enabled,
including `ANALYTICS_ENABLED=true`. PR CI exposed a missing vendored GoatCounter
file in the small fixture; adding it fixed that environment-specific failure.
`git diff --check` passed.
The aggregate baseline and weekly-report commands ran against the actual private
read-only baseline capture; the output correctly marks missing CSV metrics,
unreviewed subscriber classifications, absent webhook, and incomplete week.

The Node run used the repository's pinned 24.21.0 wrapper. Workflow parsing reused
the existing pinned YAML 2.9.1 installation through an ignored local loader; no
new application dependency was introduced. Python used the pinned 3.12.9 wrapper.
Invoke the Python test file directly: the wrapper interprets unittest's short
`-p` option as a PowerShell common parameter. An earlier discovery invocation
therefore ran unrelated Almanack tests and failed their unconfigured Hugo-version
preflight. The corrected focused invocation passed all 17 attribution cases.

The approved Worker/D1, persistent secrets, signed webhook and all three remote
migrations are provisioned. A complete live baseline and reconciliation succeeded.
The controlled Worker signup returned definitive HTTP 400 `subscriber_blocked`;
no subscriber or confirmation email was created. It remains one rejected test
attempt, not an accepted signup or uncertain provider outcome. The provider
firewall was not bypassed. The public integration remains disabled.

The final backend version is `3f6ece6d-a11f-4b8b-9d23-e5fff6490cf7`. Daily
reconciliation, hourly webhook checks and approved retention are enabled; public
signup is disabled and test-only restriction remains configured. A real signed
confirmation, end-to-end unsubscribe, operator alert delivery, actual provider
CSV imports, site release and production form smoke check remain unverified.
See [the rollout record](newsletter-attribution-rollout.md) for the blocking
provider response and exact outstanding gates.

Additional regressions cover cleanup rollback, historical cohorts after detail
expiry, deleted-subscriber anonymization, late signed confirmation after provider
deletion, retained-reference retries, independent unknown unsubscribe cycles,
monotonic summary merging and transactionally consistent reporting snapshots.
Schema-only test webhook receipts use atomic JSON updates without raw payloads.
