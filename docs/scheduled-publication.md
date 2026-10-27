# Cloud-triggered scheduled publication

Cloudflare supplies the independent release clock; GitHub Actions owns every
build, gate, deployment and canonical verification. The local computer and Codex
need not be online. Each format keeps
its own editorial, artwork, staging, and approval requirements. This convention
adds a release registration to the same reviewed publication PR; it does not
authorize content, send email, or replace the dedicated publisher.

## Register the approved release

1. Resolve the owner's requested date and time in `America/New_York`. Set the
   primary source's `publishDate` to that exact ISO timestamp, with the correct
   `-04:00` or `-05:00` offset and whole-minute precision. Use `draft: false` in
   publishable Markdown. Linked Gallery artwork uses the same approved timestamp.
2. Prepare and stage the approved content using its publishing skill. Complete
   the format's strict content-only stage validation **before** adding scheduler
   metadata. Preserve the approved text, images, captions, citations, and ending.
3. Write a private JSON registration spec. Name the primary source first in
   `bindings`; list the additional protected sources and managed images. Declare
   the identifying public-page checks required by that format.
4. Run the helper from the repository root. It reads staged Git blobs, not
   working-tree bytes, so hashes match committed sources on Windows and Linux.
   Inspect the preview before writing:

   ```powershell
   .\tools\bin\generated\node.cmd scripts/ci/scheduled_releases.mjs --spec C:\path\release.json
   .\tools\bin\generated\node.cmd scripts/ci/scheduled_releases.mjs --spec C:\path\release.json --write
   .\tools\bin\generated\node.cmd scripts/ci/scheduled_releases.mjs --check
   ```

5. The helper maintains `scripts/ci/scheduled-releases.json` and checks the marked
   schedule block in `.github/workflows/deploy.yml`. In Cloudflare mode the block
   has no per-release cron entries, so an ordinary new schedule changes only the
   registry. Review the actual changed paths alongside the validated content allowlist. Do not
   loosen a dedicated publisher's content-only validator to accept workflow files.
   Re-register if an approved source changes before merge.
