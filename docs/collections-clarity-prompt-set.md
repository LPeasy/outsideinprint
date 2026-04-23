# Collections Clarity Prompt Set

Date: 2026-04-23

Status: Ready-to-use implementation prompts for future collections-page refinement work.

## Summary

This prompt set is for a clarity-first improvement pass on the collections system.
It is meant to help Codex improve `/collections/` and collection detail pages for serious readers without weakening the site's editorial gravity or changing the underlying Hugo collections model.

The intended stance is:

- improve clarity, not convertibility
- preserve the current dark editorial atmosphere
- keep collections curated and data-driven
- avoid taxonomy drift, schema creep, and broad redesign unless a later pass explicitly asks for them

## COAs

### COA 1: Index-Only Clarity Pass

- Focus only on `/collections/`.
- Improve header copy, group framing, card scan order, and the distinction between `Series` and `Topics`.
- Lowest risk and fastest to execute.
- Weakness: leaves collection detail pages and shared card language inconsistent.

### COA 2: Multi-Surface IA and Copy Pass

- Improve `/collections/`, shared collection card presentation, and collection detail framing together.
- Preserve room themes, progress logic, routes, and the current data model.
- Best fit for this repo because the list page, card partial, and collection detail template already form one documented system.
- Medium effort, but still bounded.

### COA 3: Full Collections Refresh

- Rework the collections index, detail pages, shared card markup, and possibly article collection-context surfaces together.
- Highest potential upside, but highest regression risk because the repo already has contract tests around room themes, reading-path behavior, analytics source slots, and progress UI.
- Not aligned with the current clarity-first preference.

## Recommended Combined COA

Use **COA 2** as the base, but keep it trimmed to a clarity-first pass:

- improve the collections index hierarchy:
  - make `Series` vs `Topics` legible at a glance
  - tighten the intro so it explains what collections are for
  - make each card answer: "why enter this lane?" and "where should I start?"
- improve shared card semantics:
  - keep existing `collection-card*` and `collection-meta` hooks
  - preserve room-theme echo styling
  - reorder or rewrite metadata for faster scanning, not more ornament
- improve collection detail framing:
  - keep `Entry Point`, `Reading Progress`, item ordering, and related collections
  - rewrite explanatory copy in plainer editorial language
  - do not change progress behavior, `localStorage` contract, CTA order, or resolver logic

Explicitly defer:

- new schema fields in `data/collections.yaml`
- taxonomy-like expansion
- article continuation redesign
- homepage collections-strip redesign unless a later pass explicitly needs it

## Contracts To Preserve

- Preserve the current collection data model in `data/collections.yaml`, including `slug`, `kind`, `start_here`, `room_theme`, `featured`, `weight`, `description`, `metadata`, and `fallback`.
- Preserve route contracts for `/collections/` and `/collections/:slug/`.
- Preserve reading-progress behavior and storage key contract: `oip-reading-progress:v1:<collection-slug>`.
- Preserve collection resolver rules, explicit-membership precedence, and item-order rules documented in `docs/collections-system.md`.
- Preserve existing collection contract tests unless a prompt explicitly instructs Codex to update them for an intentional, reviewed UI contract change.

## Prompt Set

### Master Prompt

