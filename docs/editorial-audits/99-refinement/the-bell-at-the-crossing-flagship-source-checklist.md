# Source Checklist

Title: The Bell at the Crossing

Date: 2026-06-04

Package: `output/evergreen_candidates/2026-06-02-the-bell-at-the-crossing-flagship/`

## Core Sources

| Claim area | Source | Type | Use in essay | Risk |
| --- | --- | --- | --- | --- |
| National crossing inventory counts | FRA / USDOT Crossing Inventory: https://data.transportation.gov/Railroads/Crossing-Inventory/m2f8-22s6/about_data | Official public dataset | Live June 4, 2026 query returned 203,382 published, open, at-grade crossing records; crossing-purpose breakdown used in the opening section | Low |
| 2025 crossing incident, fatality, injury, warning-device, and highway-user aggregates | FRA / USDOT Highway-Rail Grade Crossing Accident Data: https://data.transportation.gov/Railroads/Highway-Rail-Grade-Crossing-Accident-Data/7wn6-i5b9/about_data | Official public dataset | National risk scale and warning-device caution; 2025 query returned 2,272 incidents, 314 deaths, 755 injuries | Low |
| Crossbuck, Part 8, Diagnostic Team, joint-use right-of-way, passive/active traffic control | FHWA MUTCD 11th Edition with Revision 1: https://mutcd.fhwa.dot.gov/kno_11th_Editionr1.htm and Part 8 PDF: https://mutcd.fhwa.dot.gov/pdfs/11th_Edition/part8.pdf | Official FHWA standards document | Crossbuck standard, national traffic-control vocabulary, joint-use framing, passive crossing assembly | Low |
| MUTCD material history and railroad-crossing shape standardization | FHWA MUTCD History: https://mutcd.fhwa.dot.gov/kno-history.htm | Official FHWA historical page | Early 1920s sign-shape standardization, railroad-crossing danger rationale, 1935 first MUTCD, and 1978 addition of highway-rail grade crossing parts | Low |
| Grade crossing signal safety, emergency notification signs, state action plans | eCFR 49 CFR Part 234: https://www.ecfr.gov/current/title-49/subtitle-B/chapter-II/part-234 | Federal regulation | ENS sign requirements, reporting/inventory rules, Part 234 signal framework, state action plan rule | Low |
| Emergency Notification Systems final rule | Federal Register final rule: https://www.federalregister.gov/documents/2012/06/12/2012-14168/emergency-notification-systems-for-telephonic-reporting-of-unsafe-conditions-at-highway-rail-grade | Federal rulemaking record | Adoption logic for telephone reporting of unsafe crossing conditions and crossing ID signs | Low |
| Section 130 funding and current fiscal-year language | FHWA Railway-Highway Crossings Program Overview: https://highways.dot.gov/safety/hsip/xings/railway-highway-crossing-program-overview | Official program page | Current funding context; IIJA $245 million annual set-aside for FY2022-FY2026; 100 percent federal share language | Low |
| Section 130 policy and state survey requirement | FHWA Policy and Guidance: https://highways.dot.gov/safety/hsip/xings/policy-and-guidance | Official program guidance | State survey, project schedule, crossing inventory update, warning device and project eligibility context | Low |
| Arizona crossing prioritization method | Arizona State Highway-Rail Grade Crossing Action Plan, February 2022: `source-downloads/arizona-state-highway-rail-grade-crossing-action-plan.pdf` and https://azdot.gov/sites/default/files/media/2022/02/state-highway-rail-grade-crossing-final-report.pdf | Official state action plan PDF | Arizona's 698 active/open public crossings, passive/active counts, modified FRA risk method, geometry/sight-distance refinements, treatment list | Low |
| Texas multiple-collision method | Texas Highway-Rail Grade Crossing Safety Action Plan, August 2011: `source-downloads/texas-highway-rail-grade-crossing-safety-action-plan.pdf` and https://ftp.txdot.gov/pub/txdot-info/rail/crossings/action_plan.pdf | Official state action plan PDF | Texas multiple-collision emphasis, 2003-2007 collision analysis, adjacent intersection/preemption patterns, closure and prioritization strategy | Moderate-low; retrieved with local TLS verification disabled due host certificate-chain issue |
| Missouri action plan method | Missouri Highway-Rail Grade Crossing State Action Plan, January 2022: `source-downloads/missouri-highway-rail-grade-crossing-state-action-plan.pdf` and https://www.modot.org/sites/default/files/documents/MoDOTSAP_01102022_FinalDraft_Website.pdf | Official state action plan PDF | Missouri incident review, multiple incident locations, passenger corridors, blocked-crossing reports, closure and grade-separation priority strategies | Low |
| MoDOT passenger corridor public plan and meeting record | MoDOT Missouri Railroad Safety Crossing Plan: https://www.modot.org/missouri-railroad-safety-crossing-plan and Southwest Chief/BNSF Marceline public report: `source-downloads/modot-southwest-chief-bnsf-marceline-public-report.pdf` / https://www.modot.org/media/44018 | Official state project page and public report PDF | Local corridor case, 48 passive crossings targeted, $50 million state funding, public meetings, Tier I upgrades/closures/passive enhancements, implementation risks | Low |
| Mendon accident case | NTSB Railroad Investigation Report RIR-23-09: `source-downloads/ntsb-rir-23-09-mendon.pdf` and https://www.ntsb.gov/investigations/AccidentReports/Reports/RIR2309.pdf | Official accident investigation report | Bounded case study: Crossing 005284Y, Porche Prairie Avenue, passive crossing, collision facts, geometry, grade, probable cause, postcollision closures and public meeting | Low |

