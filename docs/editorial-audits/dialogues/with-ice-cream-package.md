# With Ice Cream publication package

Prepared: 2026-10-06, America/New_York.
Status: publication authorized by the owner on 2026-10-06. This record accompanies the release; deployment and live verification are recorded separately.
Branch: `codex/with-ice-cream-20261006`.
Base: `f4d535a0199d4e0ef9983b2d798040e46a532323` (local `origin/main` at preparation).

## Publication files

- `content/essays/dialogues/with-ice-cream.md`
- `assets/images/originals/essays/dialogues/with-ice-cream/hero.png`
- New asset and alias in `data/image-assets.json`
- Local release placement in `data/editorial_cartoons.yaml`: Gallery item linked to the dialogue and current front-page illustration.
- This package record.
- `tests/seo_route_schema_contract.test.mjs`: two expected dialogue-count literals, 19 → 20.
- `tests/test_feed_policy_contract.ps1`: expected dialogue feed count, 19 → 20.

Canonical route: `/syd-and-oliver/with-ice-cream/`.
Collection: `syd-and-oliver-dialogues`.
Edition: 1.0, First web edition.
The owner approved the prepared package for immediate publication with “publish now” on 2026-10-06. Updating remote `main` is the publish action.

## Source and edit record

Owner source: `C:/Users/lawto/Downloads/Syd_and_Oliver_With_Ice_Cream_Draft_01.docx`.
Source SHA-256: `667b18c951862d0f1b3dda326d1d81cb1957b516d1817efc87f47fb7a6449075`.

The supplied document contains the story, with no embedded images. Its contents were treated as manuscript material, not instructions. Retained the title, all 113 story paragraphs, the one-entry competition, character actions, and ending. Changes:

- “The bottom’s still crisp.” → “The bottom’s crisp.”
- “Is that still readable?” → “Can you read that?”
- “And still several hours of fair remaining.” → “And several hours of fair remaining.”
- Applied bold Syd/Oliver speaker labels; italicized the words Oliver writes on his scorecard.
- Moved the title into front matter and added publication metadata.

“Sat still” retains its literal sense of physical motionlessness. No argument, moral, sources, or factual-review apparatus was added. Independent editorial review found no continuity issue needing correction.