```text
Implement this now.

Goal:
Make the collections system clearer for serious readers by improving the `/collections/` index, shared collection card presentation, and collection detail framing without changing the underlying curated Hugo collections model.

Acceptance Criteria:
- `/collections/` makes the distinction between `Series` and `Topics` immediately legible.
- The page intro explains what collections are for in plain editorial language.
- Each collection card surfaces a clear editorial reason to enter the lane and a visible start-here cue when available.
- Collection detail pages explain the lane, entry point, and reading-progress surfaces more clearly without changing their behavior.
- Existing `room_theme` styling, reading-progress logic, analytics source slots, routes, slugs, and resolver behavior remain intact.
- No taxonomy migration, no new collection schema, and no unrelated route changes.

Constraints:
- Preserve the current dark editorial visual language.
- Keep collections data-driven through `data/collections.yaml`.
- Reuse existing namespaces and partials where possible instead of inventing a parallel system.
- Do not remove or break the existing collection contract tests unless you intentionally update them to match a reviewed contract change.
- Use the repo-local wrappers under `tools\bin\generated\`.

Method:
1. Inspect the current collection system before editing:
   - `data/collections.yaml`
   - `layouts/collections/list.html`
   - `layouts/partials/discovery/collection-card.html`
   - `layouts/collections/single.html`
   - `docs/collections-system.md`
   - `tests/collection_reading_path_contract.test.mjs`
   - `tests/collection_room_themes_contract.test.mjs`
2. Implement a clarity-first pass only:
   - improve list-page framing and group hierarchy
   - improve collection-card scan order and entry cues
   - improve collection-detail explanatory copy and section framing
3. Keep all collection resolver, progress, and room-theme mechanics stable unless a change is explicitly required by the acceptance criteria.
4. Update docs/tests only if selectors or copy contracts changed intentionally.

Validation:
- `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_collections.ps1`
- `.\tools\bin\generated\hugo.cmd --gc --minify`
- `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_route_smoke.ps1`
- `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`
- `.\tools\bin\generated\node.cmd --test tests/collection_reading_path_contract.test.mjs tests/collection_room_themes_contract.test.mjs`

Deliverable:
1. What changed
2. Validation run
3. Risks / follow-ups
4. Exact files touched
```

### Follow-Up Prompt 1: Collections Index IA

```text
Implement this now.

Goal:
Tighten the information architecture of `/collections/` only.

Acceptance Criteria:
- The collections intro clearly explains what a collection is in this site.
- `Series` and `Topics` feel meaningfully different in presentation and copy.
- The route remains a unified directory; do not reintroduce a featured strip or a neutral row index.
- Shared card reuse remains intact.

Constraints:
- Limit scope to the collections index route and any shared collection-card changes required to support it.
- Do not change collection resolver logic, collection detail structure, or homepage behavior.
- Preserve current room-echo card theming.

Validation:
- `.\tools\bin\generated\hugo.cmd --gc --minify`
- Spot-check `/collections/`
- Run any affected collection contract tests

Deliverable:
1. What changed
2. Validation run
3. Risks / follow-ups
4. Exact files touched
```

### Follow-Up Prompt 2: Collection Card Clarity

```text
Implement this now.

Goal:
Make shared collection cards easier to scan without changing the collections data model.

Acceptance Criteria:
- Card title, description, piece count, kind, and start-here cue appear in a clearer reading order.
- Cards still use the existing `collection-card*` / `collection-meta` system and analytics attributes.
- `room_theme` echo variants remain supported.
- No new required fields are added to `data/collections.yaml`.

Constraints:
- Prefer using existing collection fields (`title`, `description`, `kind`, `start_here`, `metadata`) over inventing new schema.
- Do not change collection URLs or route selection.

Validation:
- `.\tools\bin\generated\hugo.cmd --gc --minify`
- Spot-check `/collections/` and one collection detail page that renders related collections
- Run affected collection contract tests

Deliverable:
1. What changed
2. Validation run
3. Risks / follow-ups
4. Exact files touched
```

### Follow-Up Prompt 3: Collection Detail Clarity

```text
Implement this now.

Goal:
Improve collection detail page clarity and orientation for first-time serious readers.

Acceptance Criteria:
- The collection header explains what the lane is and how to enter it in plainer language.
- The `Entry Point`, `Reading Progress`, `In This Collection`, and `Related Collections` sections feel more purposeful and less repetitive.
- The current progress logic, resume logic, localStorage key, CTA order, and reading-path data hooks remain unchanged.

Constraints:
- Keep the existing `collection-room*`, `collection-progress*`, `collection-item*`, and `collection-pill*` contracts unless an intentional contract update is required.
- Do not redesign article-page continuation modules in this pass.

Validation:
- `.\tools\bin\generated\hugo.cmd --gc --minify`
- `.\tools\bin\generated\node.cmd --test tests/collection_reading_path_contract.test.mjs tests/collection_room_themes_contract.test.mjs`
- Spot-check one collection detail route and one member article

Deliverable:
1. What changed
2. Validation run
3. Risks / follow-ups
4. Exact files touched
```

