# Bob reading and interaction release — October 15, 2026

The owner reviewed the local preview and authorized publication on October 15,
2026. This release adds catalog-validated current-article recommendations,
collection-scoped typed follow-ups and removable filter chips. Local collection
discovery remains free of model requests; GPT-6 Luna and the $0.50 UTC daily /
$5 UTC monthly production limits are unchanged. The semantic-search benchmark
remains a separate experiment and is not enabled by this release.

Desktop and mobile arrive with only Bob's sprite. Click or tap Bob for the
wheel, then the wheel for Jukebob and reading. Right-click directly toggles
Jukebob and settings together. Bob's surfaces appear above the navigation rail;
open navigation menus and other overlays retain the existing suspension rules.

## Review evidence

- 140 Worker tests passed, including backward compatibility, context, hard
  collection filters, durable budgets, concurrency, restart and transport.
- 12 reading browser scenarios passed at 1440px, 390px and 320px, including
  filters, explicit Retry, free collection discovery and navigation cancellation.
- Eight disclosure cases plus a post-open reload check passed. Four navigation
  cases and five right-click/keyboard/touch cases passed after later UI changes.
- The nine mobile-navigation/browser cases passed against the existing rendered
  fixture with the release sources and runtime. Their old nav-above-jukebox
  expectation now checks the approved Bob-above-nav ordering, real collapse and
  restored navigation access at 320/390px and 100/125/200% root text sizes.
  Pointer checks wait for runtime hit masks; layout and accessibility checks remain.
- Three real local GPT-6 Luna requests returned three catalog pieces each;
  measured usage was 7,099 input / 267 output tokens, estimated $0.001020875.
  Local preview and production budget ledgers remain separate.
- Independent frontend/runtime and backend diff reviews found no release
  blockers. Shared and strict adapter TypeScript checks passed. All eight
  runtime source hashes and 46 output hashes/lengths verified; total 26,919,164
  bytes. The standard browser client passed and its screenshots were inspected.

Runtime export: `index-CfZEBzVr.js` with unchanged `index-BYXARHwK.css`.
The manifest records source base `4f7873301fa208a72b12e704e29530a5857dd7a7`,
`sourceWorkingTree: true`, and exact source/output hashes. Native desktop and
standalone-demo behavior, artwork and audio are unchanged.

## Release coordination

Deploy the reviewed Worker before the frontend: the new backend accepts old
clients, while the new frontend requires context, collectionId and apply_filters.
Preserve the existing budget namespace and `bob-production-budget-v1` singleton;
do not recreate accounting or upload replacement secrets. Verify the deployed
version/configuration and one bounded live request without automatic retries.

Publish through the protected PR, current `release-ready`, authorized auto-merge,
fresh production Hugo build and canonical-domain deployment verification. The
GitHub verification receipt must match the merged commit and exact build clock.
No CI or dependency configuration change is part of this release.
