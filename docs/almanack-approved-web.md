# Approved Almanack web presentation

`almanack_layout: "alternating-margins-v1"` opts an issue into the approved
alternating-margin presentation. Issues without this field keep their existing
Hugo rendering. An unknown version or missing/stale presentation fails the build.

The source package remains the shared editorial source. Its standard renderer
creates the approved `full-issue.html/json`. For immediate publication, run the
following from a clean, current-main release worktree:

```text
python scripts/stage_almanack_web.py stage --package <approved-package> --approved-source-sha256 <owner-approved-source-hash> --hugo <pinned-Hugo-0.167.0> --report <outside-worktree>/staging.json
python scripts/stage_almanack_web.py validate --package <approved-package> --approved-source-sha256 <same-hash> --hugo <same-Hugo> --report <outside-worktree>/staging-validation.json
```

This reuses the scheduled publisher's bounded PNG discovery and atomic payload
checks. Only `draft: true` becomes `draft: false` in the staged Markdown; no
`publishDate` or editorial field is added. Use the existing scheduled workflow
for an authorized future timestamp. Neither command publishes or sends email.

The staging helper verifies the package source/metadata and approved full-issue
hashes, then extracts its exact visible issue body into
`assets/almanack/YYYY-MM-DD/body.html`. It restores the canonical issue image
URLs, removes private review controls/data-URI storage, and makes the existing
visible paper masthead the single accessible H1 without a duplicate text title.
All source text, links, full artwork and quote positions remain unchanged.

Future `masthead_navigation: "linked-image-v1"` issues declare a separate clean
web masthead through `email_masthead.web_image_url`, `web_image_alt` and
`web_image_sha256`. Keep this approved PNG beside `paper-masthead.png` in the
package root, using a distinct lowercase/hyphen basename in the exact canonical
issue image directory. The collector verifies its bytes against the declared
hash. Web staging requires this variant once, with its exact alt and no anchor;
it becomes the accessible H1. The email original remains unchanged. Its future
email presentation links the whole image to the issue and omits the separate
web-version paragraph; this does not modify or resend historical emails.

Managed article, guest and book images become bound identity placeholders in the
fragment. Hugo resolves them through the existing `images/model.html` and
`images/picture.html` display pipeline: AVIF/WebP sources and a WebP fallback.
The manifest preserves the original approved ID, alt and display style, including
the lead's632px constraint and compact104px portrait cover. Source matching,
duplicate/unresolved tokens and nonmanaged references fail closed. Only the lead
loads eagerly with high priority; remaining illustrations are lazy. Sharing JPEG
URLs remain in the unchanged email; they are not the web display pipeline.

`manifest.json` binds this trusted generated source asset to the exact staged
Markdown and approved package. Hugo verifies the actual source, fragment and
page-local CSS hashes during every build. Edit the package and regenerate its
approved artifacts and staged payload when changing an issue; never hand-edit
the fragment or maintain a second prose edition. The normal checked PR reviews
the fragment alongside its source. The planner remains the reusable standard
package renderer rather than a second implementation in Hugo.

Approved styles are scoped to `#almanack-approved`, including media rules. Site
navigation, SEO/canonical metadata and public footer remain owned by the normal
base template. The static decoration lane contains one masthead plus the selected
one-to-eight approved Bob PNGs (seven total files in the original reference issue,
plus a distinct clean web masthead when declared); existing managed editorial artwork
is reused. No managed originals, package reports, local paths or review receipts
are published. The adjacent asset manifest contains only hashes and identities.

The shared v1 CSS is immutable. Staging preflights every target and refuses a
differing existing stylesheet before writing any content. A changed approved
stylesheet requires an explicit new layout version and reviewed adapter; do not
overwrite v1 or silently restyle earlier issues.

Raw-byte bindings are preserved across Git clients through `-text` attributes on
the generated fragment directory, versioned CSS and each exact opt-in Markdown
path. The helper appends only missing exact rules while preserving existing
attribute bytes, rejects conflicts, and validates them on replay. It does not
change historical source attributes or normalize the approved package. Include
the resulting `.gitattributes` delta in the reviewed allowlist for each release.

This first adaptation includes its exact helper/template/CSS/test allowlist in
the reviewed release. It does not change historical issues, the email renderer,
provider settings, subscriber state or delivery authorization.