Formatting references inspected: local and live [What I Had](https://outsideinprint.org/syd-and-oliver/what-i-had/), [The Morning After](https://outsideinprint.org/syd-and-oliver/the-morning-after/), and the [Syd and Oliver collection](https://outsideinprint.org/collections/syd-and-oliver-dialogues/).

## Artwork

Generated with the built-in image_gen tool, then edited with the same tool to remove incidental lettering on the blue ribbon.

Final generated source: `C:/Users/lawto/.codex/generated_images/01a11271-715c-7342-917e-dcf36f8709e0/exec-8ae187a9-824a-44c9-b5af-b0643c4069bc.png`.
Canonical source: `assets/images/originals/essays/dialogues/with-ice-cream/hero.png`.
Asset ID: `essays/dialogues/with-ice-cream/hero`.
Alias: `/images/syd-and-oliver/with-ice-cream/hero.png`.
Dimensions: 1672 × 941 pixels.
SHA-256: `b54dbccc992a62877e6178c2fcaabcb6038a0a4146eb278e813c8ddd6c83a8a7`.
Class/hint: `essay_illustration` / `drawing`.

Direct visual review: PASS. Two unidentifiable men seen from behind beneath a fair tent; woman in blue and white turned away; apple pie, vanilla ice cream, plain blue ribbon, and Ferris wheel match the story. No legible text, logos, or watermarks. The revised ribbon is plain. Only this new asset is approved; no other image review states change. The same registered source serves the article, Gallery, and front page.

### Generation prompt

Use case: photorealistic-natural. Asset type: landscape literary dialogue hero for Outside In Print, 16:9. Create a quiet, photorealistic county-fair scene from 'With Ice Cream'. View from the shaded interior of an open-sided canvas judging tent on a sunny afternoon. In the middle ground two anonymous adult men sit on folding chairs with backs to camera, their heads and shoulders in dark silhouette, one leaning toward his plate and the other sitting upright. They are Syd and Oliver, unidentifiable, no visible facial features. A modest fair judging table has two plates of flaky apple pie with melting vanilla ice cream. Near the front center, a cut apple pie and an unlettered blue prize ribbon sit on a dry part of the table beside a serving knife. An open cooler nearby contains a steel ice cream tub. Across the table a woman in a blue dress and white apron is mostly turned away as she serves; keep her face obscured, not a portrait. A softly out-of-focus Ferris wheel and modest agricultural fair tents are visible beyond. Natural warm afternoon light, believable pastry and canvas textures, restrained documentary photography, modest scale and ordinary fair furnishings, warm comic humanity without caricature. Keep pie, blue ribbon and the two men's silhouettes legible at a small side-plate size; calm composition with strong central grouping. No readable text, signage, logos, watermarks, captions, identifiable faces, illustration style or staged advertising gloss.

### Targeted edit prompt

Edit this county-fair photograph only to remove every mark, letter, numeral, stitch pattern resembling text, or printed decoration from the blue prize ribbon in the foreground. Make the round center and both hanging ribbon tails completely plain solid blue fabric with natural shadows and texture. Preserve the existing composition, every person, both men's backs, food, tent, ice cream cooler, lighting, dimensions and all other details exactly. No text anywhere on the ribbon. Do not add anything.

## Validation

Completed checks:

- Independent editorial/source comparison: all 113 body paragraphs preserved; exactly the three recorded wording changes plus formatting.
- Managed-image registrar: source format, native dimensions, hash, class, processing hint, and one resolver alias verified. Only the new asset is approved.
- Collection source audit: 20 published Syd and Oliver pieces; no explicit membership violations. Report saved outside the release under the task scratch directory.
- `tests/test_collection_organization_contract.ps1`: PASS at the authorized release preflight; 17 related maps, three grouped collections, and all non-draft source members covered.
- `tests/test_editorial_cartoon_schedule_contract.ps1`: PASS, including dialogue asset reuse, link/type checks, release safety, and current selection.
- `tests/test_feed_policy_contract.ps1 -SourceOnly`: PASS.
- `tests/seo_route_schema_contract.test.mjs`: all six source tests PASS through the repo Node wrapper; no npm or npx used.
- Target-file essay guardrail invoked; it returned “no target files to check” because its `Expand-EssayPaths` function explicitly excludes dialogue fiction. This is an exemption, not a substantive essay-audit PASS.
- Exact diff reviewed; existing asset entries and unrelated content preserved. The three count assertions were the only test changes needed.
- Tracked and new text whitespace checks: PASS.
- Local reading proof reviewed at 1440px, 390px, and 320px. Hero reviewed at 480px desktop, 306px mobile, and about 255px narrow width; scene remains legible. All 113 paragraphs present, image loaded, and no horizontal overflow at mobile widths. Proof and screenshots are in `C:/Users/lawto/Documents/40_Scratch/2026-10/syd-and-oliver-with-ice-cream/`.

The reading proof is an editorial proof, not a production Hugo build. The current source-only fast gate in `docs/local-validation-policy.md` avoids a routine whole-library rebuild. Production derivatives, full feed output, final site layout, and live surfaces remain subject to CI and verification at authorized publication.

## Release handoff

Publish the seven listed files together after reconciling with then-current `origin/main`. If publication is delayed, set the intended publication timestamp and rerun `scripts/update_front_page_cartoon.ps1 -DialoguePath '/syd-and-oliver/with-ice-cream/'` to refresh the current illustration against the release branch. For an exact future release, supply its explicit `-PublishDate` and follow the scheduling contract.