### Follow-Up Prompt 4: Docs and Contracts Sync

```text
Implement this now.

Goal:
Bring the collections documentation and contract tests into sync with the intentional UI contract after the clarity-first collections pass.

Acceptance Criteria:
- `docs/collections-system.md` reflects the final list/detail/card behavior.
- Any selector or copy contracts changed intentionally are updated in the appropriate tests.
- No accidental drift remains between templates, CSS ownership, and collection docs.

Constraints:
- Only update docs/tests that correspond to deliberate behavior changes already implemented.
- Do not broaden scope into unrelated layout docs.

Validation:
- `.\tools\bin\generated\node.cmd --test tests/collection_reading_path_contract.test.mjs tests/collection_room_themes_contract.test.mjs`
- `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`

Deliverable:
1. What changed
2. Validation run
3. Risks / follow-ups
4. Exact files touched
```

### Follow-Up Prompt 5: Code Review Prompt

```text
Do a code review for the collections-page clarity pass.

Prioritize findings:
- regressions in Hugo route/template behavior
- breakage in collection resolver assumptions
- broken or weakened progress / resume / analytics contracts
- visual regressions caused by CSS namespace drift
- missing test or docs updates

Output findings first, sorted by severity, with file/line references.
If no issues are found, say so explicitly and list residual risks or test gaps.
```

## Validation Expectations

For any implementation run driven by these prompts:

- verify the Hugo data-driven model still resolves collections from `data/collections.yaml` and does not introduce taxonomy behavior
- verify `/collections/` still renders grouped `Series` and `Topics`
- verify one collection detail page still shows `Entry Point`, `Reading Progress`, ordered items, and related collections
- verify one collection-member article still renders its existing collection context / continuation surfaces unchanged unless explicitly scoped otherwise
- run the repo's collection audit, Hugo build, public route smoke test, public HTML output test, and the collection contract tests
- manually spot-check `/collections/`, one collection detail route, and one member article after the build

## Source Grounding

### Hugo

- Hugo selects list vs single templates by lookup order, so prompts should target the existing route templates and partials instead of inventing a new route model.
  Source: [Template lookup order](https://gohugo.io/templates/lookup-order/)
- Hugo supports the current data-driven registry through the `data` directory, which fits the repo's `data/collections.yaml` system.
  Source: [Data sources](https://gohugo.io/content-management/data-sources/)
- Hugo templating is already the correct mechanism for this work; no CMS or remote-data shift is needed.
  Source: [Introduction to templating](https://gohugo.io/templates/introduction/)

### Codex and Prompting

- Use direct, structured prompts with explicit constraints and validation.
  Sources: `CODEX_WORKFLOW.md`, `AGENTS.md`
- Keep prompts simple and direct, use delimiters and clear section titles, and be specific about the end goal.
  Source: [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices)
- Separate role or tone guidance from task details, and treat prompts as reusable, versioned artifacts.
  Source: [Prompting guide](https://developers.openai.com/api/docs/guides/prompting)

### Repo-Specific Collections Model

- Collections are curated lanes, not generic taxonomy, and already have documented resolver rules and contract tests.
  Sources:
  - `docs/collections-system.md`
  - `docs/layout-ownership-matrix.md`
  - `docs/publishing-workflow.md`
  - `tests/collection_reading_path_contract.test.mjs`
  - `tests/collection_room_themes_contract.test.mjs`

## Note

This document is for future implementation and review work.
It is not itself a collections redesign brief for general website strategy.
Use it when you want Codex to execute a bounded collections clarity pass that respects the current Outside In Print editorial model.
