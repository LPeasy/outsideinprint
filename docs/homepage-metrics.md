# Homepage metric maintenance

`data/homepage_metrics.yaml` owns homepage banner and article audience figures. Templates consume its display labels and values; do not duplicate those figures in `hugo.toml` or template dictionaries. `reader_threshold` is the inclusive minimum value for a featured article badge. Article badges say **reads**; the audience banner says **Readers**.

Each entry records `value`, `display_label`, `source`, `metric_definition`, `period`, `observed_at`, `evidence_ref`, `verification_status`, and `recorded_at`. Banner entries also have `unit_label`. An entry's `recorded_at` says when its internal record was created, not when the underlying figure was observed. Unknown observation dates, evidence references, and periods remain `null` rather than receiving an invented date or source.

## Current evidence limits

The six article figures were inherited from the previous homepage's Medium lifetime-view snapshot: 3,400; 1,950; 1,800; 1,400; 1,100; and 25. They retain their original display precision. No observation date or retained evidence was supplied with that snapshot, so each is marked `inherited_unverified_snapshot`. The 25-value record is retained for completeness but does not meet the 1,000 badge threshold.

These source metrics are **views**, even though the public article label is **reads**. They do not demonstrate Medium's separate engagement metric or deduplicated people/accounts. The banner's 10,000+ **Readers** figure is owner-supplied; its covered platforms, period, aggregation method, and overlap have not been verified. Do not sum the six story figures to justify a unique audience or treat the banner as a deduplicated total. This documentation is internal; there is no new public provenance page.

The supporting homepage order is The Dolphin Company (`/essays/the-dolphin-company/`), What I Had (`/syd-and-oliver/what-i-had/`), Default Owner (`/essays/default-owner/`), then Reverse Origami (`/essays/reverse-origami/`). None of these four routes has a source metric record, so none receives an audience badge. Preserve the historical records for unfeatured pieces; a selection change does not justify copying their figures to new selections. The Dolphin Company's homepage label is **Case study**, while its canonical metadata remains **Essay**; presentation labels do not change metric definitions or source-route identity.

## Published reading-page validation

On **2026-09-16**, pinned **Hugo Extended 0.164.0** reported **259** eligible reading pages, supporting the **250+ Articles** lower bound. The inventory contains:

| Included form | Published pages |
| --- | ---: |
| Essays and reported analysis | 195 |
| Affirmations | 34 |
| Dialogues | 19 |
| Musings | 11 |
| Total | 259 |

Here, **Articles** is an inclusive label for the imprint's regular reading publications. The inventory counts Hugo `kind: page` entries in `essays`, `reports`, `working-papers`, and `syd-and-oliver`. All 259 currently belong to the `essays` section; dialogues can have a `/syd-and-oliver/` public URL while remaining in that source section. No published report-section or working-paper entries were present. Section/home/collection landing pages, shop products, newsletter issues, drafts, future releases, and expired pages are excluded. Do not count `_index.md` landing pages as articles.

Reproduce the published inventory with the pinned runtime and a CSV-aware reader. Hugo's `list published` excludes draft, future, and expired content before the kind/section filter:

```sh
.tools/hugo-0.164.0/hugo list published --config hugo.toml,hugo.v2.toml \
  | ruby -rcsv -e 'rows = CSV.parse(STDIN.read, headers: true); pages = rows.select { |r| r["kind"] == "page" && ["essays", "reports", "working-papers", "syd-and-oliver"].include?(r["section"]) }; puts pages.length; puts pages.group_by { |r| r["path"].split("/")[2..-2].join("/") }.transform_values(&:length)'
```

On Windows, use `tools/bin/generated/hugo.cmd list published` and parse its CSV with PowerShell `ConvertFrom-Csv`, applying the same `kind` and `section` predicates. Use the normal production clock and publication settings, not `--buildDrafts` or `--buildFuture`. Update `observed_value`, `observed_forms`, `observed_at`, the evidence record, and verification status after checking the inventory. Keep the conservative 250+ display unless an editorial decision changes it; stop and correct the display if the eligible count ever drops below its stated lower bound.

## Refreshing audience figures

1. Inspect the relevant source statistics and record the actual metric name, reporting period, observation date, and available precision. Retain an evidence reference to a permitted screenshot, export, or durable source record; do not commit session tokens or private subscriber/account data.
2. Match each figure to its canonical Outside In Print route. Change only the corresponding record and retain historical records for unfeatured articles. New lead publications and the four supporting picks receive no audience badge without a qualifying source record. Use `/essays/reverse-origami/` for Reverse Origami even though its source lives at `content/essays/musings/reverse-origami.md`.
3. Keep the source definition honest. A newer Medium view snapshot may become verified as a view snapshot; it does not become evidence of unique readers, or of Medium's separate reads metric. Verify a cross-platform audience total and overlap independently before changing the banner's aggregation status.
4. Update the value, display label, source, definition, period, observation date, evidence reference, and verification status together. Preserve the original `recorded_at` date. Unknown values remain unknown; do not turn a missing record into zero or an invented badge.
5. Build the site and confirm that only featured records with values at or above `reader_threshold` render badges and absent/sub-threshold entries have none. The lead is the newest eligible published reading page; supporting picks remain The Dolphin Company, What I Had, Default Owner, and Reverse Origami, skipping a duplicate lead and using newest-first fallback when needed to retain five unique pieces. Metric refreshes never reorder the selection. No content front matter or canonical classification needs to change when metrics are refreshed.
