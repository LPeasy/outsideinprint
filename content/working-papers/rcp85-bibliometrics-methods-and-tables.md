---
title: "RCP8.5 Bibliometrics: Audit Appendix"
subtitle: "Methods, limits, and compact outputs for the metadata search and provisional title-and-abstract screening considered in The Scenario That Ate the Future."
description: "An unlisted audit appendix documenting methods, compact outputs, and limits for Outside In Print's RCP8.5 bibliometric work."
date: 2026-08-30
draft: false
slug: "rcp85-bibliometrics-methods-and-tables"
section_label: "Audit Appendix"
version: "1.0"
edition: "First web edition"
author_id: "robert-v-ussley"
noindex: true
build:
  list: never
image_exempt: true
image_exempt_reason: "This methods-and-limits appendix does not require an editorial illustration."
tags:
  - "climate"
  - "bibliometrics"
  - "RCP8.5"
  - "research methods"
---

This audit appendix records two bibliometric exercises considered during revision of [The Scenario That Ate the Future](/essays/the-scenario-that-ate-the-future/). Its purpose is to explain why the provisional results are not used as evidence in the essay. It is not proof of the essay's thesis. The exercises answer different questions and have different validation status:

1. a broad OpenAlex metadata search, with Crossref used as a limited metadata check; and
2. a narrower, provisional deterministic screening of title-and-abstract framing in a defined climate-policy and climate-risk journal corpus.

The broad search measures what the index returned under stated queries. It does not establish how every paper used RCP8.5. The narrower classifier generated a fixed review queue, but its category assignments have not received the manual review required for publication-grade conclusions.

## Bottom line

The broad search retained 42,295 raw metadata records and deduplicated them to 42,036 records. Those totals are useful for auditing search coverage and duplication, but they are not published as a count of misuse, default-scenario use, or clearly classified RCP8.5 use. OpenAlex search can match titles, abstracts, or indexed full text, and metadata alone often cannot distinguish a default case from a comparison or stress case.

The narrower automated screen began with a 52,710-article corpus drawn from 16 climate-policy and climate-risk journals. It identified 367 records with an RCP8.5 term hit in the title or OpenAlex abstract text and assigned each record to one provisional category.

### Provisional automated output

These are the recorded rule-based counts. They are not human-validated findings.

| Classification | Records | Share |
| --- | ---: | ---: |
| Ambiguous projection | 305 | 83.1% |
| High-emissions clear | 37 | 10.1% |
| Baseline or business-as-usual | 13 | 3.5% |
| Stress or high-end case clear | 11 | 3.0% |
| Default future implied | 1 | 0.3% |

The source validation record explicitly marks this as a proxy classification requiring manual review before publication-grade use. That review remains incomplete. Broad trigger terms can describe a different subject in the same abstract—for example, a baseline management practice, a pessimistic model combination, or a geographic concentration—rather than RCP8.5 itself. The table is published for output inspection and review planning, not as a substantiated finding about scholarly framing.

## Broad metadata search

The search ran May 27, 2026 with a cutoff date of May 27, 2026. OpenAlex was the controlling index. Crossref supplied a limited metadata comparison rather than an independent census.

Search variants included `RCP8.5`, `RCP 8.5`, `RCP85`, `RCP-8.5`, and SSP5-8.5 family terms. The public query log records the exact query strings, filters, windows, raw counts, retained counts, and method notes.

Records were deduplicated in this order:

1. DOI;
2. normalized title plus publication year;
3. publication year plus first author plus venue; and
4. source-database record identifier.

The full search and deduplication records, including the deduplicated export and raw-to-deduplicated map, are retained by OIP and [available on request](/contact/). They are omitted from this site package to keep the appendix compact. The shareable deduplicated export omits author lists and abstract text.

## Framing corpus

The framing corpus contained articles from these 16 journals:

- *Climatic Change*
- *Nature Climate Change*
- *Global Environmental Change*
- *Environmental Research Letters*
- *Climate Policy*
- *Earth's Future*
- *Wiley Interdisciplinary Reviews: Climate Change*
- *Climate Risk Management*
- *Mitigation and Adaptation Strategies for Global Change*
- *Regional Environmental Change*
- *Environmental Science & Policy*
- *Weather, Climate, and Society*
- *Environmental Communication*
- *Public Understanding of Science*
- *Science Communication*
- *Risk Analysis*

The classifier used title plus OpenAlex abstract text. It did not use full articles. Each RCP8.5 record received exactly one provisional classification using this precedence order:

1. `baseline_or_bau`
2. `stress_case_clear`
3. `high_emissions_clear`
4. `default_future_implied`
5. `ambiguous_projection`

Baseline or business-as-usual language included explicit terms such as *business as usual*, *baseline*, *reference*, *no policy*, or *without policy*. Stress-case language included *worst case*, *high end*, *upper bound*, *extreme*, *severe*, or *stress test*. High-emissions language required an explicit high-emissions or high-concentration description. Ordinary scenario, projection, model, pathway, forcing, simulation, or ensemble language without a clearer label fell into ambiguous projection. A future-condition statement without those scenario qualifiers fell into default future implied.

The precedence rule matters. A record containing both baseline and high-emissions language was classified as baseline or business-as-usual. The table also retains non-exclusive signal columns so readers can inspect overlapping language. Rule precedence is not validation: it cannot ensure that a trigger phrase describes RCP8.5 rather than another subject in the same abstract.

## What the compact output can support

The compact download package supports inspection of the stated queries and classifier rules, recalculation of the provisional automated counts, and selection of the 367 flagged records for manual review. It does not reproduce either original exercise: it excludes the full search and deduplication records, classifier code, frozen 52,710-record source corpus, and copied abstract context. Until manual review is completed, it does not support a substantive statement about how often authors framed RCP8.5 in any category.

It cannot determine:

- whether a full article supplied a caveat absent from its abstract;
- whether an author regarded RCP8.5 as plausible at the publication date;
- whether a scenario was used as a forecast, sensitivity case, comparison, or design stress without full-text review;
- author, editor, journalist, or institution intent; or
- the frequency of RCP8.5 use across all climate scholarship.

## Compact audit downloads

- [Exact query log](/data/rcp85-bibliometrics/query-log.csv)
- [Provisional automated framing classifications](/data/rcp85-bibliometrics/framing-classifications.csv)
- [Provisional automated framing summary](/data/rcp85-bibliometrics/framing-summary.csv)
- [SHA-256 checksums](/data/rcp85-bibliometrics/checksums.sha256)

The public framing-classification file omits the copied abstract-context field used during analysis. It retains public identifiers, titles, journals, years, provisional categories, matched-rule names, signal flags, and review fields. Every row is marked `not_reviewed`.

## Interpretation standard

The output is a quality-assurance queue, not evidence about individual papers or the corpus as a whole. An assigned or missing label becomes usable evidence only after a reviewer checks what the triggering language describes and records a decision.

The companion essay therefore does not rely on these provisional category totals. Any future edition that uses them should publish the completed review status, coding protocol, reconciled classifications, revised aggregate summary, and new checksums.
