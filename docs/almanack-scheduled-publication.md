# Scheduled Almanack publication

`almanack-scheduled-publication-v1` is the dedicated future-release contract for
approved `almanack-v1` packages. It supplements the [Almanack checklist](almanack-editorial-checklist.md),
[publishing workflow](publishing-workflow.md) and [local validation policy](local-validation-policy.md).
It neither authorizes a release nor changes Buttondown delivery permissions.

## Source and conversion

The owner must approve the issue and exact future date/time in
`America/New_York`. Record its complete ISO timestamp with the date-specific
offset. Keep the approved package's `web-archive.md` at `draft: true`, without a
`publishDate`. Keep its exports and all editorial evidence unchanged.

Use a new clean scheduling worktree from fetched, current `origin/main`; record
that base SHA. Install the pinned toolchain through its normal wrappers. The
dedicated script `scripts/stage_almanack_publication.py` accepts only a strict,
complete Almanack package and an explicit release timestamp on its issue date.
It uses the existing package/export validator and pinned Hugo Extended 0.167.0,
including Hugo's Eastern timezone resolution. No additional YAML package is needed.

The only source differences allowed in the staged issue are:

- Replace its one canonical `draft: true` scalar with `draft: false`.
- Add one `publishDate` scalar containing the exact authorized timestamp.

Every other byte—including titles, quotations, source excerpt, copy, URLs,
ornaments, issue number, date, metadata and Markdown body—is preserved. A second
Hugo parse verifies the same semantic boundary. A different pre-existing staged
file stops the command instead of being overwritten. Repeating a successful
command with identical inputs is safe.

Run from the scheduling worktree, using its generated Python wrapper:

```powershell
.\tools\bin\generated\python.cmd .\scripts\stage_almanack_publication.py stage --package <approved-package> --release-at 2026-10-17T08:00:00-04:00 --hugo <pinned-hugo>
.\tools\bin\generated\python.cmd .\scripts\stage_almanack_publication.py validate --package <approved-package> --release-at 2026-10-17T08:00:00-04:00 --hugo <pinned-hugo>
.\tools\bin\generated\python.cmd .\tests\test_almanack_schedule.py
```

The example date is not a recurring default. Both stage and validate refuse a
release time that has passed; post-release verification uses the queued receipt
and live release identity, not restaging with an invented clock.

The script writes its hash/dimension/allowlist receipt in the source package,
outside the publication worktree. A receipt proves local validation only. It is
not publication evidence or an image-approval assertion.

## Artwork and exact paths

For this bounded contract, issue-specific decoration uses the established
nonmanaged static PNG lane under `static/images/almanack/YYYY-MM-DD/`. The script
copies only files referenced by the validated issue's exact HTTPS date directory:
`paper-masthead.png` from the package root and selected ornament/flight-strip PNGs
from `bob-poses/`. It records exact source hashes and dimensions. Unselected crops
stay local. Existing managed story, guest and book images remain unchanged; this
contract does not permit new editorial originals under `static/`.

Before remote queueing, inspect the original masthead and each selected sprite
and strip, and record approval of the exact hashes. Check date/volume, complete
art, transparent edges, alt text and functional links. A new managed illustration
must instead follow the separate registrar, source review and manifest contract.

The issue payload allowlist is precisely:

- `content/almanack/YYYY-MM-DD.md`.
- The selected PNGs named in the receipt beneath that issue's static directory.

For the initial implementation only, this contract also adds
`scripts/stage_almanack_publication.py`, `tests/test_almanack_schedule.py` and this
document. Independently approved issue-renderer or writing-standard changes may
be included only under their own exact, reviewed path list; they are not silently
admitted by the payload receipt. Never include generated `public/`, toolchains,
local package exports, validation receipts, review backups or unrelated work.

## Dormancy and release evidence

Production continues to use normal Hugo flags, never `--buildFuture`. The tiny
clock-controlled test fixture uses the real collection eligibility/resolution,
latest-issue selector and feed-selection partials. It proves that one second
before release the future route, archive entry, latest sample link, root and
Almanack RSS entries, and sitemap entry are absent; at the exact release instant
they become eligible. The prior sample and public homepage lead remain intact
before release. A separate, deliberate future preview confirms the route can be
reviewed early while its collection entry stays hidden. That preview is not a
production output and must never be deployed.

Run the targeted schedule test plus the affected editorial/template checks.
For this issue's newly reviewed layouts, reuse their desktop/mobile rendered
evidence. CI owns the fresh full production build, image output contracts,
public surface tests and `release-ready`. Review the exact PR diff, including any
system support, before enabling owner-authorized auto-merge. Fetch again before
remote writes and revalidate if main advanced. Use the GitHub connector/API;
never update main directly or bypass a failed check.

After queueing, verify the queued commit is on main, its exact timestamp remains
unchanged, the queue deployment succeeded, and the canonical route is still 404.
Confirm the Almanack archive and latest sample still point to the previous issue;
RSS and sitemap must omit the queued route. Preserve the homepage lead and
Gallery: an Almanack issue does not create or promote a Gallery illustration.
Static decoration may already be publicly hosted after queueing; issue dormancy
protects the page and discovery surfaces, not those approved asset URLs.

Only after those checks, use the scheduling skill to create/update the one-time
release heartbeat. Bind it to the queued SHA, exact timestamp, issue number,
canonical route, approved identifying copy and artwork. At or after that instant,
verify ancestry and timestamp, dispatch `.github/workflows/deploy.yml` on `main`
with `full_checks=false`, and require a successful fresh production workflow and
canonical verification for the exact `commitSha` and original `generatedAtUtc`.
Reuse that verification receipt. Check the live issue, archive/latest sample,
feed/sitemap discovery and hosted artwork, while the existing homepage lead and
Gallery remain intact. Write the publication record only after those checks pass.
Follow the scheduling skill's no-retry/terminal-blocker rules.

Mark the source package `SCHEDULED / QUEUED` only after the queue and automation
actually exist, recording their IDs, base/queued SHAs, clock and checks. Until then
use an honest local-preparation state. Website scheduling does not schedule or
send the Buttondown email. Its saved draft must independently pass the exact
subject and `secondary_id` readback and provider review before any authorized send.
