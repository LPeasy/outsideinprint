# Bookstore edition-source audit

Audited 2026-10-03 for the draft bookstore refresh against baseline `fee36130ae06a9b0e3886667d09a5ff382c04aac`. All book files were opened read-only. No EPUB, manuscript, web sample, release record, or provider state was changed.

## Verified display facts

| Book | Exact reading-content count | Suggested display | Verified contents |
| --- | ---: | --- | --- |
| 2045 | 26,749 | About 26,700 words | Ten stories, each with an illustration; foreword and author note also present |
| The American Nightmare | 25,553 | About 25,600 words, including source notes | Four parts containing 21 chapters, with a preface, prologue, epilogue, and source notes |
| The Parable of the Sheep | 4,697 | About 4,700 words | Thirteen short chapters |
| The Water Cycle | 21,988 | About 22,000 words, including sources and figure notes | Prologue, three parts, conclusion, sources and figure notes; 20 figures in the reading chapters |

All four packages declare EPUB 3.0 and `en-US`. “English · EPUB edition” is supported for the three other books; “Illustrated edition · English” is supported for 2045. The OPF publication dates are 2026-08-21 for the three other books and 2026-09-12 for 2045. These metadata dates do not assert the direct-store activation date. No print-page counts or reading-time estimates were derived.

## Counting basis

`count_bookstore_epubs.py` reads the actual complete EPUB's OPF manifest and spine. It counts XHTML body text within the explicit member scopes below, preserving inline words and adding boundaries between block elements. It ignores markup, image alt attributes, CSS, scripts, navigation, cover, title, and copyright pages. Headings, visible captions, and numeric reference markers within the selected content count. Unicode letter/digit sequences count as words; an internal straight/curly apostrophe or hyphen remains part of one word. Rounding is to the nearest hundred for display.

- **American Nightmare:** `EPUB/text/ch002.xhtml` through `ch031.xhtml`, inclusive. This includes the complete preface, prologue, four part introductions, 21 chapters, epilogue, notes on sources/use, and source notes. Cover, title page, and `ch001.xhtml` publication information are excluded.
- **Parable:** `EPUB/text/chapter-01.xhtml` through `chapter-13.xhtml`, inclusive. All narrative chapters and their titles are included; separate cover/title/copyright members are excluded.
- **Water Cycle:** `OEBPS/chapters/03_prologue.xhtml`, `04_part1.xhtml`, `05_part2.xhtml`, `06_part3.xhtml`, `07_conclusion.xhtml`, and `08_sources.xhtml`. Narrative, section headings, figure captions and source/figure notes are included; separate cover/title/copyright members are excluded.
- **2045:** Ten complete story members from `EPUB/text/02-the-cracked-pot.xhtml` through `11-deus-machina.xhtml`, plus `illustration-01.xhtml` through `illustration-10.xhtml`, where the story titles appear. The ten story bodies total **26,718** words; the story titles add **31**, exactly reproducing the existing **26,749** catalog value. The foreword and author note add 129 words outside this established story-content scope. The existing “about 26,700 words” therefore remains supported without changing its basis.

Counts describe the whole reading work, never an extrapolation from a sample. Different token conventions or inclusion of publication/navigation material produce different totals; the scope above makes the displayed approximation reproducible.

## Edition identity and release evidence

The complete American Nightmare, Parable, and Water Cycle files each matched the SHA-256 recorded in their final post-assignment QA binding and their successful direct-release/readback evidence. Their bindings record `POSTASSIGNMENT_FINAL_QA_PASS`; the release outcomes record `SUCCESS`.

For 2045, the current illustrated V05 candidate matched both the replacement readback and the candidate SHA-256 in the successful illustrated EPUB/sample release record dated 2026-09-15. That record reports `ILLUSTRATED_EPUB_AND_LIVE_SAMPLE_RELEASE_SUCCESS` with no unresolved issues. The current replacement readback was the counting input.

The older 2045 root artifact and adjacent historical manifest do **not** match that illustrated release. The historical manifest's 27,490 count is not the current bookstore count and was not used. This distinction prevents an accidental count change based on a superseded file.

Raw vault paths, action packet filenames, and digests remain private under the source repository's LLC evidence policy. SHA-256 equality was checked locally; this public report records its result and the EPUB member scopes. No fresh customer download, purchase, payment, or email delivery was attempted. The identity conclusion rests on the preserved local release/readback evidence, not a new live transaction.

## Franklin sentence: pending editorial decision

The sentence below occurs in the public web sample at `content/shop/the-american-nightmare-keep-dreaming-kid/sample.md:132` and in the hash-verified sold EPUB at `EPUB/text/ch005.xhtml`, “The Dream Was Not Immigration.” The surrounding paragraph matches exactly. It is **not** independent web-only sample copy.

Exact review proposal:

- Before: “This is why Franklin should remain near the front of the book.”
- After: “Franklin gives this older dream a concrete form.”

This removes the editorial placement instruction while retaining the paragraph's subject. The rest of the paragraph would remain unchanged. No correction was applied. A coordinated sold-edition/sample correction requires separate approval; this draft PR may document the proposal but should preserve the existing sample text.

## Verification and limitations

- PASS: complete EPUBs located and parsed; release-record equality checked; exact content counts reproduced by the reusable script.
- PASS: 2045 existing count reconciled exactly; current illustrated release distinguished from the superseded root artifact/manifest.
- PASS: four EPUB 3.0 / English declarations, contents summaries, and Franklin sold-edition occurrence verified.
- NOT ATTEMPTED: live checkout, customer download, payment, email submission/delivery, or any book regeneration.
- No missing-source blocker remains for the bookstore metadata. The Franklin correction remains a separate approval decision.
