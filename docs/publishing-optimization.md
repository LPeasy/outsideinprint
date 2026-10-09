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
| Frontend, template, application/storefront content, relevant data or dependency PR | Site gates plus browser suites |
| Publishing/image tooling PR | Relevant implementation fixtures; Windows for affected PowerShell/image tooling |
| Worker-only PR | Commerce, monitoring, tax importer, source preparer and Python provisioning fixtures; no Hugo |
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

## Resources and publication identity

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
900 MiB payload, 800 MiB image, 1 MiB derivative and 6,500-file budgets and report
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
