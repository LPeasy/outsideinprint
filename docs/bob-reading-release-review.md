# Bob reading — production release review

## Authorized release

The owner approved production publication on October 14, 2026 with $5/month and
$0.50/day OpenAI application limits. The release config uses
`https://oip-bob-reading.red-snow-678d.workers.dev` in the existing Cloudflare
account. The Worker was bootstrapped closed and its two secret bindings verified
by name only. Hosted preflight passed status, both allowed origins, CORS preflight,
foreign-origin rejection and the paid-call kill switch. Enable the final Worker
configuration only after the protected site release publishes its canonical
catalog; then record the hosted API/CPU and exact Pages verification receipts.

The approved Idle Times companion source is preserved in local commit
`4b891cc252666e638e5860246f307c301e344eff` on
`codex/site-pet-reading-20261014`. All eight source hashes and 46 runtime payload
hashes match. The manifest retains its accurate build-time base and working-tree
flag. No desktop game release is part of this website publication.

The toolchain review patched scoped Miniflare dependencies to `sharp@0.35.5`
and `undici@7.29.1`, with weekly Dependabot coverage. Ten affected runtime tests,
the dependency contract, bundle dry-run and fresh advisory check passed.

The signed-in Cloudflare dashboard confirms the existing **Workers Free** plan.
A final CPU screen found repeated typo correction rebuilding metadata and
rescanning the vocabulary. The reviewed fix caches each immutable catalog's
search index, memoizes repeated corrections, and skips impossible matches using
safe length/character bounds. It retains the original ranking, typo cutoff,
filters and query weights. All 121 Worker tests pass, including 69 preview parity
fixtures and new cache/matching regressions. Differential checks against the
previous code also pass. Local warm pathological queries fell from roughly
53–62 ms to 0.25–1.45 ms; cold parse/validation/index/payload medians were
4.2–5.6 ms in warmed V8. A fresh local Node process can still take 20–23 ms on
its first difficult request. These are local timing screens, not deployed CPU
measurements. Verify hosted cold/warm CPU before declaring Free-plan readiness.

GitHub's first site check exposed the open jukebox intercepting mobile Explore
clicks. Mobile navigation now layers above Bob; open menus retain the existing
Bob suspension. All six 320/390px navigation cases pass at 100/125/200% text size,
with center hit-testing, unchanged geometry, no unwanted scrolling and working
Bob controls outside the navigation row. No test hides Bob to avoid the defect.
Current OpenAI project/organization spending and credit-exhaustion codes also
map to the non-retryable collection fallback; 27 affected transport/runtime tests
pass, including a real workerd project-limit response. Final bundle dry-run
passed after these fixes: 64.88 KiB (19.34 KiB gzip).

The following records the local review completed before publication authorization.

Prepared 2026-10-14 from verified `origin/main` at
`93752535ee65625bcdedc583b5fcb7a584bc3d15`, on local branch
`codex/pet-bob-chat-production-20261014`.

## Review locally

The review site is running at <http://127.0.0.1:8769/>. Its local Cloudflare
runtime listens on `127.0.0.1:8787`; typed recommendations use the previously
authorized preview key and can incur small OpenAI charges. Collection choices,
random pieces and collection refinements make no model calls. The original
preview remains separate on port 8768.

Review the small transparent input, settings wheel to its left, three choices
in the floating bubble, hero/summary cards, Shorter/Longer/More, and New subject.
Try a specific interest with a reading-time preference, then a follow-up such
as “more like the second one.” No exact matches offers three random collections.
The same free browsing remains available when chat is disabled or out of budget.

At the original local review, nothing had been deployed or published. The
authorized release section above supersedes that earlier preview-only status.
No hosting subscription or organization-wide spending setting was changed.

## Prepared implementation

- GPT-6 Luna recommends only validated IDs from the published reading catalog.
  Bounded session memory retains interests, exclusions, format and time filters.
- Hugo generates one versioned catalog for both the browser and Worker. The
  review contains 277 pieces and 17 collections. Draft, future, expired and
  noindex content is excluded; cards use each piece's actual hero or portrait.
- The Cloudflare Worker supplies bounded requests, exact-origin browser access,
  safe errors, a 15-second model timeout and no automatic retries. Secrets stay
  on the server. Chat history is not stored in an application database.
