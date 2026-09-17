# Publishing Workflow

This is the canonical process for publishing new public content on Outside In Print.

- Editorial policy lives in `PUBLISHING_POLICY.md`.
- Repo-local session instructions live in `AGENTS.md`.
- The governing OIP editorial philosophy lives at `editorial/oip_editorial_philosophy.md`.
- The goal of this workflow is a clean web-first publish path that uses repo-local tooling, catches content residue early, and deploys through `main`.

## Toolchain bootstrap

Bootstrap the pinned repo-local toolchain before local publishing work:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\bootstrap_toolchain_assets.ps1
cmd /c "call tools\generate_tool_wrappers.cmd && call tools\provision_toolchain.cmd && call tools\validate_toolchain.cmd"
```

Use the generated wrappers under `tools\bin\generated\` for local commands after bootstrap.

Current pinned contract:

- Node `20.20.2`
- Hugo Extended `0.164.0`
- PowerShell `7.5.0`
- Python `3.12.9`

## Default flow for new content

The default publishing path is essay-first.

1. Scaffold a new essay draft:

   ```powershell
   .\tools\bin\custom\new-essay.cmd --title "My Title"
   ```

2. Optional fallback if you need raw Hugo generation:

   ```powershell
   .\tools\bin\generated\hugo.cmd new essays/my-title.md
   ```

3. Write in the supported Markdown subset and keep `draft: true` while drafting.
4. Flip to `draft: false` only when the piece is ready for publish review.

The essay scaffold is the preferred path because it creates the expected metadata block, slug, and starter structure.

## Newsletter subscriber handoff

Keep every public signup prompt plain: call the product the Outside In Print newsletter. Introduce the editorial name only after signup, in Buttondown's welcome email under **Settings > Subscribing > Welcome**.

- Subject: `Welcome to Bob’s Almanack`
- Opening: `Welcome to Bob’s Almanack, the weekly newsletter from Outside In Print.`
- Follow with: `Each Saturday, you'll receive new essays, original visuals, and selected work from the archive. No spam ever. Unsubscribe anytime.`

Do not promise an ad-free publication. After changing the Buttondown copy, confirm the full handoff with a test subscription: public newsletter form, confirmation step, then Bob’s Almanack welcome email.

## Metadata and discovery decisions

For non-draft public pieces, complete the core publication metadata:

- `title`
- `date`
- `section_label`
- `version`
- `edition`
- `draft`
- `description` for published essays

Use these discovery controls deliberately:

- Homepage selection lives in `layouts/partials/home_v2_selected.html`. The lead automatically becomes the newest eligible published reading piece by Hugo's `PublishDate` (the explicit `publishDate`, falling back to `date`), with equal publication times ordered by title. The supporting editorial order is *The Dolphin Company* (`/essays/the-dolphin-company/`), *What I Had* (`/syd-and-oliver/what-i-had/`), *Default Owner* (`/essays/default-owner/`), then *Reverse Origami* (`/essays/reverse-origami/`). Reverse Origami's source lives at `content/essays/musings/reverse-origami.md`. The Dolphin Company uses the homepage-only label `Case study`; its canonical `section_label` remains `Essay`. Dialogue and Musing labels follow existing content metadata, as do the other section labels.
- When a supporting route is the current lead, unavailable, draft, future-dated, or expired, the selector skips it and fills remaining slots with the newest other eligible essays, affirmations, or dialogues, breaking equal dates by title, until the surface contains five unique pieces. The existing reading-kind resolver also includes Musings stored under essays. Canonical published URLs determine selection, including dialogues whose source paths differ from their public URLs. Draft, future-date, future-`publishDate`, and expiry guards apply even when a preview enables those pages; landing pages are not eligible.
- The first selected piece retains its existing wide responsive `featured_image` hero; supporting cards reuse their existing approved `featured_image` illustrations as square artwork on desktop and mobile. Above 768px, the square illustration links to the article. At 768px and below, supporting cards form one column, with a 6rem square artwork column beside each card's copy; tapping the artwork opens a native illustration dialog. Article titles retain their article links. `home_featured_image_button.html`, `home_featured_image_dialog.html`, and `assets/js/home-featured-image.js` own this enhancement: the native artwork button starts hidden and JavaScript enables it, while an artwork link to the full illustration remains available without JavaScript. Supporting artwork uses the shared picture renderer with lazy loading and `sizes="120px"`. Clicking the expanded illustration or close button closes the dialog, and Escape provides keyboard closing. Use the existing article artwork and alt text; this surface does not require new illustrations or front-matter changes. A new publication takes the lead on the next Hugo rebuild; changing only an older piece's modification time does not promote it. Editorial fit determines the supporting order; audience figures do not sort this selection. Verify the lead against the `publishDate` column from Hugo's published inventory, supporting picks stay unique, and missing picks receive newest-first fallbacks. The archive sorts by article `date`, so its first entry is not a reliable publication-time oracle when explicit release times differ.
- `data/homepage_metrics.yaml` is the sole source of banner figures and article audience figures. Article badges use the public label `reads` and render only at the recorded threshold of 1,000 or more. The Dolphin Company, What I Had, Default Owner, and Reverse Origami have no source metric records and receive no audience badges. New leads likewise receive no badge without a qualifying record. Add figures only with source evidence and retain historical records for unfeatured pieces. The audience banner retains `Readers`.
- Maintain source, definition, measurement period, observation date, evidence reference, verification status, and record-creation date for every figure. The inherited article figures are Medium lifetime views, and the 10,000+ audience claim has an unverified owner-supplied aggregation basis; neither establishes unique people or accounts. Do not describe these entries as a current verified snapshot. See [Homepage metric maintenance](homepage-metrics.md) for the inventory validation and refresh process.
- The homepage no longer contains a bookstore module, Almanack teaser, collections strip, or illustration grid. Book discovery remains on `/shop/`; collection discovery remains on `/collections/` and article continuation surfaces.
- Homepage composition is stats (`home_reader_banner.html`), reader note, Featured Articles, library navigation, newsletter signup (`home_reader_newsletter.html`), then contribution. The `Keep reading` navigation contains only Browse the library (`/library/`) and Surprise me (`/random/`); the homepage body has no Archive CTA, browse heading, or browse description. `/archive/` and the shared Read navigation retain archive discovery. The separate newsletter partial preserves the existing Buttondown form, IDs, privacy link, and `homepage_reader_banner` analytics source slot; the final `Publish with us` region contains only the contributor invitation.
- `collections` for explicit membership in curated reading lanes
- `collection_weight` when you want controlled ordering inside a collection

