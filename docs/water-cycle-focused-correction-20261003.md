# The Water Cycle focused correction — October 3, 2026

Status: review candidate. This revision requires owner approval before the sold
EPUB is replaced or these website changes are merged and published.

The source is **Reader R2, corrected September 1, 2026**, verified at **23,025
words**. The October 3 correction candidate contains **23,026 words**, using the
same whole-EPUB reading-content count. The catalog therefore displays **about
23,000 words**. The superseded 21,988-word edition was not the correction source.
The earlier bookstore edition-source audit remains an unchanged historical
record.

## Corrections

- The NASA note now reads: “Caveat: This example offers a narrow historical
  caution, not a direct analogy to modern U.S. settlement.” The website sample
  carries the same caveat.
- Figure 6's image banner reads **FIGURE 06**; Figure 20's reads **FIGURE 20**.
  Figure 20's subtitle no longer contains “corrected.” The original figure
  generator produced the revised images.
- The source crosswalk uses **Figure 3**, **Figure 20**, and **Figure 8** instead
  of V03, V22, and V08. Both Figure 20 alternative-text occurrences use
  **Figure 3** instead of V03.

The maps' data and styling, all **20 figures**, all **12 accessible tables**, and
unrelated text are preserved. The optional “deterministic” wording is unchanged.
The sample retains its complete prologue boundary, **33 prose paragraphs**, three
figures, and narrative note 1. Prices, other books, subscriber data, and newsletter
and social schedules are unchanged.

## Validation

- Whole-EPUB count reproduced the 23,025-word baseline and 23,026-word candidate.
- Text and archive comparisons isolated the requested corrections, the two
  regenerated images, and correction-date metadata. All 239 internal links
  resolve; external destinations are unchanged.
- EPUBCheck 5.3.0 passed with no fatal errors, errors, warnings, or informational
  messages. Both corrected figures passed visual inspection. The original
  renderer reproduced the baseline images exactly; map data and geometry are
  unchanged. Its adaptive PNG palette optimization remains in use.
- The bookstore reading-sample source contract passed, including the corrected
  note, sample body fixture, paragraph and figure counts, navigation boundaries,
  links, and managed sample images.
- Direct-commerce and 2045 storefront source contracts passed. `git diff --check`
  passed.

Local validation used the repository's source-only PowerShell workflow. The
public-site build and generated-output tests remain CI gates. No live replacement,
merge, publication, purchase, or customer email was performed by this correction
pass.