- A SQLite Durable Object shares spending reservations and rate limits across
  all Worker instances. Unknown billed outcomes retain their reservation.
- The rebuilt Idle Times runtime has 46 exported files (26,917,409 bytes), with
  source base `62c74b460b06a99cbdfc6132966daefbfe948c35` and
  `sourceWorkingTree:true`. Preserve and review those companion source changes
  together with this site export before release.

## Proposed spending limits

Start with **$0.50 per UTC day and $5 per UTC calendar month for OpenAI**.
Whichever runs out first stops new paid calls. These limits are implemented in
the candidate and exercised locally; they are not yet active on the live site.
Use a dedicated OpenAI project and an enforced provider limit as secondary
protection when setting up production. Check the dated model rates before launch.

Cloudflare is separate. Workers Free supports the required SQLite Durable Object,
but its deployed CPU limit must be measured before choosing that plan. Workers
Paid starts at $5/account/month plus overages, making roughly $10/month a useful
initial allowance with the proposed OpenAI cap, not a total billing ceiling.
See [the cost plan](bob-reading-cost-plan.md) for primary sources and caveats.

## Verification receipts

- Worker tests: 117/117 passed, including 69 preview parity fixtures, actual
  workerd/SQLite tests, concurrency across instances, restart persistence,
  UTC rollover, cancellation, malformed input, quota and safe-error handling.
- Wrangler dry-run bundle passed: 62.61 KiB (18.68 KiB gzip). Dry-run exits
  without uploading or deploying.
- CI workflow contract: 10/10 passed; change classification: 7/7 passed.
- Generated-catalog fixture passed, including identical catalog versions under
  canonical and local preview base URLs. Both backend validators accepted all 277
  actual items and 17 collections; largest tested request was 31,317 bytes
  against a 65,536-byte bound.
- Chat/collection browser tests: 5/5 passed using mocked API responses; desktop,
  390px and 320px layouts, keyboard cards, free fallback, retry and navigation.
  Standard companion smoke and screenshot review also passed.
- Persistent navigation: 5/5 passed, including preserving the exact Bob iframe
  and playing audio object through articles, Library filters, Back and menus.
- Companion regression checks passed across scoped runs: Help, Home, Hide/Show,
  activity and sound settings, desktop click-through, theme, and 390/320px touch
  controls. The checks exposed and fixed a delayed startup action that could
  close a newly opened Help panel. Stowed-position checks explicitly collapse
  the approved initially open jukebox; open-layout checks remain in the reading
  suite. Local navigation now stays on the review site.

Three bounded real local Worker calls used 5,950 input and 178 output tokens:

| Request | Verified result | Time |
|---|---|---:|
| Water/flooding, at most five minutes | Three canonical pieces, all within the limit | 2.40s |
| More like the second one | Preserved the selected article and five-minute preference; valid empty result | 1.41s |
| Syd and Oliver dialogue under six minutes | Three canonical dialogues, all below six minutes | 1.63s |

The valid empty response drives the collection fallback. The final evaluation
receipt reuses the first two recorded calls; it did not repeat them. These calls
cost less than $0.001 at the recorded standard rates; latency is a small local
sample, not a service guarantee.

Local evidence is retained in ignored `workers/oip-bob/output/` and `output/`,
with browser images under the task scratch folder's `output/playwright/`.
The final live receipt is
`workers/oip-bob/output/live-worker-review-2026-10-14T21-43-11-022Z.json`.

## After owner review

1. Review the final site, Worker, dependency, CI and companion-source changes.
2. Choose the Cloudflare account/plan and HTTPS endpoint; configure production
   secrets and the dedicated OpenAI project's enforced allowance. Preserve the
   budget namespace and singleton name across future releases.
3. With explicit deployment authorization, verify actual Cloudflare CPU/limits,
   bindings, origin behavior and a bounded live recommendation. Local workerd
   testing does not establish hosted behavior.
4. Coordinate catalog publication and chat activation through the current OIP
   checked PR process. Require `release-ready`, an up-to-date branch, owner
   review for these system changes, then authorized auto-merge and a fresh Pages
   build. Verify its receipt for the exact commit and generation timestamp.

The Worker kill switch stops paid requests while the static catalog and
collection browsing remain usable. Full service/activation instructions are in
[the Worker README](../workers/oip-bob/README.md).