6. Follow the checked-PR, reviewed-diff, owner-authorized auto-merge flow and
   [shared PR monitoring procedure](publishing-workflow.md#finalize-and-monitor-the-pr),
   including prompt conflict-free refresh if `main` advances while checks run. After
   merge, verify the queue deployment's exact commit/time receipt and the required
   dormancy checks. Record the actual merged queue SHA, registration ID, workflow,
   Eastern/UTC times, source hashes, and checks in the package as `SCHEDULED / QUEUED`.

The existing two Disney releases remain in
`scripts/ci/disney-releases.json` with their original bindings and live verifier;
the legacy verifier retains their historical bindings and receipts. New releases
use the generic registry. `scripts/ci/release-dispatcher.json` controls the staged
cutover: `github` retains generated timers until the Worker canary passes;
`cloudflare` retires those timers while preserving daily/Monday maintenance.
Only call a queue ready when the configured dispatcher is deployed, enabled,
and has a verified canary. See the [operator runbook](../workers/oip-release-dispatcher/README.md).

## Registration fields

Example for an essay; substitute real approved copy, sources, artwork, and time.
The helper fills missing hashes and image dimensions from the staged index.

```json
{
  "id": "example-essay-release",
  "route": "/essays/example/",
  "releaseAt": "2027-01-15T09:00:00-05:00",
  "bindings": [
    {"kind": "file", "path": "content/essays/example.md"},
    {"kind": "gallery", "path": "data/editorial_cartoons.yaml", "slug": "example-art"}
  ],
  "images": [{"id": "essays/example/hero"}],
  "checks": [
    {
      "route": "/essays/example/",
      "title": "The Approved Article Title",
      "containsText": ["The approved byline", "The unique opening.", "The protected ending."],
      "links": ["https://example.org/primary-source"],
      "imageIds": ["essays/example/hero"]
    },
    {"route": "/collections/example/", "links": ["/essays/example/"]},
    {"route": "/gallery/", "containsText": ["The Approved Artwork Title"], "links": ["/essays/example/"]}
  ]
}
```

- `id` is a unique lowercase hyphenated identifier. Reusing an existing ID updates
  that registration; review a reschedule as an intentional authorized change.
- `route` is the primary canonical path, ending in `/`. There is no hardcoded
  author, collection, article format, homepage lead, or series.
- `releaseAt` must match the primary source's exact `publishDate`. The helper
  rejects past times and incorrect Eastern offsets, including nonexistent DST
  wall times. `endsAt` defaults to 24 hours later and is an exclusive absolute
  verification-window end. A shorter window may be declared; windows longer than
  24 hours are rejected to prevent overlap with a following day's grouped trigger.
- Optional `rebuildAt` adds one separately owner-authorized rebuild after
  `releaseAt` and before `endsAt`, using an explicit Eastern timestamp. It keeps
  the original publication eligibility and reuses the same source bindings and
  public checks. Each trigger checks its own absolute start and the release's
  end, so a later-year cron cannot rebuild the site. This is a requested extra
  run, not an automatic retry of a failed deployment. It receives its own durable
  operation record; do not use repeated rebuilds to compensate for a failed check.
- `bindings` records SHA-256 hashes. A `file` hashes the exact Git blob. A `gallery`
  hashes only the uniquely selected Gallery row, using sorted-key canonical JSON;
  unrelated Gallery additions do not invalidate it. A Gallery-only release can
  use that row as its first binding. Additional linked content may be file-bound.
- `queuedCommit` is optional. When present, it must remain in `main` ancestry.
  A same-PR registration cannot know its future merge SHA; immutable source
  bindings are mandatory instead. Record the actual queue SHA after merging.
- `images` binds each managed asset's approved manifest hash and native dimensions.
  `imageIds` selects the images to verify on each declared page.
- For approved static artwork such as Almanack decorations, `checks.imageUrls`
  declares up to 64 same-site image URLs. Each must appear in a rendered `img`
  on that HTML page and return an image successfully. Bind static source files
  separately when their exact bytes are protected; this does not convert them
  into managed assets or substitute for their format-specific artwork review.
- `checks` supports exact `h1` titles, normalized visible text, anchor destinations,
  and managed images. Include the format's required captions, source/credit links,
  discovery surfaces, and protected copy. A primary title or identifying text is
  required. Maximums are 32 checks and 64 image bindings per release, with at most
  64 releases selected in a run. Live fetching shares a 256-request budget.

For an Almanack issue, bind the dedicated stager's public source and approved
hosted assets. Include issue, archive/latest-sample, RSS, and sitemap checks;
email remains a separate workflow. An XML check can identify a canonical URL:

```json
{"route":"/index.xml","format":"xml","containsText":["https://outsideinprint.org/almanack/example/"]}
```

XML checks accept safe canonical `.xml` paths and require `containsText`; they
do not accept HTML titles, image IDs/URLs, or anchor-link checks. Use the site's actual
feed and sitemap routes for that content format. Specialized assertions that the
declarations cannot express still require a bounded manual reconciliation; do
not claim that a declared link-presence check proves link order or uniqueness.

## Trigger and verification behavior

The Worker checks current main's registry every five minutes. It uses the actual
instant and `[releaseAt, endsAt)` window, including overdue eligible work. It
writes durable intent before dispatching the existing workflow on current main
with `full_checks:false`, a unique request ID, the observed main SHA, and a
validated JSON array of registered `release_ids`. Multiple due registrations
share one build. The two 12:17 AM Eastern maintenance schedules and Monday full
checks remain unchanged. During initial `github` mode, the helper retains the old
UTC per-release crons until the separate checked cutover.

API requests enter the same source-bound live verification path as timed runs.
A `release_probe` validates admission and source bindings with no site build or
Pages deployment. The `release-dispatch` artifact binds the nonce, exact main SHA,
actual check time and release fingerprints. A stale expected SHA is superseded
without building; the dispatcher can follow newer current main. Neither a probe
nor admission alone proves publication.

One repository Durable Object suppresses duplicate ticks, completed operations
and in-flight work. An uncertain dispatch is reconciled by its nonce, never
blindly resent. Real workflow or live-check failures remain blocked. Read-only
transient observations can resume without dispatching another build. Completed
operations require the original canonical commit/time receipt, both main guards,
successful route/SEO checks and passed per-release results. Existing verified
releases can be reconciled from actual operator-supplied format evidence and
GitHub's immutable production artifacts; this provenance remains explicit.

GitHub's native schedules can be delayed or dropped; they are no longer the
per-release clock after cutover. Cloudflare polling and GitHub queues still make
the requested time a start time,
not a guarantee of minute-exact availability or exactly-once execution. Expiring
a verification window does not withdraw content: normal pushes and daily builds
can publish any already eligible source. Do not advance Hugo's clock, enable
future content, or automatically retry a failed release.

Before building, the classifier checks approved sources, primary timestamp,
optional ancestry, and artwork bindings. CI also runs the helper's
`--check-pending` against checked-out Git sources for every unexpired registration,
so post-registration changes fail the queue PR rather than waiting for release.
Historical expired records are excluded from this source check. The local
`--check` remains a schema/cron check for the uncommitted staging workflow.
After the ordinary current-main guards
and deployment, the live verifier reuses `deployment-diagnostics/live-manifest.json`
and requires the production run's exact `commitSha` and original `generatedAtUtc`.
Only then does it run the declared article-specific checks. It does not rerun the
workflow's route/SEO smoke tests or fetch the manifest again.

Generic results are saved as `deployment-diagnostics/scheduled-releases.json`,
with per-release outcomes, actual check times, build identity, and attempted and
verified URLs. The two existing Disney registrations retain their specialized
`scheduled-release.json` receipt. A failure remains failed for diagnosis; neither
the helper nor verifier dispatches another build or silently reschedules content.

## Local records and exceptions

Use the [shared receipt finalization procedure](publishing-workflow.md#finalize-from-deployment-receipts)
to reconcile the private publication package and Contributor Desk in one pass
when bookkeeping is in scope. Reuse the exact successful production identity,
canonical route/SEO evidence, and applicable passed per-release checks; perform
only missing article-specific checks. Record the actual verified milestone and
canonical URL before marking local records Published. A dormant queue receipt
only supports `SCHEDULED / QUEUED`; it does not create `publication-record.md`.
Do not edit manuscript history or infer email delivery. This later bookkeeping
is not a prerequisite for public release.

Do not create a local release heartbeat by default. Disable an equivalent local
timer only after its cloud replacement has merged and been verified. An owner
may explicitly request a local exception; record the reason and dependency. Local
preparation/review automations and separately authorized email delivery are not
changed by this web-publication default.
