# Almanack editorial and email checklist

The approved issue's YAML front matter is the shared source for the web sheet and
email. The web template does not render the Markdown body; the email renderer
also ignores it. Do not maintain a second hand-edited email edition in the body.
Historical files retain their original bodies and copy.

1. Use the actual approved issue file. Keep its date, number, artwork, quotes,
   virtue, section order, and sourced marginalia. Do not carry dated news into a
   new issue without editorial verification. If the next draft is absent, stop
   editorial assembly; a labeled private copy of an old issue can show the design.
2. Set `editorial_contract: "almanack-v1"` on new approved editions. Give the first
   `essays` item an `excerpt` of 60–100 actual words from the linked article,
   preserving paragraph breaks with a YAML `|-` block. Check the excerpt against
   the article. The sheet labels it **From the essay** and links **Read the full
   essay**. Keep `description` as metadata if needed.
3. Give each supporting item a `capsule`: one concrete sentence about what the
   reader encounters. Write a specific `bob_note`, at most 50 words. Set
   `worth_reprinting.rationale` to explain why this archive piece belongs this
   week; it replaces the visible description/blurb pair. Preserve its title/link.
4. Supply an issue-specific `email_preheader`. Use the canonical `issue_number`
   for the rendered subject, body, and Buttondown Issue number. The exporter writes
   it as the integer `secondary_id` in `email.json`. Set that field at the top level
   of the draft creation/update payload; `metadata.canonical_issue_number` alone
   does not control Buttondown's footer. Never derive it from provider send counts
   or hardcode the next number.
5. Render complete HTML and plaintext from that source:

   ```text
   python scripts/render_almanack_email.py --issue content/almanack/YYYY-MM-DD.md --output-dir output/almanack-review --hugo <pinned-Hugo-executable-or-wrapper>
   ```

   On Windows, use the repo-local Python and Hugo wrappers. On other hosts, use
   pinned Hugo Extended 0.164.0 from PATH or the explicit `--hugo` argument.
   The renderer only writes local review artifacts. It calls no provider/API and
   reads no credentials, subscriber data, or settings. Custom email outputs are
   enabled only in its temporary mini-site, never in production `hugo.toml`.
6. Review web desktop/mobile, email HTML/plaintext, all source links, and the exact
   diff. Check that the excerpt, capsules, Bob note, and rationale agree across
   web and email. Confirm no unapproved edition appears in the production build.
7. Before sending, inspect the **provider-rendered** preview as well. The generated
   body owns one masthead and a modest web-version link. Retain the supplied issue
   image masthead when its date and number match; otherwise use the paper/serif
   text fallback. Do not repeat a generic deck or put a large issue CTA before Bob's
   note. Consolidate provider/body wrappers in the provider's supported editor;
   this repository does not manage Buttondown templates or settings. Private
   review copies label a production link **Original published issue**.
8. Preserve Buttondown's subscriber-specific unsubscribe/footer functionality.
   At draft creation in the supported editor, explicitly set **Issue number** to
   the source `issue_number` (the API field is `secondary_id`). Read the saved
   draft back and require that number and its subject to match the approved
   export before any preview, scheduling, or subscriber send. Missing, different,
   or unreadable values stop the handoff. Inspect the actual footer too; a private
   draft preview may say `draft issue` and does not prove the final number.
   Metadata, an exported payload, or a successful create response alone is not
   readback evidence. If a historical review collides with an existing number,
   stop for owner handling; do not renumber a sent email or silently omit the field.
   Keep unsubscribe, preferences, legal text and existing footer destinations.

## Installed Windows handoff

The production package handoff is installed in the outer OIP workspace under
`scripts/`, outside this website repository. It uses
`render_almanack_distribution.py`, `almanack_buttondown_body.ps1`,
`send_almanack_to_buttondown.ps1`, `run_almanack_buttondown_preview.ps1`, and
`manage_buttondown_almanack_email.ps1`. The distribution wrapper retains its
immutable shared-renderer snapshot and adds the canonical provider number.

The repository's `scripts/install_almanack_numbering_fix.py` applies the bounded
numbering changes to that existing installation and installs
`scripts/almanack_buttondown_numbering.ps1`. It refuses unexpected source text,
backs up changed files before replacement, and is safe to rerun. Use its `--help`
for explicit workspace, skill and backup paths. This adapter records the actual
local handoff changes without copying unrelated workspace scripts into the site.

Create or update an unsent draft with its explicit number, read it back, then use
the guarded lifecycle handoff with the approved package for any separately
authorized scheduling or send. Do not use a combined create-and-schedule request:
the provider number must be verified while the email is a draft. An uncertain
result is a stop for inspection, never permission to retry delivery. Lifecycle
`-DryRun` only prints the planned request; it requires no package, credentials or
network access and does not certify provider numbering. Real preview, schedule
and send actions require `-PackagePath` and a fresh matching draft readback.

This fix authorizes no provider action and changes no global counter, subscribers,
sent/archive emails, credentials, or schedules. As of October 3, 2026, the next regular source issue is
23; its provider number is unverified until that real draft exists and is read
back. Subsequent issues use their own source number.

Buttondown documents the writable field in [Creating an email](https://docs.buttondown.com/api-emails-create)
and the footer variable `email.secondary_id` in [Templating](https://docs.buttondown.com/templating).

The September 26 showcase is a private review copy, not a corrected publication,
an October 3 edition, or a subscriber send. Owner review of both web and email
previews precedes publication. Push/merge to `main` is the site's publish action.

## Email contrast

The exporter applies `parchment-paired-v1` after rendering the email. Each retained
content cell and live text element carries its own foreground/background pair:
ink `#332a22` or secondary text `#554d42` on paper `#f4eddf`. Links and emphasized
text inside them stay blue `#346782` and underlined. These pairs remain fixed in
normal and dark CSS modes. Artwork, copy, destinations and the website are unchanged.

This addresses the observed Classic handoff: the provider removed the submitted
body attributes while retaining the paper table, and its dark quote rule changed
text to pale gray. Body-only color inheritance and color-scheme metadata cannot
protect that retained content. The adapter applies only to generated email HTML;
it does not style provider legal/unsubscribe content or change global settings.

On the existing Windows workflow, install `scripts/install_almanack_contrast_fix.py`
after the numbering fix. Pass `--workspace-root`, `--skill-path` and `--backup-dir`
as with the numbering installer; use `--check` to inspect pending files. It copies
the same helper beside the active distribution wrapper, applies it after the Medium
footer addition and before hashing, and extends export parity validation. The
immutable PR131 snapshot and all numbering/readback guards remain in place.
Regenerate future packages; do not hand-edit exports or rewrite sent issues.

Check the complete body in light and dark provider-wrapper simulations, including
headings, quotes, attributions, lists and both footer links. All normal-size text
must reach at least 4.5:1 contrast. Inspect desktop and mobile layouts and verify
text, URLs and artwork are unchanged. These browser checks reproduce observed
provider CSS and removed body styles; they do not reproduce every mail client's
automatic color changes. A separately authorized received-email review in the
affected client remains necessary before claiming actual-client verification.
No installer or local check authorizes a draft, preview send, subscriber send,
provider settings change, merge or deployment.

Provider reference: [Designing your email](https://docs.buttondown.com/designing-your-email).
