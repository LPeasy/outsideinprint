# Outside In Print Agent Notes

For publishing or content-maintenance sessions in this repo, start with [docs/publishing-workflow.md](docs/publishing-workflow.md).
Local validation policy lives in [docs/local-validation-policy.md](docs/local-validation-policy.md).
Responsive image ownership, rendering, and release limits live in [docs/responsive-image-pipeline.md](docs/responsive-image-pipeline.md).
Political cartoon design guidance lives in [docs/political-cartoon-design-philosophy.md](docs/political-cartoon-design-philosophy.md).
The governing OIP editorial philosophy lives at `editorial\oip_editorial_philosophy.md`. Changed non-draft essays, reports, and working papers must have Editorial Philosophy Audit PASS evidence before publication. Syd & Oliver dialogue/fiction pieces are excluded from this hard gate unless explicitly treated as public-judgment work.

## Deferred merch work

Merch order automation is not implemented yet. Before proposing or building order intake, label generation, or fulfillment automation, read [docs/merch-order-fulfillment-plan.md](docs/merch-order-fulfillment-plan.md).

## Default publishing contract

- Use the repo-local wrappers under `tools\bin\generated\`. Do not assume global `node`, `hugo`, or `pwsh`.
- Prefer the essay scaffold for new public writing: `.\tools\bin\custom\new-essay.cmd --title "My Title"`.
- Run target-file essay guardrails for changed published prose:
  `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md`
- For publication-ready essay, report, and working-paper changes, run the philosophy gate:
  `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\check_essay_guardrails.ps1 -Paths .\content\essays\my-title.md -RequireEditorialPhilosophyAudit`
- For routine publishing, use the source-only fast gate in [docs/local-validation-policy.md](docs/local-validation-policy.md): package/staged validators where applicable, target guardrails, and collection checks for changed membership. New artwork gets direct original review and targeted registrar/staged checks; CI runs the whole-library image source contract. Audit the exact diff before updating `main`.
- Preview or run a full local Hugo build only for visual, template, responsive, image-pipeline, or complex scheduling changes that need rendered evidence. Do not build the full image library for routine copy or artwork publication; GitHub Actions owns the production build and generated-output tests.
- Do not run local npm or npx commands as a required OIP publishing gate. GitHub Actions owns public-site contracts and analytics snapshot coverage.
- At each new Syd & Oliver publication, register its existing hero in the Gallery and promote it as the front-page illustration using `scripts/update_front_page_cartoon.ps1 -DialoguePath '/syd-and-oliver/<slug>/'`; include the Gallery data change in that release. See `docs/publishing-workflow.md` for draft and scheduling behavior.
- Treat `main` as the publish action. The site goes live through `.github/workflows/deploy.yml` after push or merge to `main`.

## Important exceptions

- A direct-EPUB activation release with no image, template, CSS, shortcode,
  render-hook, or responsive-image-pipeline change may use the source-only
  fast gate. GitHub Actions retains the production build and output checks.
- PDFs are paused and are not part of the public publishing workflow.
- Medium migrations follow the import and normalization path in [docs/publishing-workflow.md](docs/publishing-workflow.md), not the normal new-essay path.
- Essays are the first-class publishing workflow. Reports and working papers are more manual but still require the Editorial Philosophy Audit before publication. Syd & Oliver dialogue/fiction pieces remain outside the hard philosophy gate unless explicitly treated as public-judgment work.
- Musings is a source-free short-reflection collection. Follow [editorial/musings-series-contract.md](editorial/musings-series-contract.md). It may skip the essay OIP-99 package only when its library type, collection, source mode, and external-factual-claim declarations satisfy that contract.
- The Things We Say is a separate source-free Affirmation collection. Follow [editorial/the-things-we-say-publication-contract.md](editorial/the-things-we-say-publication-contract.md) and use [editorial/affirmations-bank.md](editorial/affirmations-bank.md) as its source.
