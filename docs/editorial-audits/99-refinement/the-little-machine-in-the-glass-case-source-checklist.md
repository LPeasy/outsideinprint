# Source Checklist

Date: 2026-06-28  
Story: `The Little Machine in the Glass Case`  
Package: `output/evergreen_candidates/2026-06-28-the-little-machine-in-the-glass-case-flagship`  
Decision state: `FLAGSHIP_SOURCE_HARDENED`

## Source Hierarchy

1. Primary statutes and current official legal text.
2. Official USPTO records and agency history.
3. Museum/archive object records and collection histories.
4. Public-domain historical accounts and annual/public reports.
5. Secondary commentary only as search lead, not governing evidence.

## Used Sources

| Source | Type | URL | Used for | Status |
|---|---|---|---|---|
| Patent Act of 1790, 1 Stat. 109 | Public-domain statute | https://www.govinfo.gov/link/statute/1/109 | Original written specification plus draft/model filing path | Verified live; PDF downloaded locally |
| Patent Act of 1836 | Public-domain statute copy | https://patentlyo.com/media/docs/2008/03/Patent_Act_of_1836.pdf | Patent Office creation, examination rebuild, mandatory representable-model language | Verified live; PDF downloaded locally |
| Patent Act of 1870 | Public-domain statute copy | https://ipmall.info/sites/default/files/hosted_resources/lipa/patents/Patent_Act_of_1870.pdf | Public inspection galleries, rejected-model disposition, discretionary model language | Verified live; PDF downloaded locally |
| 35 U.S.C. 112 | Official U.S. Code | https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title35-section112&num=0&edition=prelim | Modern written-description, enablement, and claims burden | Verified live |
| 35 U.S.C. 114 | Official U.S. Code | https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title35-section114&num=0&edition=prelim | Current discretionary model/specimen authority | Verified live |
| USPTO, Milestones in U.S. Patenting | Official agency history | https://www.uspto.gov/patents/milestones | 1790 board, 1836 examination, 1840 museum, 1872 Official Gazette context | Verified live |
| USPTO, The Search for Lost X-patents | Official agency history | https://www.uspto.gov/blog/director/entry/the-search-for-lost-x | 1836 fire, X-patent reconstruction, unrecovered patent record | Verified by live browser; local PowerShell TLS failed |
| USPTO, Abraham Lincoln patent history | Official agency history | https://www.uspto.gov/learning-and-resources/journeys-innovation/abraham-lincoln | Lincoln 1849 patent/model example | Verified by live browser; local PowerShell TLS failed |
| Hagley Museum, American Patent Models | Museum/archive collection | https://www.hagley.org/patentmodels | Patent-model era, disposal history, Smithsonian transfer, auctions | Verified live |
| IP Mall, 1877 Patent Office fire account | Public historical source archive | https://ipmall.law.unh.edu/content/patent-history-materials-index-authentic-account-fire-september-24-1877-which-destroyed | 1877 fire, model-room/public-gallery storage risk, loss details | Verified live |
| Smithsonian/NMAH, Elias Howe patent model | Museum object record | https://americanhistory.si.edu/collections/object/nmah_630930 | Non-Lincoln sewing-machine model case study | Verified by live search/browser; local PowerShell received 403 |
| Smithsonian, Isaac Singer patent model | Museum object record | https://www.si.edu/object/1851-isaac-singers-sewing-machine-patent-model%3Anmah_1071133 | Non-Lincoln sewing-machine model case study | Verified by live search/browser; local PowerShell received 403 |
| Smithsonian/Google Arts, Margaret Knight paper-bag machine model | Museum object record | https://artsandculture.google.com/asset/patent-model-for-paper-bag-machine-margaret-e-knight/WwFpF6Xz9ZegCw?hl=en | Everyday-material patent-model case study | Verified live |

## Hardening Decisions

- The draft states the statutory path carefully: 1790 model/draft filing; 1836 mandatory models in representable cases; 1870 discretionary model authority; current discretionary model authority in 35 U.S.C. 114.
- The draft uses Hagley for the conventional 1790-1880 routine-model era endpoint because the USPTO FY1880 PDF failed over local TLS.
- The draft avoids an unsourced exact 1880 order number or annual-report quotation.
- The 1836 fire figures come from USPTO; the 1877 figures come from the preserved contemporary account and are not merged into one all-time loss estimate.
- Howe, Singer, Knight, and Lincoln appear as case studies of the system, not as hero profiles.

## Sought But Limited

- USPTO FY1880 annual report PDF: local TLS failed, so no direct annual-report language was used for the 1880 endpoint.
- Clean official National Archives page for both fires: not needed after USPTO and IP Mall source trail was sufficient.
- Full Commissioner annual-report series on model-room crowding: public copies exist in scattered archives, but the flagship can stand on the 1870 public-gallery statute, the 1877 fire account, and Hagley disposal history.

## Source Risk

Low to moderate. Core legal and institutional claims are backed by statute, current U.S. Code, USPTO records, and museum/archive sources. Residual risk sits mainly in the conventional 1880 endpoint and exact administrative mechanism, which the story treats cautiously.

## Quarantined Claims

- "Patent models prove inventions work" was rejected; models can clarify and mislead.
- "Modern paper patents are weaker than models" was rejected; written disclosure can explain technologies models cannot show.
- "Patents are simply pro-innovation" was rejected; the essay treats patents as a bargain with exclusion costs.
- "The Patent Office model room was only a museum" was rejected; it was a legal archive, examination aid, display space, and storage burden.
