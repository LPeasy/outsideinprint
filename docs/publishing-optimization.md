# Publishing optimization

The owner-approved release flow is authorization, checked PR, automatic merge,
fresh production build, then verified Pages deployment. Routine local publication
remains source-only; original artwork review and recorded image approval remain
required. System and dependency PRs need a reviewed diff before merging.

## Check selection

Every run validates workflow structure, permissions, action pins, selection,
cache identity and the aggregate release gate. Classification uses complete Git
history with sparse files. Missing bases, unknown paths and parsing errors select
full checks. Deletions remain part of the changed-path set.

| Change or event | Work |
| --- | --- |
| Essay or registered artwork PR | Actual source/editorial/image gates, one Hugo build, output gates |
| Frontend, template, application content, general data or dependency PR | Site gates plus browser suites |
| Shop content or `data/bookstore.yaml` PR | Site gates plus hosted analytics and piece-sharing browser suites |
| Scheduled-release registry or verified generated cron block only | Site gates and existing schedule/source-binding validation; no unrelated implementation suites |
| Publishing/image tooling PR | Relevant implementation fixtures; Windows for affected PowerShell/image tooling |
| Worker-only PR | The changed commerce or Bob worker's fixtures; no Hugo |
| Documentation-only PR | Workflow safety checks; no Hugo |
| Protected main merge | Fresh production source/build/output checks; previously checked fixtures/browser suites omitted |
| Daily schedule | One fresh time-dependent build at 00:17 America/New_York |
| Monday schedule or full manual run | Daily build plus every active browser/tooling/Windows/worker suite |

The Monday and other-day schedules are disjoint. Manual dispatch defaults
`full_checks` to true; an authorized routine timed release may use false.
Superseded PR runs cancel; production runs remain serialized.
`CI_BRANCH_PROTECTION_ACTIVE=true` records that the strict required-PR policy
was enabled and verified. The main ref must also be protected before merge builds
omit implementation fixtures.

Browser selection distinguishes mobile navigation, Bob reading, hosted analytics
and piece sharing. Their shared dependency install runs when any family is
selected. Shop content and bookstore data retain analytics and sharing coverage;
shared layouts/scripts and unfamiliar dependencies retain broad coverage.
`workers/oip-commerce/src/catalog.js` includes runtime functions and always
selects commerce tests. It is not treated as inert book metadata.

Known test files select their actual CI suite; unrecognized tests remain full.
The direct-commerce storefront contract runs with the bookstore source and fresh
output gates. The scheduled-release registry exemption is exact, not a blanket
exception for JSON or `scripts/ci/`. Workflow narrowing requires valid matching
generated schedules on both Git revisions and identical content outside the
managed block. Missing/deleted comparison inputs and malformed schedules cannot
take this narrow path. The strict `release-ready` prerequisite set, fresh
production build, weekly full sweep and exact deployment receipt are unchanged.

## Resources and publication identity

### Browser environment

Selected Chromium suites run in the existing site job using Microsoft's
`mcr.microsoft.com/playwright:v1.64.0-noble` image, pinned to OCI index digest
`sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f`.
The wrapper checks the image version against the package, lockfile and installed
Playwright modules. It mounts the setup-node binary directory and checks the
exact toolchain Node version (`24.21.0`) inside the prepared container.
Update the Playwright package, lockfile and verified image digest together.

The full checkout, installed npm modules and fresh host-built `public` directory
are bind mounted at their existing paths. No browser job, site artifact transfer
or generated-output cache is added. Suite selection, serial execution, analytics
conditions and the publication clock remain unchanged. Containers use the host
UID/GID so Bob's screenshots retain normal ownership, with 1 GiB of shared memory.
The image supplies browser binaries and operating-system dependencies; the runner
does not install them with apt. Its first amd64 pull is about 986 MB compressed;
assess the first required CI run's preparation time without repeating a build for
benchmarking. See [Playwright's Docker guidance](https://playwright.dev/docs/docker).

### Hugo resources

Only Hugo's processed `resources/_gen` are cached. Compatibility binds the OS,
Hugo version and image-processing implementation/configuration. The normalized
input fingerprint includes approved source identities, dimensions, processing
hints, quality overrides and other processed image sources. Editorial notes and
unrelated tool versions do not invalidate it. Restore exact resources first,
then the newest compatible cache. Sources are validated before building and
outputs afterward. Only successful trusted production builds save resources.
Cache absence is supported. Hugo retains garbage collection and the five-minute
exact-hit / fifteen-minute fallback-or-cold build budgets.

One UTC clock drives Hugo and time-sensitive validators; the existing public
manifest gains `buildClockUtc`. Deployment verifies both `commitSha` and
`generatedAtUtc` at the canonical domain, with six bounded manifest attempts
and twenty-second delays. Canonical route/SEO smoke checks follow once. Broader
SEO probes run after relevant changes and in the weekly sweep. Failure
diagnostics are retained; no automatic rebuild or rollback is performed.

Image output is limited to the legal recipes for approved assets, current
twelve-character source hashes, widths, formats and social variants. Retain the
900 MiB payload, 800 MiB image, 1 MiB derivative and recipe-based total-file budgets (approved derivatives plus 1,500 other files) and report
headroom. Quarantined originals never render.

## Rollout and maintenance

Three reviewed increments cover correctness/required PRs, CI/cache/deployment,
and supported runtimes/dependency maintenance. Keep Hugo's upgrade comparison
separate from Node/npm/Playwright validation, at the same publication clock.
After the first week, inspect existing logs for resource reuse, expected suite
selection, artifact headroom and failures. Do not rerun expensive builds simply
to collect a second measurement.

Keep historical migration evidence and the disabled analytics workflow. Defer
collection-inventory reuse, sub-second duplicate assertions, wholesale test
rewrites, migration-evidence redesign and a new CodeQL program. Cloudflare worker
deployment remains under its existing operational process.

Primary sources and implementation evidence are appended to the existing
2026-10-09 Outside In Print GitHub automation audit in the local ResearchLibrary.
