# American Nightmare combined edition v1.7 ~ correction record

Approved for coordinated publication October 3, 2026. *The American Nightmare: Keep Dreaming, Kid* combines corrected text v1.7 with a public source ledger and claims-evidence appendix. The original publication date remains August 21, 2026.

## Correction and supplement scope

The main text corrects 20 prose locations and source note 32: residual editorial instructions, references to arranging or expanding chapters, and a research TODO left in the sold edition. Its closing source-use statement now accurately identifies the included reference supplements. The book retains its argument and all 51 source-note numbers; the other 50 source notes are unchanged. The two reference supplements follow the existing reading sections and are included in the EPUB navigation.

The website sample's only prose change from the prior published edition is:

- Before: “This is why Franklin should remain near the front of the book.”
- After: “Franklin gives this older dream a concrete form.”

The sample retains its original typography, existing boundary, 63 prose paragraphs, and source notes 1–7. Its checked date and edition metadata identify the combined edition. Both existing sample-body integrity checks retain the verified corrected body; the combined-edition metadata does not change either body digest.

## Counts and parity

| Scope | Exact words |
| --- | ---: |
| Main reading text and source notes (`ch002.xhtml`–`ch031.xhtml`) | 25,514 |
| Public source ledger | 2,193 |
| Claims-evidence appendix | 499 |
| Reference supplements subtotal | 2,692 |
| Complete reading edition | 28,206 |

The bookstore displays **about 25,500 words** for the main reading text and source notes and names the reference supplements separately. The original sold edition contained 25,553 words on this same main-reading basis; the corrected text before the two-word source-use clarification contained 25,512.

The [historical edition-source audit](bookstore-edition-source-audit.md#counting-basis) remains unchanged. Its main-reading scope includes headings, preface, prologue, part introductions, chapters, epilogue, source/use notes, and source notes. Cover, title, copyright, and navigation are excluded. The same counting convention is applied separately to each new supplement; their words are not folded into the historical main-reading count.

All 32 reading sections match the combined source, and all 51 source notes are retained. All 63 sample prose paragraphs and notes 1–7 match the combined EPUB under the established typographic normalization. The native table of contents, NCX, and landmarks resolve to the intended reading sections.

## Targeted evidence decision

In “Two Countries Under One Dream,” the unsupported institutional generalization and request for future corpus research are replaced with named examples and an explicit limit on what they establish. [Bush's 2006 address](https://georgewbush-whitehouse.archives.gov/news/releases/2006/05/20060515-8.html) and [Obama's 2014 address](https://obamawhitehouse.archives.gov/the-press-office/2014/11/20/remarks-president-address-nation-immigration) connect immigration with American identity. [AAU](https://www.aau.edu/federal-policy-advocacy/international-and-immigration), [Business Roundtable](https://www.businessroundtable.org/making-immigration-work-for-america), and [FWD.us](https://www.fwd.us/global-race-for-talent/) provide attributed examples concerning talent, research, competitiveness, and national leadership.

These are qualitative examples, not evidence of prevalence, an increase over time, a common school curriculum, or a uniform naturalization message. Source note 32 identifies the precise pages, specifies Robert F. Kennedy's introduction where relevant, and corrects the USCIS ceremony reference to [volume 12, part J, chapter 5](https://www.uscis.gov/policy-manual/volume-12-part-j-chapter-5). The USCIS correction used the preserved May 29, 2026 text; current direct retrieval returned 403. This was a targeted evidence check, not a whole-book factual audit.

## Validation and release order

Source-build validation passed for the combined edition: all 32 reading sections, 51 source notes, sample parity, counts, and navigation targets were checked. Website validation uses the three-title PowerShell sample contract, the focused Node e-book-label checks, the exact five-file diff, and whitespace checks. The sample-integrity assertions and every other title's fixtures remain intact.

EPUBCheck 5.3.0 passed with zero fatal errors, errors, or warnings. Visual review of the actual combined EPUB passed for the cover, combined-edition notice, Franklin passage, revised evidence passage, ledger opening and record 32, and appendix opening and added claim; layout and links were readable. The final website CI result is recorded in [PR #137](https://github.com/LPeasy/outsideinprint/pull/137) before release. The release order is to replace the sold combined EPUB, verify the remote readback, and then merge the matching website update. This repository change does not itself replace a download object or delivery pointer. Checkout behavior, prices, other books, storefront layout, and scheduled publications are preserved.
