# OIP newsletter attribution

Isolated Worker + D1 service for standalone newsletter signup attribution.
Frontend and reconciliation switches ship **disabled**. The owner approved the
isolated Cloudflare resources, persistent secrets, privacy notice and retention
policy on October 15, 2026. Actual staged deployment evidence belongs in the
rollout record. Bob, commerce, and optional EPUB newsletter preferences remain
separate. Commerce-origin signups are an explicitly unattributed gap.

## Components

- `src/provider.js`: scoped Buttondown requests, bounded same-key retries,
  explicit pending opt-in, and existing-subscriber handling.
- `src/ledger.js` and `migrations/0001_attribution.sql`: reserved signup UUIDs,
  lifecycle evidence, baseline/reconciliation receipts, and transactional writes.
- `src/index.js`: bounded ingress, exact-origin CORS, signed webhook, protected
  operations, hourly webhook health and daily 10:00 UTC reconciliation.
- `../../data/newsletter_campaigns.json`: sole campaign register, bundled into
  this service and used by Hugo. Seed additions before activating new links.
- [Reporting instructions](../../docs/newsletter-attribution-reporting.md):
  offline CSV imports, link generation, weekly and baseline report commands.
- [Provider audit](../../docs/newsletter-attribution-provider-audit.md) and
  [baseline](../../docs/newsletter-attribution-baseline.md): observed state and gaps.

Requests contain email only in memory during the Buttondown transaction. No
email/hash, IP, raw request, raw provider response, or full referrer is stored in
D1 or application logs. Provider requests use `Buttondown-Context` and API version
`2026-04-01`. No firewall bypass or visitor-IP forwarding is configured. Preserve
the existing `outside-in-print` tag on new subscribers only.

Origin validation is a browser boundary, not caller authentication. The honeypot
and provider spam controls remain in place. Global D1 admission is capped at 15
valid ingress requests per UTC minute, six new references per rolling minute,
and 80 new references per UTC day. Separately, every provider POST, including
retries and resubscriptions, consumes an atomic 80/day budget. This deliberately
leaves room below the documented default 100/day allowance; other account traffic
can still exhaust the provider's shared limit. Caps can be lowered in config;
raising them beyond these ceilings requires reviewed code and verified limits.

An existing active/pending/terminal subscriber gets a neutral existing-subscriber
outcome with no mutation. An intentionally submitted unsubscribed address uses
the documented `add` flow with only email and `type: unactivated`, so confirmation
is required again. Neither case overwrites its original source or becomes a new
acquisition. Same-reference recovery after an uncertain response recognizes the
original provider metadata. The provider's idempotency retention TTL is unknown.

The minimal webhook has no documented timestamp. The service does not interpret
undocumented fields as event time. First signed confirmation and first observed
active status are separate evidence labels; the confirmation timestamp remains
unknown. A canonical subscriber re-fetch determines current lifecycle state, so
an old confirmation cannot resurrect an unsubscribe. First acquisition is unique
per subscriber. Documented `ext_evt_` identities are retained when present and
deduplicated. Without an event ID, undated repeated lifecycle events collapse
rather than inventing multiple occurrences. An unrelated later dated unsubscribe
does not resolve an earlier unknown-time event; those groups can overlap and must
not be added together. Real payload inspection remains a rollout requirement.

## Local checks

From the repository root, using its pinned runtimes:

```powershell
.\tools\bin\generated\node.cmd --test workers/oip-attribution/test/attribution.test.mjs tests/newsletter_attribution_client.test.mjs
.\tools\bin\generated\python.cmd tests/test_newsletter_attribution.py
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File tests/test_newsletter_attribution_render.ps1
```

The service tests execute the migration and SQL against real SQLite behind a D1
adapter, including rollback. Outbound calls are fixtures. The Hugo fixture renders
only two small signup forms with the switch on and off. CI runs these checks and
the site's selected release checks; CI never deploys this Worker.

## Deployment and operating endpoints

