# Reported-essay source-link batch

Review date: September 27, 2026.

Status: **Combined release authorized September 27, 2026.** The owner explicitly instructed publication of all seven essays together and delegated the checks to GitHub. The review below records the prepared candidate; the associated GitHub Actions run and Pages deployment are the evidence of release success. This record does not replace those gates.

## Included editions

| Essay | Prepared edition | Local preview | Source record |
|---|---|---|---|
| The Warning Reached the Bridge | 2.0 / Second web edition | [Preview](http://localhost:1317/essays/the-warning-reached-the-bridge/) | [Reference checklist](99-refinement/the-warning-reached-the-bridge-source-checklist.md) |
| The Dolphin Company | 3.0 / Sixth web edition | [Preview](http://localhost:1317/essays/the-dolphin-company/) | [Checklist](99-refinement/the-dolphin-company-source-checklist.md) |
| The Map That Priced the Fire | 2.0 / Fourth web edition | [Preview](http://localhost:1317/essays/the-map-that-priced-the-fire/) | [Checklist](99-refinement/the-map-that-priced-the-fire-source-checklist.md) |
| How Tucson, AZ Plans for Water Scarcity | 2.0 / Fourth web edition | [Preview](http://localhost:1317/essays/how-tucson-az-plans-for-water-scarcity/) | [Checklist](99-refinement/how-tucson-az-plans-for-water-scarcity-source-checklist.md) |
| Uncrustables: The Billion-Dollar Peanut Butter Empire | 2.0 / Fifth web edition | [Preview](http://localhost:1317/essays/uncrustables-the-billion-dollar-peanut-butter-empire/) | [Checklist](99-refinement/uncrustables-the-billion-dollar-peanut-butter-empire-source-checklist.md) |
| The Easement Under the Lake | 2.0 / Third web edition | [Preview](http://localhost:1317/essays/the-easement-under-the-lake/) | [Checklist](99-refinement/the-easement-under-the-lake-source-checklist.md) |
| The Bolt Beside the Gas Tank | 2.0 / Second web edition | [Preview](http://localhost:1317/essays/the-bolt-beside-the-gas-tank/) | [Checklist](99-refinement/the-bolt-beside-the-gas-tank-source-checklist.md) |

The accepted reference carries its original September 26 revision entry. The other six entries are dated September 27. Original publication dates and timestamps, titles, routes, collections, featured status, and image assets remain unchanged. These are historical essays with disclosed source-related corrections, not current-status rewrites. Creative pieces, Cuauhtémoc, Camp Mystic, and the rest of the archive remain outside this batch.

## Method and substantive changes

The reference method is claim cluster → read source passage → precise inline link → evidence limit → dated revision record. Document links use page references where useful. Each essay has a companion source checklist and a current seven-part Editorial Philosophy Audit. Historical audits remain labeled as historical evidence, not fresh clearance.

- **Map:** exact Jacksonville atlas objects and a representative sheet, library directory evidence, archival interpretation, and environmental-review sources. Sheet counts do not measure construction or population. Removed the Corps report-specific example that could not be reverified; EPA guidance and the regulation support the narrower modern-use discussion.
- **Tucson:** dated the 82/12/6 portfolio to 2020, distinguished subsidence from sinkholes, clarified plan adoption and scenario language, and separated the 1922 Compact from Mexico's later allocation. Corrected the visible implementation-report label to *Inaugural Implementation Report 2023–2024*, December 2024. Its filename does not establish its reporting period. Updated the discovery description accordingly.
- **Uncrustables:** distinguished reported fiscal 2024 net sales from the fiscal 2026 billion-dollar target; linked the capital announcement and actual factory opening; attributed brand history and named sponsorship; removed unsupported shelf-stable speculation. Company accounts are not represented as independently audited findings.
- **Easement:** checked the actual decision and environmental review. Distinguished selecting an easement from executing its grant, tribal study offers from compulsory participation, and agency-modeled transport comparisons from guaranteed outcomes. Corrected the subtitle and discovery description as well as the body.
- **Bolt:** used the appellate opinion with its plaintiff-favorable review standard, corrected alternative-test speeds and management-evidence limits, and read the original Ford report scan. Corrected its printed benefit total to $49.5 million and identified the fleetwide rollover-rule purpose. The scan's issue date remains unresolved; the existing illustration's “1977 MEMO” label is qualified in its caption and body-image alt text.

The reference and Dolphin changes are detailed in their existing review reports; they were retained, not rewritten again during this five-essay pass.

## Consolidated local verification

- Independent focused source-pairing reviews covered the five remaining essays. The Tucson implementation-report label was corrected. No other important mismatch was identified within those reviews. For Tucson's decadal planning statement, the drafting reviewer supplied the final-plan page 3 director-letter passage; this is not represented as a second independent PDF read. The Bolt report scan was visually read by its source reviewer; the coordinating reviewer independently checked the opinion, recall packet, and modern mortality-risk source rather than repeating that image extraction.
- A consolidated source sanity check passed across all seven candidates: original metadata/collection/asset preservation, unchanged body-image destinations, well-formed captured source URLs, expected version-specific revision entries, absence of prohibited house-style phrases and internal retrieval/path artifacts, current checklist hashes, all seven current philosophy-audit rows, and diff whitespace. An initial check stopped on an incorrect assumption that the reference's revision date was September 27; the check was corrected to preserve its actual September 26 date. No essay date was changed to satisfy the check.
- The existing pinned Hugo preview rebuilt the five newly revised essays. Browser review confirmed their original publication dates, prepared versions and editions, citation blocks, visible revision notes, and representative rendered source destinations/page fragments. Representative text, artwork, link wrapping, and keyboard focus were visually reviewed within the existing layout. This was not a full responsive or accessibility certification. The reference and Dolphin preview checks from their prior passes were not repeated.
- No new test suite, Node/browser contract run, production build, commit, remote write, or deployment was performed. Temporary PDF working copies and renders used for the Easement review were removed; no source-document dumps were added to the repository.

## Release boundary

PowerShell is unavailable on this Mac. The required checks were pending at local handoff. The owner's subsequent publication instruction explicitly delegates validation to the existing GitHub workflow, whose changed-essay philosophy guardrail, contracts, production build, and output checks precede Pages deployment. Do not treat this editorial PASS or a historical production build as evidence that the release workflow succeeded; use the run and deployment associated with this commit. No check is disabled or bypassed.

Do not regenerate or represent existing downloadable PDFs as updated web editions. No templates, scripts, analytics, assets, collection membership, or infrastructure were changed by this batch.

## Publication follow-up

The first [GitHub publication run](https://github.com/LPeasy/outsideinprint/actions/runs/36297679376), for commit `05b5462b5a3935243964ff083ba1277506a6e321`, passed all seven philosophy audits but blocked deployment on five `medium_punctuation_artifact` lines in Tucson and Bolt. Build and deployment were skipped. The follow-up normalizes only those apostrophes, quotation marks, and the source-label date-range dash to ASCII and updates their source hashes. No factual wording, source URLs, image assets, or validation rules change. The prepared editions remain 2.0 because the blocked candidates never went live. Success must be established by the follow-up workflow, not inferred from this correction.

The [second run](https://github.com/LPeasy/outsideinprint/actions/runs/36298009685), for `b23d15e99cdccc510e7c35c6095813dfcd436f7c`, passed source contracts, changed-essay guardrails, and the production build. Its homepage output scenario failed because it hardcoded Dolphin's superseded version 2.0 / Fifth web edition. The existing scenario now expects the approved 3.0 / Sixth web edition and September 27 revision, retains the original-date and full-note checks, and checks that the September 17 correction record remains visible. No check is removed or disabled, and no further article change is made. A narrow read-only scan found no other stale edition or corrected-copy expectations in the remaining output/browser checks. Deployment was skipped; the next workflow must establish success.

## Reviewed essay SHA-256 values

These identify the reviewed source files, not deployment artifacts. Recheck only affected records if a candidate changes.

```text
10286dae6e8b3d42d2ebfb3a5be5f619296eae8937f11d8ffdda9b7ee301a266  the-warning-reached-the-bridge.md
6bb3777719a76544e0ae4d956b24f868a480e552e989557815545d66b87f6559  the-dolphin-company.md
f6e723b3b65ce73799057c8266d73c71dd15d073740cd913353f847bd8648c9d  the-map-that-priced-the-fire.md
13e74fb1ec9d24dce4503ce012c9fe4a1053b6645a0e9c8e178410d087df8d25  how-tucson-az-plans-for-water-scarcity.md
8c0e34ac3750845e45d9d4ec1e1dbb75533011fcf9bb12934e31d035023a9c9d  uncrustables-the-billion-dollar-peanut-butter-empire.md
6c7fd8bf7a8a5b70dc8a4b94ae6ffaa2bd989b09d41eb5d1200b96baa475f1d4  the-easement-under-the-lake.md
998a1bf9d951e828dc115f97bd4b3830407cbd99ebbd62c62367f066b9d549d0  the-bolt-beside-the-gas-tank.md
```
