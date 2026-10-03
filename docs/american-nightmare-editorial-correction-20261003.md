# American Nightmare editorial correction ~ review candidate

Prepared October 3, 2026. **Pending publication; draft PR only.** This change accompanies corrected text v1.7 of *The American Nightmare: Keep Dreaming, Kid*. The original publication date remains August 21, 2026. No corrected edition has been released by this PR.

## Correction scope

The companion EPUB candidate corrects 20 prose locations and source note 32: residual editorial instructions, references to arranging or expanding chapters, and a research TODO left in the sold edition. The revision retains the book's argument, structure, assets, navigation, spine, identifiers, and all 51 source-note numbers. The other 50 source notes are unchanged.

The website sample's only prose change is:

- Before: “This is why Franklin should remain near the front of the book.”
- After: “Franklin gives this older dream a concrete form.”

The sample remains at its existing boundary, with 63 prose paragraphs and source notes 1–7. Its checked date and version now identify the corrected review candidate. `sample_release_status: ready` records verified technical parity with that candidate; it does not authorize publication or assert replacement of the currently sold file.

## Count and parity

The corrected EPUB contains **25,512 words**, replacing the prior edition's 25,553. The storefront's nearest-hundred display becomes **about 25,500 words**. This uses the unchanged [edition-source audit counting basis](bookstore-edition-source-audit.md#counting-basis): EPUB members `ch002.xhtml` through `ch031.xhtml`, including headings, preface, prologue, part introductions, chapters, epilogue, source/use notes, and source notes. Cover, title, copyright, and navigation are excluded. The historical audit remains unchanged.

All 63 sample prose paragraphs and notes 1–7 match the rebuilt EPUB candidate under the sample's existing typographic normalization. The reading-sample contract updates only this title's expected checked date, version, and normalized sample-body digest; boundaries, paragraph count, headings, note text, and the other books' expectations are preserved.

## Targeted evidence decision

In “Two Countries Under One Dream,” the unsupported institutional generalization and request for future corpus research are replaced with named examples and an explicit limit on what they establish. [Bush's 2006 address](https://georgewbush-whitehouse.archives.gov/news/releases/2006/05/20060515-8.html) and [Obama's 2014 address](https://obamawhitehouse.archives.gov/the-press-office/2014/11/20/remarks-president-address-nation-immigration) connect immigration with American identity. [AAU](https://www.aau.edu/federal-policy-advocacy/international-and-immigration), [Business Roundtable](https://www.businessroundtable.org/making-immigration-work-for-america), and [FWD.us](https://www.fwd.us/global-race-for-talent/) provide attributed examples concerning talent, research, competitiveness, and national leadership.

These are qualitative examples, not evidence of prevalence, an increase over time, a common school curriculum, or a uniform naturalization message. Source note 32 identifies the precise pages, specifies Robert F. Kennedy's introduction where relevant, and corrects the USCIS ceremony reference to [volume 12, part J, chapter 5](https://www.uscis.gov/policy-manual/volume-12-part-j-chapter-5). The USCIS correction used the preserved May 29, 2026 text; current direct retrieval returned 403. This was a targeted evidence check, not a whole-book factual audit.

## Validation

- PASS: rebuilt EPUB source comparison across all 30 reading sections and all 51 notes, scoped edits, and sample parity.
- PASS: EPUBCheck 5.3.0, with zero fatal errors, errors, warnings, or informational messages.
- PASS: visual review of the cover, correction notice, Franklin passage, revised evidence passage, epilogue, source note 32, and its continuation; no clipping or overlap observed.
- PASS: `tests/test_bookstore_reading_sample_contract.ps1 -SourceOnly`; all three titles retain their expected boundaries and source-note fixtures.
- PASS: exact four-file change scope and whitespace check. A full website render was not needed for this text-only draft; production build and deployment remain outside this preparation step.

## Release boundary

The corrected EPUB and matching sample require a coordinated, separately authorized release. This draft changes no download object or delivery pointer, checkout behavior, price, other book, storefront layout, or scheduled publication. Merge and deployment remain pending.
