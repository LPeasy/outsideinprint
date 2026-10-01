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
   for the rendered subject and body. A provider send sequence is separate; never
   overwrite the issue number to match it.
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
   Resolve the provider's plain-text “issue #” label explicitly: September 26 is
   Almanack Issue 21; the observed provider footer said #17, possibly its own send
   sequence. Verify before changing any sequence setting. Inspect the old footer
   destinations `https://lpeasy.github.io/outsideinprint/` and
   `https://medium.com/the-balanced-sheet`; the body uses the canonical
   `https://outsideinprint.org/`. Provider footer changes remain a separate owner
   review action. A local artifact cannot certify these provider fixes.

The September 26 showcase is a private review copy, not a corrected publication,
an October 3 edition, or a subscriber send. Owner review of both web and email
previews precedes publication. Push/merge to `main` is the site's publish action.