If an essay uses a lead image, treat front matter as the canonical source:

- set `featured_image` to the stable ID from `data/image-assets.json`
- set `featured_image_alt`
- set `featured_image_caption` when attribution or caption text is needed
- do not repeat the same image as the first body image

Managed body images use `oip-image:<asset-id>` destinations. Originals live under
`assets/images/originals/`; do not copy managed artwork into `static/`. See
[`docs/responsive-image-pipeline.md`](responsive-image-pipeline.md) for the manifest,
rendering, review, and output-budget contract.

Version discipline is manual. Bump `version` for material changes to body copy, title/subtitle, or citation-relevant metadata.

If a piece belongs in an existing collection, add explicit `collections` front matter. If you are launching a new collection:

1. Add it to `data/collections.yaml`.
2. Create `content/collections/<slug>.md` if it should have a public page.
3. Add explicit collection membership to the relevant pieces.
4. Run:

   ```powershell
   .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_collections.ps1
   ```

5. Verify `/collections/`, the collection page, and member pages in a local build.

Essays are the first-class publishing workflow. Reports and working papers can still be published manually and must pass the Editorial Philosophy Audit before publication. Syd & Oliver dialogue/fiction pieces do not use this hard gate unless a specific piece is explicitly treated as public-judgment work.

## Musings

Musings are short source-free reflections, not ordinary evidence-driven essays. Create them under content/essays/musings/ with section_label: "Musing", library_type: "musing", collections: ["musings"], source_mode: "SOURCE_FREE", and external_factual_claims: "none".

Musings may use unqualified personal, spiritual, existential, philosophical, moral, universal, or aspirational language without citations, a research package, or an OIP-99 report. A declarative life observation or spiritual assurance is not an external factual claim merely because it is broad or certain. If a Musing makes a concrete factual claim about the world, record evidence appropriate to that claim; it may remain a Musing when reflection remains its primary form. A public Musing still needs a concise description and either a social image or an explicit image exemption with a reason. The standard cleanup, accessibility, and site validation checks remain required. See [editorial/musings-series-contract.md](../editorial/musings-series-contract.md).

An editorial cartoon may link to a fully declared source-free Musing without a separate OIP-99 report. Use the explicit essay route in `scripts/update_front_page_cartoon.ps1`; use `-LinkExistingSlug <cartoon-slug> -EssayPath "/essays/<musing-slug>/"` when repairing an existing gallery association without changing the current front-page image.

## The Things We Say

The Things We Say is a separate source-free Affirmation collection. Create
entries under `content/essays/affirmations/` with
`section_label: "Affirmation"`, `library_type: "affirmation"`,
`collections: ["the-things-we-say"]`, `source_mode: "SOURCE_FREE"`, and
`external_factual_claims: "none"`.

Each entry uses at least one exact affirmation from
`editorial/affirmations-bank.md`. The selected affirmation must appear as
at least one canonical pull quote. Publish entries one at a time through
the dedicated `oip-publish-affirmation` publisher.

