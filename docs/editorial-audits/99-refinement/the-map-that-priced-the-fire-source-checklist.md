# Source Checklist

## Claim-Level Source Pass: September 27, 2026

Reviewed revision: **2.0, Fourth web edition**. Original publication date and release timestamp remain June 20, 2026. This bounded pass follows the accepted *The Warning Reached the Bridge* method; it is not a new map survey or environmental assessment.

Baseline essay SHA-256: `5bf6407eb0f746374d14b42f1080b60c5c408aabe1b449143eb9b49e2f0cfdc9`.

Revised essay SHA-256: `f6e723b3b65ce73799057c8266d73c71dd15d073740cd913353f847bd8648c9d`.

The passages below were read on September 27, 2026. PASS means support for the specified claim, not blanket certification of every possible use of these sources.

| Claim cluster | Exact record and read location | Result, role, and limits |
|---|---|---|
| Opening atlas metadata | [LOC 1903 Jacksonville item](https://www.loc.gov/item/sanborn01286_005/), `Created / Published` and `Notes`; item JSON read directly from LOC | PASS. 1903, 78 sheets, six skeleton maps, bound. Metadata describes this atlas, not the general Sanborn collection. |
| Building-level detail in the opening | [1903 atlas, sequence image 13](https://www.loc.gov/resource/g3934jm.g3934jm_g012861903/?sp=13), printed sheet 7 / digital file `01286_1903-0007` | PASS. The actual sheet was visually inspected: Main, Ocean, Newnan, Bay, Forsyth, and Adams streets; colored footprints, story/use annotations, City Hall, stores, laundry, warehouses, and water-line markings. Sequence 13, not sequence 7, displays printed sheet 7. This is a representative sheet, not a claim that every feature appears on every plate. |
| Jacksonville atlas sequence | [1897 item](https://www.loc.gov/item/sanborn01286_004/), [1903 item](https://www.loc.gov/item/sanborn01286_005/), [1913 item](https://www.loc.gov/item/sanborn01286_006/), each item's `Notes` field read through LOC JSON | PASS. 47 sheets; 78 and six skeleton maps; 1913 **volume 1** has 128 sheets, congested-district map, eight skeleton maps. Revised text says a larger map set, not measured density, construction, population, or identical coverage. |
| Fire origin, extent, casualties, martial law, rebuilding | [Florida Memory, Great Jacksonville Fire of 1901](https://floridamemory.com/learn/exhibits/photo_exhibits/jacksonvillefire/), introduction paragraphs 1–5 | PASS. Official state archival interpretation explicitly supports May 3, moss/mattress-factory origin, Davis/Beaver, 8:30 p.m., 2,368 buildings, 10,000 homeless, seven dead, 146 blocks, Jennings, May 17, and decade of rebuilding. Read the indexed full introduction after direct-fetch failures; this is not a contemporary incident report. |
| 1904 directory size, rights, name count, fire stations, banks, architect | [Jacksonville Public Library directory](https://jaxpubliclibrary.contentdm.oclc.org/digital/compoundobject/collection/p16025coll10/id/3309). Library API `/digital/api/singleitem/collection/p16025coll10/id/3309`: 684 child pages, rights `No copyright - United States`. Child `2635`: Prefatory; `2644`: printed p.20; `2646`: printed p.22; `3243`: printed p.611 | PASS. Library-hosted OCR was read for 17,784 names, five stations/alarm boxes, bank corners, and H. J. Klutho at 108 W. Forsyth. The count is names in the directory, not a census population count. Bank locations are in the civic listing; no recovery rate is inferred from them. The directory's own boosterism is not adopted as evidence. |
| Collection scale, insurer purpose, 1835 losses, Sanborn history | [LOC Introduction to the Collection](https://www.loc.gov/collections/sanborn-maps/articles-and-essays/introduction-to-the-collection/), opening inventory and historical narrative | PASS. Read full indexed text. The 12,000 places / 50,000 editions / 700,000 sheets are the collection essay's approximate historical description, not a newly measured digitization total. More than $20m 1835 losses and smaller-insurer failure are attributed to that institutional history. Sanborn is called a surveyor; an unsupported civil-engineer label was removed. |
| 1905 manual and working method | Same LOC introduction, paragraphs beginning `To ensure uniform standards` and `Maps were drawn` | PASS. Manual date, purpose, and later editions are explicit. LOC quotes the instruction to use courthouse/real-estate records or measure with a tape when records are not readily obtainable. Revised text uses this identifiable passage rather than unnamed institutional guides. |
| Colors, keys, industry-selected evidence, corrections | [LOC About this Collection](https://www.loc.gov/collections/sanborn-maps/about-this-collection/), `Sanborn Keys & Colors`, `Sanborn Keys, Legends, and Symbol Sheets`, correction-slip discussion; [LOC interpretation guide](https://guides.loc.gov/fire-insurance-maps/sanborn-interpreting), opening | PASS. Read indexed full institutional text. Colors and symbols require the relevant edition's key; changing coverage and correction dates limit comparisons. No new universal color key is invented. |
| Coney Island sequence | [LOC Sanborn Time Series](https://www.loc.gov/collections/sanborn-maps/articles-and-essays/sanborn-time-series/), `Coney Island, 1895`, `1906`, `1930` | PASS as the Library's interpretation. Specific edition commentary supports wood construction, change in amusements, Dreamland fire and later park/arcade use. LOC explicitly says these interpretations illustrate a method rather than settle the history. No new independent plate-by-plate survey is claimed. |
| AAI purpose, grant assessments, suggested report contents | [EPA Brownfields All Appropriate Inquiries](https://www.epa.gov/brownfields/brownfields-all-appropriate-inquiries), opening, required activities, and `Format for Reporting the Results`, especially `Records Review` | PASS. EPA requires grant-funded Phase I assessments to comply with AAI; its example reporting format is expressly **not** a regulatory requirement. Revised text distinguishes the two. Historical records are one part of a process that also includes interviews, government records and inspection. |
| Historical-record review and professional judgment | [40 CFR §312.24, 2025 edition](https://www.govinfo.gov/content/pkg/CFR-2025-title40-vol30/pdf/CFR-2025-title40-vol30-sec312-24.pdf), printed p.414, paragraphs (a)–(b) | PASS. Official annual CFR text read. Historical records must be reviewed to meet the inquiry's objectives; listed possible records include fire insurance maps. Professional judgment applies to how far back the search must extend. This is not a claim that a Sanborn map alone confers a liability defense or rules out contamination. |
| Public checklist provenance | LOC `About this Collection`, opening; LOC introduction, Walter W. Ristow attribution | PASS. The public checklist derives from the 1981 publication. Bibliographic/archival work is distinguished from the essay's interpretation of civic value. |

### Removed Example and Access Limits

- The earlier Upper St. Anthony Falls Corps example cannot be represented as freshly verified. Its existing December 2020 PDF returned an Akamai 403; a newer official Appendix E appeared in search with a Sanborn contents heading but returned 404. The full relevant section was not read this time.
- With editorial approval, version 2.0 removes the report-specific year list, the claim that it found no unusual Sanborn entries, and the old public source-list link. EPA and §312.24 now support the narrower modern-use discussion. Lack of a mapped warning is expressly not proof of no contamination.
- Several LOC and Florida Memory normal page requests were blocked to the research browser. The cited institutional texts were read through indexed full-text results, and the three exact LOC item metadata records were independently read through LOC's public JSON interface. No HTTP-success-only check substitutes for a passage check.
- Directory verification used library-hosted OCR and metadata, not a new visual review of all 684 pages. The source identity, child IDs and printed pages above make the checked passages reproducible.

### Analysis and Delivery Boundary

The claims about memory, incentives, omission and civic use are the author's analysis. Hypothetical laundries, garages, tenants and property disputes are not newly discovered facts about Jacksonville. Original title, date, slug, collection, image assets, and central argument are preserved. The whole-number version bump reflects the narrowed factual prose, not merely link styling. No builds, PowerShell checks, Node/browser suites, publication, or remote writes were performed by this source pass; the coordinating task owns consolidated preview and validation.

## Historical June 20, 2026 Checklist

The record below is retained as history. Its PASS labels describe that earlier package and do not override the corrections and access limits above.

Package: `2026-06-20-the-map-that-priced-the-fire-flagship`
Title: `The Map That Priced the Fire`
Date: `2026-06-20`

## Core Sources

| Claim area | Source | Status | Notes |
|---|---|---:|---|
| Sanborn collection scope, purpose, major details shown on maps, 1835 New York fire context, Daniel A. Sanborn history, 1905 Surveyors' Manual | Library of Congress, `Introduction to the Collection` | PASS | Primary institutional collection essay. Used for collection scale, insurance purpose, map details, and manual existence. |
| Keys, legends, symbol sheets, industry-driven selection of information, correction practices | Library of Congress, `About this Collection` and LOC fire-insurance map guides | PASS | Primary institutional guidance. Used for color/symbol caveats and interpretation cautions. |
| Jacksonville 1897, 1903, 1913 sequence | Library of Congress Jacksonville item pages and resource pages | PASS | Verified 1897 47 sheets, 1903 78 sheets and 6 skeleton maps, 1913 volume details via LOC item listings. |
| Jacksonville 1904 address, business, and civic companion source | Jacksonville Public Library Florida Collection, `Polk's Jacksonville City Directory 1904` | PASS | 684-page local directory with `No copyright - United States` rights statement. Used for 17,784-name count, fire department/alarm-box listings, Bay Street bank locations, and H. J. Klutho architect listing at 108 W. Forsyth. |
| Great Jacksonville Fire facts | Florida Memory, `Great Jacksonville Fire of 1901` | PASS | Official State Library and Archives of Florida public-history source. Used for May 3, 1901 origin, Davis and Beaver, 2,368 buildings, 10,000 homeless, seven dead, 146 blocks, martial law, rebuilding. |
| Coney Island time-series case | Library of Congress, `Sanborn Time Series` | PASS | Primary institutional collection essay. Used for 1895, 1906, 1930 comparison, Dreamland, 1911 fire, Seaside Park. |
| All Appropriate Inquiries and modern environmental due diligence | EPA, `Brownfields All Appropriate Inquiries`; eCFR, `40 CFR Part 312` | PASS | Official federal sources. Used for AAI framing and historical-source review context. |
| Non-vendor Phase I ESA example using Sanborn maps | U.S. Army Corps of Engineers, `Phase I Environmental Site Assessment Report, Upper St. Anthony Falls Disposition` | PASS | Public federal report. Used for the report's review of fire insurance maps and finding of no unusual Sanborn entries. |
| Public-domain key image candidate | Library of Congress Sanborn key image | PASS | Available as a possible publishing reference image. Not embedded in final package to preserve the three-image rule. |
| Surveyor practice supplemental support | University of Virginia library guide and public scan of Sanborn Surveyors' Manual | PASS WITH CAUTION | Used only as background support. Story relies mainly on LOC for manual existence and purpose. |
| Bibliographic frame | LOC/HathiTrust/NJ State Library records for `Fire Insurance Maps in the Library of Congress` | PASS | Used for checklist/public-collection context, not for unsupported claims. |

## Source Links

- Library of Congress, Introduction to the Collection: https://www.loc.gov/collections/sanborn-maps/articles-and-essays/introduction-to-the-collection/
- Library of Congress, About this Collection: https://www.loc.gov/collections/sanborn-maps/about-this-collection/
- Library of Congress, Sanborn Time Series: https://www.loc.gov/collections/sanborn-maps/articles-and-essays/sanborn-time-series/
- Library of Congress, Jacksonville 1897 item: https://www.loc.gov/item/sanborn01286_004/
- Library of Congress, Jacksonville 1903 resource: https://www.loc.gov/resource/g3934jm.g3934jm_g012861903/
- Library of Congress, Jacksonville 1913 resource: https://www.loc.gov/resource/g3934jm.g3934jm_g01286191301/
- Jacksonville Public Library, `Polk's Jacksonville City Directory 1904`: https://jaxpubliclibrary.contentdm.oclc.org/digital/compoundobject/collection/p16025coll10/id/3309
- Florida Memory, Great Jacksonville Fire of 1901: https://www.floridamemory.com/learn/exhibits/photo_exhibits/jacksonvillefire/
- EPA, Brownfields All Appropriate Inquiries: https://www.epa.gov/brownfields/brownfields-all-appropriate-inquiries
- eCFR, 40 CFR Part 312: https://www.ecfr.gov/current/title-40/chapter-I/subchapter-J/part-312
- U.S. Army Corps of Engineers Phase I ESA PDF: https://www.mvp.usace.army.mil/Portals/57/docs/Civil%20Works/Projects/MplsLocksDisposition/2020_DraftTSP_PublicNotice/Appendix_E_HTRW_Phase1_Report_USAFDisposition_Dec2020.pdf
- HathiTrust record, `Fire insurance maps in the Library of Congress`: https://catalog.hathitrust.org/Record/000129587
- LOC public-domain Sanborn key image: https://www.loc.gov/static/collections/sanborn-maps/images/sankey2.gif

## Verification Notes

- `Jacksonville 1897/1903/1913`: verified through LOC item/resource pages and LOC related-item listings. The story avoids claiming the three volumes cover identical areas.
- `Jacksonville 1904 city directory`: verified through Jacksonville Public Library CONTENTdm item metadata and OCR text. Used as a near-contemporary address/business/civic companion source, not as proof of economic recovery by itself.
- `Great Fire casualty/building/block numbers`: anchored to Florida Memory. No local newspaper-derived variation is used in the body.
- `Surveyor manual`: LOC verifies the 1905 company manual's existence and purpose. The story avoids quoting private scans or relying on a vendor-hosted manual as the main authority.
- `Environmental example`: USACE report is used because it is a public federal report and does not market a commercial due-diligence product.
- `Public-domain imagery`: LOC Sanborn material is public-domain/free-to-use where indicated by LOC. No LOC image was added to the package because the automation required exactly three final editorial images.

## Claim Boundaries

- The essay treats Sanborn maps as disciplined evidence, not complete civic truth.
- Social claims about race, labor, power, and displacement are framed as source limits and interpretive needs, not as direct map findings.
- The Jacksonville reconstruction argument is tied to the LOC edition sequence and Florida Memory fire chronology, with no unsupported claim that sheet count alone proves population, value, or construction volume.
- The environmental due-diligence section treats Sanborn maps as one historical source in a process, not a standalone liability determination.

## Source-Hardening Decision

PASS. The flagship expansion closes the requested gaps with live primary, official, archival, or public institutional sources. The revision adds the Jacksonville Public Library 1904 Polk city directory as the local companion source requested by rubric review. Remaining publication work should involve a human image-rights pass if any LOC map/key image is embedded later.
