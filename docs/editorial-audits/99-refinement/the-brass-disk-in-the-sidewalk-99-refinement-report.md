# OIP-99 Refinement Report

Candidate: `The Brass Disk in the Sidewalk` flagship
Date: `2026-06-23`
Reviewer: `Codex / OIP-99-Edit local protocol`
Decision state: `99_READY`
Current score: `97/100`
Final recommendation: `Ready for human review as a flagship evergreen OIP draft.`

## Pass 1 Assessment

Current score: `95/100`
Primary strength: The draft expands the original object-to-system essay with concrete public-record examples: live NGS datasheet count, Florida state-plane statute, NGS/FEMA floodplain pilot, SPCS2022 policy, and Jacksonville/NGS benchmark DI0245.
Primary weakness: The source material is technical and could overburden a general reader if allowed to turn into a manual.
Highest-value addition: Added the Jacksonville technical memorandum and NGS DI0245 datasheet as a local public-record example.
Highest-value removal: Removed temptation to treat datum modernization as proof of direct property harm.
Highest-value line edit: Kept the modernization section framed as old-record translation rather than technology triumph.
Source risk: `LOW`
Image risk: `LOW`
Decision state: `99_READY`

## Decision

`99_READY`

The flagship draft satisfies the expansion objective: 5,000-7,000 word longform essay, source-hardened, primary/public-record driven, and aligned with the OIP object-to-system model. It does not overwrite the original evergreen package, does not publish, does not commit, and does not open a PR.

## Line-By-Line Edit Matrix

| Location | Current Text | Issue Type | Severity | Recommended Edit | Rationale | Source / Verification Need |
|---|---|---|---|---|---|---|
| The Disk Underfoot | `798,914 datasheet features` | Unsupported certainty risk | Low | Keep with caveat already present. | The story labels it as live feature-service count, not total historical marks. | NGS feature-service query. |
| The Datum Beneath The Deed | Florida statute paragraph | Source-label problem | Low | Keep. | Direct state statute gives legal example of geodetic control entering land descriptions. | Florida Statutes 177.151. |
| The Flood Map In A New Frame | `This does not prove that every property moves into or out of risk.` | Assumption quarantine | Low | Keep. | Prevents overclaiming from the NGS/FEMA pilot. | NGS/FEMA pilot report. |
| Old Records In A New Frame | Jacksonville memo paragraph | Public-record example | Low | Keep. | Strong concrete evidence connecting local project, NAVD 88, NGS PID, and physical mark. | Jacksonville technical memorandum and NGS DI0245 datasheet. |

## Editorial Philosophy Audit

Decision: PASS

- Evidence: PASS. Major claims are tied to NOAA/NGS, USGS, GovInfo/Federal Register, U.S. Code, FGDC, Florida Statutes, City of Jacksonville, and NGS datasheet sources.
- Logic: PASS. The essay moves from physical mark to public coordinates, datums, modernization, flood maps, state-plane law, local project records, and public cost without a slogan doing the work.
- Incentives: PASS. The draft identifies why NOAA modernizes, why surveyors preserve continuity, why states must update laws/practice, why local reviewers need metadata, and why users need stable public records.
- Tradeoffs: PASS. The draft names accuracy, public confusion, conversion burden, old-record custody, state/local uptake, flood-map clarity, and training/metadata costs.
- Consequences: PASS. The draft traces downstream effects in deeds, flood maps, construction plans, GIS layers, local review, insurance/permitting context, and public trust.
- Uncertainty: PASS. The draft avoids claiming that modernized NSRS is already official, avoids direct property-harm claims, and identifies current-status recheck needs.
- Institutional Behavior: PASS. The draft names NOAA/NGS, FGCS/FGDC, FEMA, USGS, states, local governments, surveyors, engineers, GIS offices, builders, property owners, and public users as actors with duties and risks.

## Media Framing Audit

Decision: PASS

- Media Frame Identified: PASS. The report identifies surveyor nostalgia, GPS triumphalism, agency modernization self-confidence, local-resistance stereotypes, and anti-bureaucratic dismissal as frames to reject.
- Primary Source Rebuild: PASS. The essay is rebuilt from official, statutory, public-record, and direct data-service sources wherever reasonably available.
- Assumption Quarantine: PASS. The draft does not assume passive marks are purer, GNSS is automatically superior, modernization is harmless, local caution is irrational, or every datum shift causes concrete harm.
- Source Hierarchy: PASS. Public records and official sources carry the argument; secondary or trade framing is not used as governing support.
- Ideological Burden: PASS. The essay argues through evidence, mechanism, incentives, tradeoffs, consequences, uncertainty, and public responsibility rather than agency loyalty, anti-agency suspicion, technology enthusiasm, or nostalgia.

## Source Risk

`LOW`

The named source gaps are closed. Publication should refresh NGS status and feature-service count because the 2026 rollout/testing period is active.

## Image Risk

`LOW`

The three existing editorial images remain conceptually distinct and serve the expanded essay: physical mark, public records desk, and GNSS/grid overlay. No fourth image was generated.

## Image Decisions

- Hero: `KEEP`. The brass sidewalk disk carries the central metaphor.
- Image 1: `KEEP`. The public records desk adds custody/labor and does not repeat the hero.
- Image 2: `KEEP`. The GNSS/grid overlay carries the modernization register.

## Metadata Pass

- Title: `The Brass Disk in the Sidewalk`
- Slug: `the-brass-disk-in-the-sidewalk`
- Date: `2026-06-23`
- Tags: `geodesy`, `maps`, `public records`, `infrastructure`, `civic systems`, `surveying`, `flood risk`
- Excerpt: `A small brass disk in concrete shows how public coordinates hold roads, deeds, bridges, flood maps, GPS, and civic trust in the same frame.`

## Echo-Matters Gate

PASS. No weak `That is why X. X matters.` or related echo-matters scaffold remains in the story body.

## Final Recommendation

`99_READY`. Proceed to human review. Do not publish, commit, push, or open a PR unless explicitly instructed.

## 2026-07-09 AI-Screening Remediation Note

Version reviewed: `1.1`

Scope: live-site AI-screening cleanup of the medium-severity certainty-wording hit in body prose. The revision replaced `clearly names its coordinate system` with `names its coordinate system` while preserving thesis, sourcing, and publication status.

Validation: `ai_tell_scan.py --body-only --format json` returned `0` high/medium body-prose hits after revision. One low-severity repeated-cadence hit remains out of scope.

Editorial philosophy status: PASS remains in force. The cleanup did not alter evidence, logic, incentives, tradeoffs, consequences, uncertainty, or institutional-behavior analysis. The user explicitly instructed publication after successful gates for this July 9 cleanup.
