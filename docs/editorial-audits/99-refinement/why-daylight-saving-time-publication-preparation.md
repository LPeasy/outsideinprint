# Daylight saving essay: publication preparation

Prepared October 27, 2026, from Contributor Desk workspace `why-daylight-saving-time`, revision 11. Preparation base: `origin/main` at `ddda905d81c10406104eb35c68a72ab91d8e5468`. Release base refreshed to `9c10c3983248759919ecf5d349498f927799db6d`, including the reviewed feed-parser CI repair in PR #231. The intervening scheduler/CI changes do not alter this essay, its images or the timeline rendering; unchanged local checks are reused.

## Release scope

- New essay: `/essays/why-daylight-saving-time/`, by Robert V. Ussley, version 1.0, First web edition.
- Approved publication date: October 27, 2026.
- Collection: Civic Institutions and Public Power, under Public services and civic systems. Expected membership delta: one essay.
- Artwork: the approved station-clock hero, illustrative clock comparison and revised cutaway with unlit lamps. The original PNGs are unchanged, registered once each, and visually approved.
- The hero enters the Gallery through the existing automatic article-hero behavior; no separate cartoon, custom Gallery entry or email distribution is included.
- Opt-in template change: a twelve-entry timeline spans the essay's right side on desktop, follows the essay on mobile, and stacks for physical printing. The source diff and rendered behavior were reviewed alongside the content; articles without the option retain their existing wrapper.

## Copy adaptations

The publication subtitle is “Where it came from, and why we turn the clocks back.” Adverbial “still” was removed under current house rules. The caption time range and House vote tally use plain hyphens to satisfy the existing punctuation preflight. The main essay's wording, Bob's contractions, every source URL and all twelve timeline entries are preserved. The trailing list moves into `timeline_sidebar` front matter; it is rendered as an aside after the main body in document reading order.

## Evidence and validation

The adjacent hash-bound refinement report and source checklist record the current editorial audits and bounded legal-status check. The immutable revision 11 export and full publication staging package remain outside the public content tree. Package provenance records export, artwork and adapted essay hashes. `validation-receipt.md` in the staging package records completed source and visual checks; exhaustive production output checks remain the checked PR's responsibility.

The registered Breach of Confidence guest essay also binds the shared `data/collections.yaml` file. This publication adds only the daylight-saving slug in the civic-services section, so that registration's collection-file hash is refreshed. Its other eight bound files, approved image records, primary route, release window and public checks remain unchanged. The source guard remains strict; no binding is removed or bypassed.

## Publication authorization and reviewed diff

Following the completed preparation and external preview, the owner explicitly instructed: “lets go ahead and publish this essay onto the live site when its ready.” Authorization was received on October 27, 2026, and recorded during this release. It covers the prepared essay, three approved illustrations, collection assignment and the opt-in responsive timeline shown in the preview. Email distribution is outside this request.

The release diff was reviewed against current `origin/main` at the base above. CSS uses new timeline classes; the existing ordinary-article body branch is retained. The partial requires a nonempty titled list, renders the saved citation-bearing fields as inline Markdown, and places the aside after the main body in document order. The article and a control article were rendered, source links compared, and desktop/mobile geometry inspected during preparation. No unresolved finding requires another local build.

Proceed through the checked PR with authorized auto-merge, required `release-ready` and an up-to-date branch. A merge alone does not establish publication: record the exact production commit, original generation timestamp and successful canonical deployment verification before marking the package or Contributor Desk Published.