Every entry receives one OIP Watercolor Chiaroscuro front-page
illustration. The same PNG serves as the article hero and unified Gallery
image. Midpoint art is optional. See
[editorial/the-things-we-say-publication-contract.md](../editorial/the-things-we-say-publication-contract.md).

A Gallery image may link to a fully declared source-free Affirmation
without a separate OIP-99 report. The exact Affirmation predicate remains
separate from the Musings predicate.

## Syd & Oliver dialogue packages

Every new Syd & Oliver dialogue package must include:

- a Markdown source file under `content/essays/dialogues/<slug>.md`, with its canonical `/syd-and-oliver/<slug>/` URL;
- `library_type: 'dialogue'`, `collections: ['syd-and-oliver-dialogues']`, a concise `description`, `version`, and `edition`;
- a scene-matched hero, using owner-supplied artwork when provided or anonymous silhouettes by default for generated art, registered once at `assets/images/originals/essays/dialogues/<slug>/hero.<ext>` under the stable ID `essays/dialogues/<slug>/hero`, with that bare ID referenced by `featured_image`;
- precise `featured_image_alt` text that describes the actual scene without identifying either man; and
- `draft: true` by default. Change it only when the user explicitly asks for a publication-ready package or publication.

Use `scripts/register_managed_image_asset.ps1` to hash, validate, and register the source; never copy the original into `static/`. Use a landscape hero that remains legible as the site's narrow desktop side plate and as a full-width mobile image. Do not put a duplicate hero image in the body. Inspect generated or supplied art before use. Generated art should avoid visible faces, readable text, logos, watermarks, and unrelated focal subjects; explicit owner choices govern supplied artwork.

Starting with **The Morning After**, every new Syd & Oliver publication also adds its hero to the Gallery and promotes it as the current front-page illustration. Reuse the same approved managed asset, title, and alt text. Link the Gallery item to the canonical `/syd-and-oliver/<slug>/` route. Older Gallery entries remain available when the next illustration becomes current; this policy does not require retroactive changes to older dialogues.

At authorized publication, after setting the dialogue to `draft: false`, run:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\update_front_page_cartoon.ps1 -DialoguePath '/syd-and-oliver/<slug>/'
```

This updates `data/editorial_cartoons.yaml` from the dialogue's metadata and existing managed asset. It does not copy the image, add a second manifest entry, or impose the essay Editorial Philosophy Audit. Publish the Gallery data change together with the dialogue and any newly registered hero. Ordinary draft packaging does not change the live current illustration.

For a queued dialogue, explicitly supply `-PublishDate` at or after its exact release timestamp. The new Gallery entry and its current selection remain hidden until eligible, using the same fallback behavior as other queued illustrations. If an intervening publication replaces `current`, rerun the `-DialoguePath` command at the authorized release to restore the intended front-page selection. Verify the Gallery item, linked dialogue, current front-page illustration, responsive output, and `tests/test_editorial_cartoon_schedule_contract.ps1` with the normal publication gate.

These are character dialogues. Do not append sourcing apparatus or factual-review notes to a dialogue package unless the owner requests that work. A hero registered as the Gallery pairing is eligible for the same paired-art surfaces, including Bob's Almanack cards.

## Local preview and publish validation

Run the target-file guardrail before a full build:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md
```

For publication-ready essays, reports, and working papers, require Editorial Philosophy Audit evidence:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md -RequireEditorialPhilosophyAudit
```

Use the same flag with `content\reports\<slug>.md` or `content\working-papers\<slug>.md` for those sections. Accepted evidence is a per-piece OIP-99 report under `docs/editorial-audits/99-refinement/`, a daily backfill ledger/report entry for the slug, or a compact COA2 ledger/report entry under `docs/editorial-audits/coa2-value-review/` for COA2 review work. Per-piece reports must show `Decision: PASS` and PASS rows for Evidence, Logic, Incentives, Tradeoffs, Consequences, Uncertainty, and Institutional Behavior. Ledger-backed evidence must include an `editorial_philosophy` PASS object and a matching report with the same PASS rows.

During drafting, preview locally with:

```powershell
.\tools\bin\generated\hugo.cmd server -D
```

Before publishing, run the normal local publish gate:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_source_contract.ps1
.\tools\bin\generated\hugo.cmd --gc --minify --panicOnWarning
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_responsive_image_output_contract.ps1 -SiteDir public
```

What this gate is meant to catch:

- changed-essay residue and missing descriptions
- missing Editorial Philosophy Audit evidence for changed non-draft essays, reports, and working papers
- forbidden `that matters` phrasing and discouraged adverbial `still` constructions in changed public prose
- hero/frontmatter conflicts such as placeholder heroes, missing heroes with real early lead images, and duplicate hero/body lead images
- broken public routes
- generated HTML regressions
- CI-only Node/browser regressions remain delegated to GitHub Actions and are not forced through local npm.