## Live Dataset Query Notes

Crossing Inventory query refreshed during publication-time check:

```text
select count(*) as total where crossingposition='At Grade' and crossingclosed='No' and reportstatus='Published'
```

Result:

```text
total: 203382
```

Crossing purpose query:

```text
select crossingpurpose, count(*) as total where crossingposition='At Grade' and crossingclosed='No' and reportstatus='Published' group by crossingpurpose order by total desc
```

Result:

```text
Highway: 199991
Pathway,Ped.: 2724
Station,Ped.: 667
```

Highway-Rail Grade Crossing Accident Data query:

```text
select count(*) as incidents, sum(totalkilledform57) as killed, sum(totalinjuredform57) as injured where year='2025'
```

Result:

```text
incidents: 2272
killed: 314
injured: 755
```

Warning-device query:

```text
select crossingwarningexpanded1, count(*) as incidents where year='2025' group by crossingwarningexpanded1 order by incidents desc limit 10
```

Top result values used with caution:

```text
Gates: 1155
Stop signs: 406
Crossbucks: 383
```

## Source Gaps Closed

- State crossing action plans: Arizona, Texas, and Missouri reviewed and compared.
- Accident case: NTSB RIR-23-09 Mendon reviewed and used as bounded case study.
- Local public meeting / closure / corridor tradeoff: MoDOT Missouri Railroad Safety Crossing Plan and Southwest Chief/BNSF Marceline public report reviewed.
- Crossbuck standardization / sign rule context: FHWA MUTCD history and MUTCD Part 8 reviewed.
- Emergency notification sign adoption: 2012 Federal Register final rule and Part 234 reviewed.
- Section 130 current status: FHWA current page checked on June 4, 2026; current language covers FY2022-FY2026, so no post-FY2026 claim was made.

## Sources Sought But Not Fully Closed

- Local Chariton County meeting minutes for the April 2023 public meeting were not separately located. The NTSB report and MoDOT public materials document the meeting, closure, and corridor plan sufficiently for this draft.
- Railroad maintenance records for Crossing 005284Y were not located and were not needed for the argument because the NTSB report does not make maintenance failure the case mechanism.
- A fuller archival account of crossbuck manufacturing, railroad-industry sign practice, and pre-MUTCD adoption history remains optional; current claims are supported by FHWA MUTCD history and Part 8.

## Source Hierarchy Applied

Official datasets, federal regulations, official standards and history pages, state action plans, official project pages, and NTSB reports govern the draft. Secondary reporting was not used as evidentiary support.
