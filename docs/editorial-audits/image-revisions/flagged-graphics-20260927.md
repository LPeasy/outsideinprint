# Flagged graphics and captions — September 27, 2026

## Scope and current result

Owner instruction: correct flagged graphics and captions while leaving surrounding prose unchanged. Ten corrected raster graphics are integrated across seven articles. Three more articles received caption/alt corrections only. No surrounding prose, headings, original dates, titles, routes, collection membership, or unrelated artwork changed in this pass. Existing unpublished revision notes disclose the repairs; no second edition advance was added to the same pending release.

**Not published.** Three Camp Mystic evacuation-model figures remain unchanged and on HOLD pending the Windows source files. Other pre-existing prose/source concerns remain outside this graphics-only authorization.

- [Exact content substitutions](flagged-graphics-20260927-changes.json)
- [Asset mapping, saved paths, edit prompts and refinement prompt](flagged-graphics-20260927-assets.json)
- [Core release status](../core-collections-source-link-batch-2026-09-27.md)
- [Modern Bios release status](../modern-bios-source-link-batch-2026-09-27.md)

## Corrections and source fit

| Article / figure | Correction | Basis and limits |
|---|---|---|
| The 100-Year Flood, section 5 | Replaced the misleading accelerating curve and uneven scale with three probability cards: 1%, 9.6%, 26%. Retained the left panel and surrounding design. | `100 × (1 − .99^n)` at 1, 10 and 30 years; independent years and constant annual probability explicitly labeled. No new plotted interpolation or finite-time guarantee. |
| Public vs. Private Pay, compensation shares | Corrected all six table rows and government scope, including health-insurance and legally required benefit cells. | [BLS March 2025 ECEC Table 1](https://www.bls.gov/news.release/archives/ecec_06132025.htm). Shares of total employer compensation, not wage premiums; federal workers excluded. Selected benefit components do not sum to total benefits. Separate custom comparisons remain owner-verified on Windows, not independently inspected. |
| Invasive species, python/monitor | Replaced the unsupported eradication-likelihood assertion with localized removal as a management target. | [FWC Nile monitor profile](https://myfwc.com/wildlifehabitats/profiles/reptiles/lizards/nile-monitor/). Management target is not a measured probability of eradication. |
| Invasive species, aquatic plants | Distinguished control of established floating-heart populations from prevention in uninfested waters. | [UF floating-heart account](https://plant-directory.ifas.ufl.edu/plant-directory/nymphoides-cristata/) and [UF hydrilla guidance](https://ask.ifas.ufl.edu/publication/AG404). No claim that all floating-heart populations remain eradicable. |
| Leo XIV chronology | Corrected interrupted Peru service, election versus assumption of provincial office, episcopal appointment, first-US-pope wording, and Creation Mass/peace-offer dates. | [Vatican biography](https://www.vatican.va/content/leo-xiv/en/biography/documents/biografia_leone-xiv.html), [May 14 address](https://www.vatican.va/content/leo-xiv/en/speeches/2025/may/documents/20250514-giubileo-chiese-orientali.html), [Creation Mass account](https://www.christianunity.va/content/unitacristiani/en/news/2025/2025-07-09-mass-for-the-care-of-creation.html). Historical cutoff remains July 10, 2025. |
| Flash Flood Alley, runoff | Replaced unsupported category curves with a clearly qualitative mechanism diagram. | [NWS flood hazards](https://www.weather.gov/safety/flood-hazards): heavy rain, limited infiltration and steep terrain. No modeled runoff curves or ranking of category timing. |
| Flash Flood Alley, alerts | Separated NWS WEA routing from local notification systems; removed local approval as an NWS dependency. | [NWS WEA guidance](https://www.weather.gov/mkx/flashflood_updates_WEA). Diagram does not guarantee receipt or establish a particular person's awareness. |
| Flash Flood Alley, preparedness | Replaced an unsupported deterministic failure chain with four distinct preparedness layers. | Explicitly labeled conceptual, not a causal reconstruction. [Commerce OIG](https://www.oig.doc.gov/wp-content/OIGPublications/OIG-26-017-I-SECURED.pdf#page=15) distinguishes South Fork river-gauge gaps from alerts and response; it does not substantiate the retired graphic's allegations. |
| What Happened at Camp Mystic, Hunt | Replaced the inconsistent CNN-derived plot with two labeled historical observations. | [Commerce OIG, introduction and Figure 3](https://www.oig.doc.gov/wp-content/OIGPublications/OIG-26-017-I-SECURED.pdf#page=5): about 10 feet around 3 a.m., 37.52-foot crest at 5:10 a.m. CDT, Hunt about five miles downstream. No intermediate series invented. Gauge stage is not cabin depth; observations are not real-time receipt timestamps. New graphic credits OIP and OIG, not CNN. |
| The Water’s Rising, summary | Replaced an unscoped hazard scorecard with selected regional/time-bounded observations and a separately labeled hurricane projection. | [EPA 2024, Figures 9 and 14](https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P101AXFE.txt); [NOAA GFDL](https://www.gfdl.noaa.gov/global-warming-and-hurricanes/). Precipitation is not flash-flood frequency; a larger projected intense-storm share is not a universal increase in hurricane counts. |
| What Is Risk?, Panama caption | Caption and alt now describe the visible Gatún Lake level series, January 2019–November 2024, rather than assign a drought-start date. | Existing graphic inspected. CNBC attribution retained; direct CNBC retrieval unavailable. No pixels or plotted values altered. |
| The World the UN Was Built For, map caption | Recognized the founding members already shown on the map. | [Official UN membership history](https://www.un.org/en/about-us/growth-in-un-membership), full founding list returned in search; direct page access returned 403. No map pixels or adjacent interpretation changed. |
| Who’s Responsible?, CBS caption | Repaired malformed attribution and identified the image as a location graphic, not a regulatory floodway map. | Existing visible CBS News Confirmed credit; no unverified image-page URL added. |

## Generation and review

Used the imagegen skill and built-in image-editing tool, with local originals inspected before editing. One call per asset; the Hunt draft received one targeted refinement to remove generic clock icons that did not match the stated times. All ten selected results were visually inspected for text, numbers, chronology, qualifiers, cropping and legibility. No programmatic raster editing was used.

Misleading analytical curves were not redrawn from invented data. The probability graphic uses calculated values; the Hunt graphic uses selected sourced observations; the runoff and preparedness graphics are explicitly conceptual. The asset JSON records prompts, original IDs, final generated files and canonical repository destinations.

All ten historical originals remain byte-identical in the managed archive. New corrected originals have new stable `essays/...-corrected-20260927` IDs, exactly one alias each, approved review status and detail quality 90/70. Prior originals are `retained_unreferenced`; their historical aliases are retained for resolver provenance.

Manifest inventory: **544 assets, 585 aliases, 522 referenced, 22 retained**. The PowerShell and Node source contracts list the ten deliberate retirements. The output contract still verifies the historical 109-image cohort but requires output derivatives only for its currently referenced members. Frozen migration/review reports, hashes and static legacy files remain unchanged.

## Focused verification

- One exact-substitution comparison against the turn-start backup covered all existing content files: exactly ten articles changed, solely by the recorded image/alt/caption/revision-note substitutions. Surrounding prose and other content were unchanged byte-for-byte.
- The subsequent runtime-reference phase initially included binary content; its UTF-8 read failed after the content-preservation comparison had completed. Only that phase was rerun with text-extension filtering. It passed: each replacement occurs once; retired logical IDs and aliases have no runtime references.
- Manifest integration independently checked native PNG dimensions, new hashes, original-byte preservation, one-alias mapping and canonical text. Reconstructing the pre-change manifest confirmed unrelated entries were untouched.
- The existing Hugo preview rebuilt successfully after the final content changes. All ten replacement IDs are present in generated article HTML, once each as managed picture elements. The scratch count probe required two assertion repairs: the emitted attribute is `data-oip-image-id`, and counting must be restricted to picture elements because zoom controls also carry the ID. The correctly scoped picture check passed. This is preview/output evidence, not a production build or browser/keyboard test.
- No local Node/browser suite, repeated archive audit, production publication gate, commit, remote write or deployment. PowerShell remains unavailable on this Mac. The existing CI checks remain required at authorized publication.

Turn-start recovery copy: `/tmp/oip-graphic-corrections-FVDdVO`. Original graphics are also retained in the repository; no asset was deleted.

## Remaining boundary

Three figures in `camp-mystic-evacuation-timeline-guadalupe-river-flash-flood-july-4-2025` remain on HOLD: `medium/42145583d76ac3616def9f537a23dd218becdf4a7b344792606bfcc5f9e88c19`, `medium/edf9c9656e1f84536b0a965f37a58e7cb1e26100742c63990e5b133a04badb7c`, and `medium/ed3b9f9e6208b9bfbcdab0d0460ba2217a8278685f91a746edc592a202c21a3f`. They combine incorrect gauge timing with owner-model cabin thresholds, clearance bands or derived comparisons. The owner verified source files on Windows; those files have not been inspected here. Requested the files or accessible paths. Do not simply shift the curves, infer cabin water depth from Hunt stage, or invent recalculated clearance values.

Four core presentation holds and the separate Leo XIV timeline hold are resolved. Five changed articles retain other source concerns; fixing their graphics does not certify their unchanged surrounding claims. Current core status is 37 total holds, including two unchanged articles, not all-batch publication clearance.