## Publish path through main

Publishing happens through `main`.

1. Commit the validated content changes.
2. Push or merge to `main`.
3. `.github/workflows/deploy.yml` runs the contract tests, changed-essay guardrails, Hugo build, generated-output checks, and GitHub Pages deploy.

There is no separate manual publish step after `main` is updated. `main` is the publish action.

## Future-dated publishing

Future-dated essays can be committed to `main` before release. Keep `draft: false`, set `date` to the public article date, set `publishDate` to the intended release time, and leave the production Hugo build as `hugo --gc --minify --panicOnWarning` without `--buildFuture`. Hugo excludes future-dated content from the public build until the release time has passed.

Use explicit Eastern-time timestamps for timed releases:

```yaml
date: 2026-05-29
publishDate: 2026-05-29T08:00:00-04:00
```

Date-only releases are interpreted in the site timezone, which is `America/New_York`. The deploy workflow also sets `TZ: America/New_York` and runs one scheduled GitHub Actions rebuild per day at 12:17 AM Eastern, so a dormant daily post appears on the first successful scheduled deploy after its `publishDate` becomes eligible. GitHub scheduled workflows are not exact-to-the-minute; use `workflow_dispatch` for a manual immediate release if timing is critical.

For the current daily-essay queue, set one essay per publishing day:

```yaml
date: 2026-05-29
publishDate: 2026-05-29T00:00:00-04:00
```

Multiple future essays may sit on `main` at the same time. Hugo will only build the ones whose `date` and `publishDate` are no longer future values. If two queued essays share the same eligible publish day, both will publish on that day's scheduled deploy.

To inspect the dormant queue locally:

```powershell
.\tools\bin\generated\hugo.cmd list future
```

Future-dated front-page cartoons use the same daily rebuild, but the source of truth is `data/editorial_cartoons.yaml` instead of essay front matter. A queued cartoon entry may include:

```yaml
  - slug: scenario-cartoon
    title: "Scenario Cartoon"
    date: "2026-05-29"
    publishDate: "2026-05-29T00:00:00-04:00"
    image: "editorial/scenario-cartoon"
    essay: "/essays/the-scenario-that-ate-the-future/"
```

The public homepage, gallery, home metadata image, and essay-card cartoon thumbnails ignore future cartoon entries until `publishDate` or `date` is eligible. The current-cartoon selector falls back to the newest eligible cartoon when `current` points to a future queued entry, so multiple queued cartoons can sit on `main`.

Queued illustrations must name the intended piece with `essay: "/essays/<slug>/"` or, for Syd & Oliver, `essay: "/syd-and-oliver/<slug>/"`. The cartoon schedule contract verifies that linked essays exist, are not drafts, and publish no later than the cartoon. If a cartoon is intentionally standalone, do not future-queue it without explicit editorial approval.

For a local preview of future queued cartoons, set the explicit preview environment variable before the Hugo command:

```powershell
$env:HUGO_BUILD_FUTURE_CARTOONS = "true"
.\tools\bin\generated\hugo.cmd --gc --minify --panicOnWarning --buildFuture
Remove-Item Env:\HUGO_BUILD_FUTURE_CARTOONS
```

For local preview of a future-dated essay, use `--buildFuture` deliberately:

```powershell
.\tools\bin\generated\hugo.cmd --gc --minify --panicOnWarning --buildFuture
```

Do not add `--buildFuture` to the production deploy workflow. That flag is only for preview and validation of future content before its public time.

## Non-ideal paths and exceptions

Avoid treating these as the default path:

- PDFs are paused. They are not part of the public publishing workflow, and deploy removes public PDF artifacts.
- Medium migrations should use the import path, not manual paste-in authoring:

  ```powershell
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\import_medium_export.ps1 -ZipPath "C:\path\to\medium-export.zip" -DryRun
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\import_medium_export.ps1 -ZipPath "C:\path\to\medium-export.zip"
  .\tools\bin\generated\python.cmd .\scripts\normalize_legacy_medium_essay.py --write .\content\essays\some-piece.md
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_legacy_essays.ps1
  ```

- For existing essays with hero/body conflicts, use the repo-local normalizer instead of hand-copying image fields:

  ```powershell
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\normalize_essay_hero_images.ps1
  .\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\normalize_essay_hero_images.ps1 -Write
  ```

  This pass promotes deterministic early lead images into `featured_image`, localizes remote Medium images once under `assets/images/originals/`, registers stable manifest IDs, migrates short caption/source lines into `featured_image_caption`, and removes promoted duplicates from the article body.

- Analytics snapshot refresh is separate from public content publishing. Dashboard publishing is paused and no dashboard build is part of the public reading-site workflow.
- Do not rely on raw HTML, copied Medium formatting, duplicated title/dek in the body, or improvised separators. The essay guardrails are specifically meant to catch those problems.
