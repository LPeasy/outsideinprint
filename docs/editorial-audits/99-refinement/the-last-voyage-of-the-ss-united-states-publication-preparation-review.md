# SS United States publication preparation review

Status: READY_FOR_OWNER_PUBLICATION_REVIEW. Prepared locally; not published, scheduled, merged or emailed.

Reviewed November 12, 2026. The owner authorized the final one-sentence cut, publication-record preparation and layout checks. The later timeline instructions apply to this essay and the two earlier sidebar essays. The final visual direction restores the original entry spacing, removes the connecting lines and fits annual ticks between dated entries; a uniform time scale was expressly declined.

## Manuscript and production adaptation

- Contributor Desk workspace `ss-united-states-20261112`, revision 18, Robert V. Ussley, Everyday History. Removed only “Making a ship ready to sink takes work.”
- Immutable export: `revision-000018-20261112T181159Z-abb3945d`. Original source, earlier revisions and historical research package retained.
- Desk body SHA-256: `8916811ca1e72a96fcfd35352c8fa3af531c3166df35fe0c274c894ec18b7c59`.
- Package story SHA-256: `4cfdaf4ddb870e770dbf335e0a8796c306d2aa225cd63b20edfb21a0e700d052`.
- Site essay SHA-256: `70603ed69f4d6fd5bf65c2292ed0cc9e36875c9c135406c13577c4048da6969d`.
- Prepared on branch `codex/prepare-ss-united-states` from verified origin/main `51ecd832daf8f56aedaded9aab688391df569483`. Existing dirty checkout preserved.
- Official converter registered the three managed images. The site adaptation moves the eleven unchanged dated entries into timeline front matter and removes the duplicate body hero. Main prose and all 40 inline source links match the desk export after typographic normalization; all eleven timeline descriptions and their links match exactly.

## Editorial and source records

Current Editorial Philosophy and Media Framing audits: PASS. The prior evergreen rubric grade is 94/100; no new grade or detector score is claimed. The source checklist retains the distinction between sponsor claims, source history, firsthand recollection, general steelmaking data and a ship-specific environmental comparison. Remaining research limits are stated in the essay.

## Artwork and layout

All three unchanged originals were directly reviewed, with approval and source hashes recorded. Managed AVIF derivatives loaded in the actual local site preview. The approved hero/Gallery title remains “Full Steam Ahead.” The sports-deck illustration and simplified reef/recycling infographic remain in their agreed positions.

The introduction and concluding environmental section span the full reading width. The right sidebar begins with the first historical heading. Desktop and narrow-phone checks passed without horizontal overflow or overlapping timeline text. The site uses three main prose regions with complete reading order; mobile stacks the sidebar after the historical middle and before the conclusion.

All three sidebar essays use the same decorative tick renderer:

| Essay | Years | Annual ticks | Dated entry ticks |
| --- | --- | ---: | ---: |
| SS United States | 1949–2026 | 78 | 11 |
| Armistice Day | 1918–1954 | 37 | 7 |
| Daylight saving | 1784–2026 | 243 | 12 |

Original CSS entry spacing is retained. Longer ticks align with the dated labels; small yearly ticks interpolate within each gap. There are no connector paths, forced label positions or claims of a uniform time scale. Date ranges anchor at their midpoint; months/days influence placement where supplied. Screen-reader reading order and linked text remain intact. Print keeps the original dated list and hides the decorative SVG.

The matching Contributor Desk revision-18 preview uses the same renderer. This is a presentation change, so no additional manuscript revision was created. External Edge tabs for the desk and actual site preview were refreshed and left open.

## Validation

- Evergreen package validation: PASS.
- Target essay guardrails with required Editorial Philosophy audit: PASS, no blocking findings.
- Gallery title contract and Everyday History collection organization: PASS.
- Bounded timeline fixture: PASS for exact text/link preservation, reading order, legacy full-length layout and invalid-boundary rejection.
- Calendar/date-range parsing and local interpolation tests: 2 PASS; registered in the standard Node test entry point.
- Actual browser checks: all three essays at desktop and 320 CSS-pixel mobile width; no overflow, no connectors, all expected ticks, natural label flow and marks aligned to dated entries. Contributor Desk checked at desktop and 320 CSS pixels too.
- Rendered source fidelity: PASS; receipt in `rendered-fidelity.json`.
- Homepage, Everyday History collection and Gallery discovery links: present in the local rendered site.
- Whitespace/diff review: PASS.

The local Hugo render was required for the layout change. This is not a production build or deployment receipt. Production Actions and exact commit/build-time verification remain part of a later owner-authorized release. Reconfirm the article date when that release is authorized. The previously published essays have not yet changed on the public site.

## Authorized release handoff

The owner subsequently authorized immediate publication on November 12, 2026. This release uses `publishDate: 2026-11-12T14:09:56-05:00` so its discovery and Gallery order reflect the new release. This is release metadata only; the approved prose, links and artwork are unchanged. Current package story SHA-256: `2be0e69916afa920eedcfaffa9d4fea5cc4cb785faae9defd04cbed52419b2b3`; release essay SHA-256: `f70e60bb2851e548cd2e9bf30df26fff069c26257c2c7e94c3b0ccaadd5a5592`. The readiness hashes above describe the preserved preparation milestone.
