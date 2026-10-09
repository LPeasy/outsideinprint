# Approved Almanack Buttondown standard

Approved by the owner on October 1, 2026 after the private September 26, Issue 21 test. Applies to the October 3 edition and later issues when approved for distribution. The [review conversation](https://chatgpt.com/s/cx_6abf11284e3c8191ad8e62c5c88da4e0) and [saved private draft](https://buttondown.com/emails/em_6gtzktfpf394jvjsepg46q3jw8) record the approval. This supersedes the September 12 Modern/Markdown/H1 distribution instructions. Masthead artwork approval remains in force.

## Presentation

- Buttondown Classic, existing blue accent `#346782`, Robert V. Ussley, America/New_York. Custom provider header, footer, CSS and inline variables remain disabled. No paid upgrade.
- One original paper masthead with an adjacent modest issue link. Preserve its artwork and complete alt text. For a new edition, change only the date and Roman volume to match the approved source. Preserve the arrow already in the raster.
- One modest `View the web version` link. Use `Original published issue` when a private revision points to an unchanged public issue. No repeated generic description, separate provider subject/date heading, or large live-text issue CTA.
- Specific `email_preheader` in source and Buttondown Description. September 26's sentence is an example, not the next issue's copy.
- Shared source fields: `editorial_contract: "almanack-v1"`, actual lead `excerpt` of 60–100 words, one concrete supporting `capsule` per card, specific `bob_note` of at most 50 words, and a single `worth_reprinting.rationale` in place of the visible deck/blurb pair. Preserve quotations, virtue, art, factual marginalia and section order.
- Footer links to `https://outsideinprint.org/` and `https://medium.com/the-balanced-sheet`, plus the established motto. Preserve provider unsubscribe, preferences and legal footer.
- For each future issue, set Buttondown's per-email Issue number (API secondary_id) to the source canonical issue_number. Metadata alone does not set the footer. Read back the saved draft and require its secondary_id and subject to match the validated export and masthead before preview, scheduling or sending. Stop on a missing number or mismatch. Keep sent emails unchanged; do not rely on a global next counter.

## Export and handoff

Use `scripts/render_almanack_distribution.py --issue <approved-source> --output-dir <package>` with the local Python wrapper. It calls the pinned shared PR #131 exporter baseline, with the owner-requested local opt-in extension described below, under `config/almanack-email/exporter`, using Hugo Extended 0.167.0 at `C:\Users\lawto\Documents\30_Resources\toolchains\hugo\0.167.0\hugo.exe`. The wrapper adds the approved Medium footer link in HTML and plaintext, then applies the parchment-paired-v1 contrast adapter to HTML. Pair dark ink #332a22 with cream #f4eddf directly on retained content cells and reader-facing elements, including quote paragraphs, so removing the outer body does not lose text color. Keep blue #346782 links underlined. Retain these fixed pairs in normal and dark provider-wrapper simulations. Local simulations do not verify an actual email client: inspect the approved provider and received preview in light and dark modes before claiming client verification. Keep custom provider CSS disabled and preserve sent emails. It writes `email.html`, `email.txt`, `email.json`, and `REVIEW.txt`. It changes no website files or Buttondown settings.

The skill renderer dispatches `almanack-v1` packages to this exporter. Both local Buttondown handoff scripts now consume the HTML body, exported subject and specific preheader, and set the per-email template to Classic. They reject stale or legacy exports. Strict package validation reproduces the exports from the source and checks parity, alongside the source, quote ledger, factual and editorial gates. Do not hand-edit an exported body.

Review the actual Buttondown preview on desktop and mobile, then its generated plaintext in a test message. Local exports cannot certify provider wrappers, footer numbering or unsubscribe behavior. Record draft URL, subject, recipient, screenshots and delivery evidence. Send one owner test only; inspect status before any uncertain retry.

The September 26 review remains a separate unsent draft with audience Nobody and archives Hidden. Those private review settings are not a subscriber distribution template. For a future approved issue, verify the intended audience and archive visibility at publication time. The weekly automation remains draft and owner preview only; this template approval does not authorize a subscriber send, scheduling or public publication.

## Verified reference and limits

The October 1 test delivered once to `lawtonperret96@gmail.com` as `[PREVIEW] PRIVATE REVIEW ~ Bob's Almanack ~ September 26, 2026 ~ Issue 21`. Actual provider desktop/mobile rendering preserved all three images and protected copy, with no horizontal overflow. Received provider plaintext contained the required unsubscribe footer and `draft issue`, without `issue #17`.

Only the global website social link changed: `https://lpeasy.github.io/outsideinprint/` to `https://outsideinprint.org/`. Classic was already the global template; the old sent email's Modern override remains historical. No global sequence-suppression control was established. Recheck the provider footer for the next issue; do not renumber the Almanack. Buttondown's link checker could not verify Medium, so the owner-verified destination was preserved.

Evidence and rollback values: `C:\Users\lawto\Documents\40_Scratch\2026-10\almanack-buttondown-private-review\buttondown-review-report.md`.

## Local optional Issue 23 components

The owner requested canonical rendering of `bob_feature`, `bob_ornaments`, and `bookshelf` on October 9, 2026. The isolated `almanack-bob-bookshelf-v1` extension adds these components only when their fields are present. Original snapshot provenance remains in ORIGIN.json; extended exports also record their baseline commit and a reproducible SHA-256 of the actual renderer/template code. Historical issues without the fields produce the same HTML, plaintext, and metadata. The existing Classic, contrast, footer, numbering, source-validation, fresh-render parity, and body-hash checks remain mandatory. No hand-edited exports or disabled gates are permitted. Local opt-in preparation does not activate production or authorize provider previews, schedules, publication, or sends.

The local opt-in engine follows current main's pinned Hugo 0.167.0 requirement. The renderer resolves OIP_HUGO_BIN or PATH before the documented Windows resource fallback; every selected binary must pass the pinned Extended-version check. Historical parity is rechecked against the original 0.164.0 baseline during release preparation.
