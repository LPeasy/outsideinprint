# OIP-99 Refinement Report

Package: `2026-05-26-the-examiners-red-pencil`
Title: `The Examiner's Red Pencil`
Workflow: `oip_daily_candidate_99_refinement`
Decision State: `99_READY`
Current Score: `94/100`
Source Risk: `LOW-MEDIUM`
Image Risk: `LOW`
Final Recommendation: `Proceed as a daily candidate for human review.`

## Decision

`99_READY`

The essay is publication-candidate ready because it rebuilds the Reuters lead from Federal Reserve, FFIEC, Federal Register, and post-SVB public records; it identifies the lobbying frame as a lead rather than the governing story; and it turns the technical dispute over MRAs into an OIP object-to-system essay about public-risk timing, bank privilege, and examiner judgment.

## Required Changes Applied

- Reframed the story away from a bank-lobbying win/loss frame and toward the civic instrument: the Matter Requiring Attention.
- Added source hierarchy language in the essay and source checklist.
- Balanced bank complaints about shadow law against public-risk concerns tied to bank privilege and the federal safety net.
- Tied the current policy shift to April 2026 Fed supervisory operating principles, May 2026 CAMELS comment process, June 2025 reputation-risk removal, February 2026 debanking proposal, March 2026 capital-rule dissent, and the Fed's 2023 Silicon Valley Bank review.
- Removed formulaic AI-style contrast turns and echo-matters phrasing.

## Editorial Philosophy Audit

Decision: PASS

- Evidence: PASS ~ Major factual claims are linked to Reuters as attributed current reporting and to Federal Reserve, FFIEC, Federal Register, and Fed SVB review records.
- Logic: PASS ~ The argument follows the mechanism: examiner warning letter, supervisory threshold, rating translation, bank incentive, public-risk transfer.
- Incentives: PASS ~ The essay identifies bank incentives to reduce supervisory discretion and regulator incentives to preserve early-warning authority.
- Tradeoffs: PASS ~ The essay names arbitrary informal supervision, delayed correction, public guarantees, and private bank autonomy.
- Consequences: PASS ~ The essay traces consequences for management behavior, supervisory force, capital/rating signals, and public rescue exposure.
- Uncertainty: PASS ~ Anonymous Reuters claims are not treated as proven policy outcomes; the essay identifies the public record that can be verified.
- Institutional Behavior: PASS ~ Banks, Fed supervisors, agency leadership, examiners, directors, and the public safety net are each assigned their institutional role.

## Media Framing Audit

Decision: PASS

- Media Frame Identified: PASS ~ Reuters frames the event as Wall Street banks pushing a friendlier Fed to future-proof supervisory changes.
- Primary Source Rebuild: PASS ~ The essay rebuilds from the Fed supervisory operating principles, FFIEC CAMELS notice, Federal Register proposal, Fed reputation-risk releases, capital-rule records, Barr dissent, and the SVB review.
- Assumption Quarantine: PASS ~ The draft does not assume banks are villains, supervisors are neutral experts, or deregulation is either inherently good or inherently reckless.
- Source Hierarchy: PASS ~ Reuters is used as an attributed lead; official and agency sources are treated as institutional records and claims; Fed post-failure review supplies retrospective evidence.
- Ideological Burden: PASS ~ The essay avoids access-first, enforcement-first, market-first, anti-bank, and anti-regulator premises as defaults.

## Source Notes

Reuters is useful for the current event and stakeholder pressure but relies on anonymous sources for bank lobbying details. The publication candidate therefore rests its argument on public documents that show the supervisory shift independent of private lobbying claims.

The largest residual source risk is timing: the FFIEC/CAMELS process is open for comment and may change. The essay handles that as a current public process, not as a settled final rule.

## Structural Notes

The strongest OIP fit is the concrete object: an MRA as a red-pencil mark inside a private examination process. That object opens into a durable public question about when private bank risk becomes public obligation.

## AI-Tell Gate

The final prose was cleaned after a live search for current AI-writing tells and after the required `rg` scan bundle. Final audit result: `0 unresolved AI-tell audit hits in body prose`.

## Image Notes

Hero and supporting visuals should avoid bank logos and readable text. Use editorial illustration, bank-exam objects, vault geometry, gauges, public safety net imagery, and controlled green/red accents only as concept signals.

## 2026-07-09 AI-Screening Remediation Note

Version reviewed: `1.2`

Scope: live-site AI-screening cleanup of the high-severity meta-test framing hit in body prose. The revision replaced the `The test is...` sentence with direct criteria for useful bank rules while preserving thesis, sourcing, and publication status.

Validation: `ai_tell_scan.py --body-only --format json` returned `0` high/medium body-prose hits after revision. One low-severity repeated-cadence hit remains out of scope.

Editorial philosophy status: PASS remains in force. The cleanup did not alter evidence, logic, incentives, tradeoffs, consequences, uncertainty, or institutional-behavior analysis.
