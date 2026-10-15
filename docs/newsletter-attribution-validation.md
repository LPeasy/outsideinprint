# Newsletter attribution validation — October 15, 2026

Final focused local checks passed: **68 Node tests + 17 Python tests**.

| Coverage | Passing cases |
| --- | ---: |
| Worker, real SQLite migration/transactions, provider fixtures | 25 |
| Browser attribution and submission | 13 |
| Existing/new GoatCounter campaign mapping | 13 |
| CI changed-path selection | 7 |
| CI workflow safety | 10 |
| CSV import, reporting, baseline, Eastern/DST boundaries | 17 |

The isolated pinned-Hugo fixture also passed with the integration disabled and
enabled, including the analytics register mapping. `git diff --check` passed.
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

No live subscription, confirmation, Worker deployment, webhook creation, remote
D1 migration, social import, or production smoke test was performed. Those remain
explicit gates in the rollout record. The real test payload and deployed
proxy-origin spam behavior are not proven by these fixtures.
