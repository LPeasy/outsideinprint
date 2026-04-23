# Outside In Print Agent Notes

For publishing or content-maintenance sessions in this repo, start with [docs/publishing-workflow.md](docs/publishing-workflow.md).

## Deferred merch work

Merch order automation is not implemented yet. Before proposing or building order intake, label generation, or fulfillment automation, read [docs/merch-order-fulfillment-plan.md](docs/merch-order-fulfillment-plan.md).

## Default publishing contract

- Use the repo-local wrappers under `tools\bin\generated\`. Do not assume global `node`, `hugo`, or `pwsh`.
- Prefer the essay scaffold for new public writing: `.\tools\bin\custom\new-essay.cmd --title "My Title"`.
- Run target-file essay guardrails before a full build:
  `.\tools\bin\generated\npm.cmd run check:essays -- -Paths .\content\essays\my-title.md`
- Preview locally while drafting with `.\tools\bin\generated\hugo.cmd server -D`.
- Before publishing, run the normal gate:
  `.\tools\bin\generated\hugo.cmd --gc --minify`
  `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1`
  `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`
  `.\tools\bin\generated\npm.cmd test`
- Treat `main` as the publish action. The site goes live through `.github/workflows/deploy.yml` after push or merge to `main`.

## Important exceptions

- PDFs are paused and are not part of the public publishing workflow.
- Medium migrations follow the import and normalization path in [docs/publishing-workflow.md](docs/publishing-workflow.md), not the normal new-essay path.
- Essays are the first-class publishing workflow. Dialogues, reports, and working papers are more manual and should be handled deliberately.
