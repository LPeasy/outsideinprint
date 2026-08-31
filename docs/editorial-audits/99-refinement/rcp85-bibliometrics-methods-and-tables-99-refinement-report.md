# OIP-99 Refinement Report

Package: `rcp85-bibliometrics-methods-and-tables`

Decision state: `99_READY`

## Decision

`99_READY`

The public working paper states the query scope, deduplication order, deterministic screening rules, incomplete review status, source limitations, permitted uses, prohibited uses, and download inventory. It removes copied abstract text and private filesystem paths from public data while retaining fields needed to audit the automated output. `99_READY` applies to publication of the transparency record, not to evidentiary use of the provisional category totals.

## Editorial Philosophy Audit

Decision: PASS

- Evidence: PASS ~ The paper is derived from the published query log, deduplication map, sanitized record table, deterministic classification table, aggregate summary, and the source package's pending-review status.
- Logic: PASS ~ It separates broad metadata retrieval from the narrower automated screen and refuses to treat unreviewed category totals as evidence.
- Incentives: PASS ~ It identifies the pressure to convert large search returns or precise-looking automated categories into stronger claims than the methods can bear and refuses that conversion.
- Tradeoffs: PASS ~ Removing copied abstract text protects source material while public identifiers, titles, provisional categories, rule fields, and `not_reviewed` status preserve auditability.
- Consequences: PASS ~ Readers can inspect the data considered during revision, recalculate the automated counts, and see why neither broad search totals nor provisional category totals carry the essay's argument.
- Uncertainty: PASS ~ Pending manual review, possible wrong-referent matches, full-text absence, index coverage, publication-date context, and author-intent limits are stated directly.
- Institutional Behavior: PASS ~ The paper distinguishes the roles and limits of OpenAlex, Crossref, scholarly publishers, Outside In Print, and downstream readers.

## Final Recommendation

Publish only with a companion essay that does not rely on the provisional category totals. Do not upgrade those totals into editorial findings until manual review is completed, review status is published, aggregate files are regenerated, and new checksums validate.