Follow [the rollout record](../../docs/newsletter-attribution-rollout.md). The
example config is deliberately not deployable until approved resource identifiers
and secrets exist. Copy `wrangler.jsonc.example` to ignored `wrangler.jsonc` only
after that approval. Configure secrets through the provider's protected secret
input, never shell arguments: `BUTTONDOWN_API_KEY`, `WEBHOOK_SIGNING_KEY`,
`ADMIN_TOKEN`. Use distinct random 32+ character webhook/admin secrets. Restrict
Cloudflare access and exports; subscriber IDs are private pseudonymous data.

After applying migrations, the protected endpoints use
`Authorization: Bearer <ADMIN_TOKEN>` supplied from private process memory:

| Route | Action |
| --- | --- |
| `POST /admin/baseline` | Complete paginated import, mark existing records baseline, seed campaigns; refuses a second baseline |
| `POST /admin/reconcile` | Complete paginated state reconciliation and campaign seed |
| `POST /admin/webhook-health` | Check configured webhook status and delivery attempts |
| `GET /admin/snapshot` | Private v1 reporting snapshot; write only to restricted storage |
| `GET /admin/provider-status` | Protected upstream status/shape diagnostic; no response body or subscriber identities |
| `GET /health` | Aggregate readiness only; 503 when reconciliation >36h old, health check >2h old, or webhook unhealthy |
| `POST /webhooks/buttondown` | Signed lifecycle notification; persistence failure returns 503 |
| `POST /signup` | Enabled forms only; accepts the client UUID and registered campaign tuple |

Import the captured baseline for audit comparison, but run a **fresh** baseline
before enabling the new forms so intervening subscribers are not credited to new
campaigns. Configure explicitly verified owner/test IDs from the private evidence
in `TEST_SUBSCRIBER_IDS`; reviewed reader IDs can enter `NON_TEST_SUBSCRIBER_IDS`.
Unreviewed baseline records remain null classification and are excluded from
verified non-test totals. For a new test address, preassign its UUID through the
test request and add that exact UUID to `TEST_SIGNUP_REFS` before submitting it.
Never identify tests merely by a plus-address pattern.

At 10:00 UTC the Worker reconciles the full list. The other hourly trigger checks
webhook health without overlapping 10:00. A disabled/missing webhook, recent
failed delivery, failed health fetch, or failed reconciliation creates an
unsuccessful scheduled invocation. Configure the existing operator's Cloudflare
failure/availability monitoring for these signals before activation. Quiet traffic
is not proof of health. The snapshot includes the last successful reconciliation,
health-check age, and bounded delivery-failure summary, without raw errors. Do not
automatically rebuild, resubscribe, recreate a webhook, or reset counts on failure.

If a provider signup succeeds but the subsequent D1 batch fails, the visitor sees
the accepted outcome. The pre-reserved UUID and Buttondown metadata allow the
next full reconciliation to recover the mapping. If the provider outcome is
uncertain, the client retains the same body/key. It never falls back to a second
submission path. Investigate repeated errors or a daily-budget cap instead of
raising limits or switching paths automatically.

## Retention and deletion

The owner approved 90 days for detailed attempts/events on October 15, 2026.
Apply all migrations and set `RETENTION_ENABLED=true` after validation. Cleanup
runs only after a complete successful reconciliation. Historical acquisition
timestamps and compact weekly unsubscribe summaries remain in the minimal
subscriber lifecycle while its Buttondown record exists; detailed requests,
landing paths and event identities expire. The reporting snapshot combines
remaining details, compact summaries and anonymous historical counts.

Reconciliation marks records absent from a complete list as `deleted`; failed
fetches never imply deletion. Enabled cleanup atomically preserves eligible
anonymous campaign/week totals and removes the subscriber's lifecycle, signup,
event and compact-summary rows. Unknown owner/test classifications stay excluded
from verified non-test totals and cannot be reclassified after anonymization.
Delete the same IDs from private exports and account for provider backup retention.
Never retain email hashes as a deletion workaround. A subscriber restored after
complete identifier erasure cannot be linked to the erased acquisition.
