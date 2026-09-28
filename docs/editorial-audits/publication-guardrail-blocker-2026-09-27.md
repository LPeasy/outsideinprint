# Publication guardrail blocker — September 27 release

**Follow-up:** the owner superseded wording exceptions with minimal prose corrections and retained all three style rules as blockers. The [remediation record](source-link-release-guardrail-remediation-2026-09-27.md) governs the current local-only pass. The diagnostic snapshot and former proposal below remain historical; no publication is authorized by this follow-up.

Status: **merged, not deployed**. All nine approved bounded correction sets and the combined 110-essay release are in main at `ec9c93265c10d3a88e25bd4ad46c99decdbc4c07`. PR 127 required jobs passed, but production run [36365465324](https://github.com/LPeasy/outsideinprint/actions/runs/36365465324) stopped before build/deploy. The live site was not updated by that run.

## Exact evidence

- PR run [36364092117](https://github.com/LPeasy/outsideinprint/actions/runs/36364092117) passed its source, Windows image, production build, browser and output jobs. Its actual essay guardrail logged **no target files to check**. The synchronize event's `github.event.before` was the previous PR head `cf2d61a3f2ea43688d0c0f9a23b506ca7031a36b`, so the last fixture-only increment did not cover the accumulated essay batch.
- Production's comparison with pre-release main `5e21e40efd5e4bcfda8bac2284edb9bb36b341d6` checked 110 essays and 110 philosophy records. Philosophy audit blockers: zero. Discovery blockers: zero.
- Separate content guardrails reported 26 blocking files: 25 with house-style flags and one missing featured-image field. There are 49 `adverbial_still_construction` hits and five `that_matters_framing` hits. These are scanner flags, not 54 established prose defects; source URLs are among the matches.
- Legacy preflight reported 77 punctuation-flagged lines across 13 files. Plain-heading warnings are nonblocking and are not a reason for a broad rewrite.
- The missing featured-image declaration is in the MECE essay. Existing body artwork remains intact. No new image has been commissioned or assigned.

The focused punctuation comparison found 127 flagged body characters on those 77 lines: 106 inherited occurrences in eight essays and 21 introduced occurrences in five (Generation Inflation 7, Max 4, NFIP 1, The Water's Rising 4, What Is Risk 5). These are smart quotes/apostrophes and en dashes, not corrupted encoding or nonbreaking spaces. Normalize typography only if approved; do not characterize all these marks as factual errors.

MECE's existing managed artwork is `medium/61a52f886b9d1e4bdb9b1d293ab6bbd3419ed45b322e637926a8ce7894b1325e`. A proposed `image: "oip-image:medium/61a52f886b9d1e4bdb9b1d293ab6bbd3419ed45b322e637926a8ce7894b1325e"` declaration uses the existing social-image field accepted by the guardrail and metadata resolver. The single-page hero uses `featured_image`, not `image`; prefer this metadata-only route over promoting/removing body artwork. Its rendered result remains to be verified after approval.

## Boundary and next decision

Do not describe the release as live. No public prose or guardrail policy was changed after this failure. The author's preservation instruction prevents an unapproved house-style rewrite. The existing rules do not provide a preserve-prose waiver for ordinary authored “still” or “that matters” wording. Genuine URL/quoted/title-source false positives may be corrected in the parser under existing policy, but they do not account for every authored phrase.

Recommended owner decision: approve a narrowly documented, exact-text legacy-style exception for this already-approved batch rather than rewriting preserved prose; normalize only verified punctuation artifacts; supply existing-artwork metadata without adding an illustration; and fix PR comparison selection to inspect the full PR instead of its last increment. This is a proposal, not an approved exception or a completed repair.

Any follow-up must explicitly rerun the full 110-essay guardrail against pre-release base `5e21e40efd5e4bcfda8bac2284edb9bb36b341d6`, not allow a later fixture/docs-only increment to conceal these blockers. Do not publish a docs-only main commit or use a manual workflow rerun as a substitute for resolving and rechecking this failed batch.

## Style flags from production log

| Flag | Location in merged release |
|---|---|
| THAT-MATTERS | `content/essays/how-senate-republicans-handle-trumps-ukraine-rhetoric-without-losing-maga-support.md:83` |
| THAT-MATTERS | `content/essays/is-trump-seriously-asking-for-ukraines-mineral-rights-or-is-this-just-a-distraction.md:54` |
| THAT-MATTERS | `content/essays/let-it-crash-the-opportunity-of-a-lifetime.md:34` |
| THAT-MATTERS | `content/essays/mingo-county-mud-in-the-water.md:55` |
| THAT-MATTERS | `content/essays/why-superintelligence-strategy-gets-ai-governance-wrong.md:156` |
| STILL | `content/essays/american-household-debt.md:110` |
| STILL | `content/essays/deepseek-lean-ai-disrupts-americas-compute-heavy-tech-giants.md:43` |
| STILL | `content/essays/deference-lost.md:52` |
| STILL | `content/essays/how-american-farm-labor-is-set-to-evolve.md:44` |
| STILL | `content/essays/how-senate-republicans-handle-trumps-ukraine-rhetoric-without-losing-maga-support.md:48` |
| STILL | `content/essays/how-senate-republicans-handle-trumps-ukraine-rhetoric-without-losing-maga-support.md:54` |
| STILL | `content/essays/how-senate-republicans-handle-trumps-ukraine-rhetoric-without-losing-maga-support.md:58` |
| STILL | `content/essays/how-senate-republicans-handle-trumps-ukraine-rhetoric-without-losing-maga-support.md:66` |
| STILL | `content/essays/how-senate-republicans-handle-trumps-ukraine-rhetoric-without-losing-maga-support.md:70` |
| STILL | `content/essays/is-trump-seriously-asking-for-ukraines-mineral-rights-or-is-this-just-a-distraction.md:73` |
| STILL | `content/essays/let-it-crash-the-opportunity-of-a-lifetime.md:120` |
| STILL | `content/essays/let-it-crash-the-opportunity-of-a-lifetime.md:120` |
| STILL | `content/essays/let-it-crash-the-opportunity-of-a-lifetime.md:120` |
| STILL | `content/essays/mingo-county-mud-in-the-water.md:53` |
| STILL | `content/essays/public-vs-private-pay-who-really-earns-more.md:147` |
| STILL | `content/essays/public-vs-private-pay-who-really-earns-more.md:149` |
| STILL | `content/essays/rethinking-coastal-retreat.md:58` |
| STILL | `content/essays/russias-slow-surrender-how-china-is-turning-putin-s-war-into-a-power-play.md:88` |
| STILL | `content/essays/standard-of-living-vs-quality-of-life-what-the-numbers-miss.md:9` |
| STILL | `content/essays/standard-of-living-vs-quality-of-life-what-the-numbers-miss.md:47` |
| STILL | `content/essays/standard-of-living-vs-quality-of-life-what-the-numbers-miss.md:47` |
| STILL | `content/essays/standard-of-living-vs-quality-of-life-what-the-numbers-miss.md:179` |
| STILL | `content/essays/standard-of-living-vs-quality-of-life-what-the-numbers-miss.md:185` |
| STILL | `content/essays/tariffs-protectionism-and-wishful-thinking.md:84` |
| STILL | `content/essays/the-death-of-moores-law.md:92` |
| STILL | `content/essays/the-economics-of-the-mongol-empire.md:45` |
| STILL | `content/essays/the-economics-of-the-mongol-empire.md:105` |
| STILL | `content/essays/the-future-of-ai-and-technical-jobs-why-review-work-is-your-best-bet-for-now.md:7` |
| STILL | `content/essays/the-future-of-ai-and-technical-jobs-why-review-work-is-your-best-bet-for-now.md:48` |
| STILL | `content/essays/the-future-of-ai-and-technical-jobs-why-review-work-is-your-best-bet-for-now.md:101` |
| STILL | `content/essays/the-future-of-ai-and-technical-jobs-why-review-work-is-your-best-bet-for-now.md:117` |
| STILL | `content/essays/the-future-of-ai-and-technical-jobs-why-review-work-is-your-best-bet-for-now.md:146` |
| STILL | `content/essays/the-national-debt-is-screwing-you-heres-how.md:115` |
| STILL | `content/essays/the-privacy-paradox-why-americans-feel-powerless-over-their-personal-data.md:134` |
| STILL | `content/essays/the-privacy-paradox-why-americans-feel-powerless-over-their-personal-data.md:154` |
| STILL | `content/essays/the-privacy-paradox-why-americans-feel-powerless-over-their-personal-data.md:184` |
| STILL | `content/essays/the-undead-state.md:68` |
| STILL | `content/essays/u-s-russia-peace-talks.md:87` |
| STILL | `content/essays/u-s-shifts-ukraine-policy.md:80` |
| STILL | `content/essays/u-s-shifts-ukraine-policy.md:93` |
| STILL | `content/essays/u-s-shifts-ukraine-policy.md:99` |
| STILL | `content/essays/whos-drinking-all-the-modelo.md:136` |
| STILL | `content/essays/whos-drinking-all-the-modelo.md:152` |
| STILL | `content/essays/why-a-return-to-the-gold-standard-would-break-the-economy.md:40` |
| STILL | `content/essays/why-superintelligence-strategy-gets-ai-governance-wrong.md:164` |
| STILL | `content/essays/you-cant-outrun-the-calculator.md:60` |
| STILL | `content/essays/you-cant-outrun-the-calculator.md:79` |
| STILL | `content/essays/you-cant-outrun-the-calculator.md:81` |
| STILL | `content/essays/you-cant-outrun-the-calculator.md:81` |

## Punctuation-flagged essays

- `content/essays/a-really-boring-topic.md`
- `content/essays/ai-in-education-is-a-wicked-problem.md`
- `content/essays/declaring-equality.md`
- `content/essays/generation-inflation.md`
- `content/essays/pope-leo-xiv-from-chicago-altar-boy-to-the-chair-of-saint-peter.md`
- `content/essays/the-death-of-moores-law.md`
- `content/essays/the-economics-of-the-mongol-empire.md`
- `content/essays/the-max-mistake-why-hbos-name-change-backfired.md`
- `content/essays/the-national-flood-insurance-program.md`
- `content/essays/the-waters-rising-what-the-data-really-says-about-extreme-weather.md`
- `content/essays/what-happened-at-camp-mystic.md`
- `content/essays/what-is-risk-a-four-part-framework.md`
- `content/essays/why-oberfell-will-not-be-overturned.md`
