# Collections System

Outside In Print uses collections as curated editorial reading lanes, not as a broad taxonomy layer.
Hugo taxonomies remain disabled in `hugo.toml`, so every collection is defined intentionally in `data/collections.yaml` and resolved through the `layouts/partials/collections/*` helpers.

For a ready-to-run Codex implementation brief and follow-up prompt sequence for future clarity work on `/collections/`, see `docs/collections-clarity-prompt-set.md`.

## Editorial rules

- Collections are curated lanes, not generic categories.
- Not every essay should belong to a collection.
- A topic collection should usually have at least 3 strong pieces before it is listed publicly.
- A series collection may go live with 2 connected pieces.
- One piece should belong to at most 2 collections.
- Explicit front matter membership is authoritative.
- Fallback matching exists only for legacy support.
- New pieces need at most one strong collection choice, with a second only when it genuinely fits. A piece without a suitable collection keeps the Library fallback; do not create essay-to-essay recommendation pairs.
- The September 2026 coverage pass, exact assignments, deliberate exclusions, and separate editorial follow-ups are recorded in [Collection continuation audit](collection-continuation-audit.md).

## Data model

Each collection in `data/collections.yaml` supports these fields:

- `slug`: public URL key.
- `title`: reader-facing label.
- `kind`: `topic` or `series`.
- `public`: whether the collection is intended for reader-facing use.
- `force_public`: optional override that allows a public collection to stay listed before it reaches `min_items`.
- `min_items`: minimum resolved piece count before public listing.
- `explicit_only`: disables fallback matching when true.
- `featured`: legacy featured-surface metadata retained for compatibility; the active homepage and `/collections/` directory do not use it for ordering or presentation.
- `weight`: ordering control for collection listings.
- `start_here`: optional page slug that gets a dedicated callout.
- `room_theme`: legacy metadata retained for compatibility. Current collection index and detail pages do not consume it for presentation.
- `description`: short editorial framing used on collection index and detail surfaces.
- `metadata`: optional reader-facing label/value pairs.
- `fallback`: legacy matching fields (`series`, `topics`, `tags`, `sections`).

## Page front matter

Collections use these page params:

- `collections`: array of collection slugs. If present, this is the source of truth and its order controls article-page collection display.
- `series`: legacy fallback support for collections that still resolve via series names.
- `collection_weight`: optional ascending order within a collection. If missing, date descending is used.

Example:

```yaml
collections:
  - risk-uncertainty
  - reported-case-studies
collection_weight: 20
```

## Resolver behavior

Resolver entry points:

- `layouts/partials/collections/resolve-items.html`
- `layouts/partials/collections/resolve-page-collections.html`

Resolution rules:

1. If a page has `collections`, only those explicit memberships count, and their front matter order is preserved.
2. If a page has no `collections`, fallback matching may be used.
3. If a collection has `explicit_only: true`, fallback is never used for that collection.
4. Public listings require `public: true`, either `count >= min_items` or `force_public: true`, and an eligible published `content/collections/<slug>.md` page. Counts include only published members: not draft, article date and release date no later than the build clock, and no elapsed expiry date. This also applies to public navigation in preview builds.
5. Collection item order is `collection_weight` ascending, then date descending.
6. `resolve-items.html` retains raw resolution by default for editorial audits; `publishedOnly: true` filters it through `collections/is-published.html`. Public article resolution, directory entries, collection details, and collection schema use filtered membership.

## Templates touched by the system

- `layouts/collections/list.html`: broadsheet directory grouped into `Series` and `Topics`, with compact ruled rows rather than a card grid.
- `layouts/collections/single.html`: individual collection page rendered as a newspaper section front.
- `layouts/_default/single.html`: article header and aftermatter, including the compact collection boundary in the article record rail and the standard reading continuation before publication records.
- `layouts/partials/collections/reading-path.html`: server-rendered collection-first continuation with a Library fallback. The homepage retains Library discovery, not a collections strip.
- `layouts/partials/collections/collection-progress.html`: legacy browser-local progress panel partial retained for compatibility, but not mounted by collection pages.
- `layouts/partials/collections/reading-progress-script.html`: client-only progress enhancer for article continuation modules.

## Reading path and progress

Collections provide subject or series continuation at article endings and centrally maintained starting points on collection pages.

### Article pages

- Three manually selected pieces have a focused exit instead of the full collection continuation: the Jack Stratton profile, *A Thousand Brick Walls*, and *What Is Risk? A Four-Part Framework*. `data/featured_continuations.json` owns one existing reading route and two connection sentences per source page. `article/featured-continuation.html` renders one reading link and one Studio inquiry link; it does not rank or discover recommendations. The reading route must resolve to a published page. These route-bound choices are independent of the homepage selection.
- The two existing collection continuations retain their `article_continuation_primary` / `collection_click` metadata and collection slugs. Jack's manually selected Benjamin Franklin recommendation uses `internal_promo_click` in that same primary slot. Studio links retain `studio_sample_exit` for Jack and use the existing `article_exit_paths` slot on the other two pieces; no new analytics event is introduced.
- Jack's Studio production note remains, but its standalone inquiry CTA is suppressed when the focused exit supplies that link. Other Studio sample exits stay unchanged. On these explicitly featured routes, existing newsletter prompts, forms, and final archive links are unchanged; no signup block is added. These are navigation-only changes, not revisions to the article bodies or citation records.

- Standard reading pages render exactly one continuation immediately after the body, before the Modern Bios record, publication record, and existing canonical newsletter signup. Standard means a single page in essays, syd-and-oliver, reports, or working-papers without a custom featured continuation or Studio sample. Informational and shop pages are excluded.
- Standard pages omit the redundant compact newsletter prompt and `Article paths` row. Explicitly featured continuations and Studio samples retain their existing endings.
- Select the first eligible topic collection, otherwise the first eligible series. Within a kind, preserve front-matter preference order. Eligibility requires a public published collection, its configured minimum or existing override, the current article, and at least one other published member.
- Header collection links remain in front-matter order, independently of topic preference in the continuation. The header's primary collection metadata therefore continues to describe the first public header match.
- Collections influence article pages only through compact boundary modules:
  - the header record rail collection boundary
  - the continuation module
- The article body, hero, publication record, citations, revision history, and editorial form variants remain unchanged.
- The separate mounted collection-membership block is no longer part of the article-member flow.
- The standard continuation displays `More on [title]` for topics or `More from [title]` for series, the collection's plain-text description, and exactly one native `Explore all [N] pieces →` link. The count includes the current article. There is no automatic next-essay recommendation or secondary collection link.
- Without an eligible collection, including forced-public singletons, show only `Browse the library →`. This fallback uses `internal_promo_click` and `article_exit_paths` with the actual Library destination.
- The collection CTA retains `collection_click` and `article_continuation_primary`, with the actual collection slug and canonical destination. At the September 2026 release cutover, standard primary-slot clicks change from article destinations to collection destinations; preserved custom continuations still lead to articles. Historical secondary-slot events remain historical data; do not rewrite analytics snapshots.
- Article pages no longer display positions, progress counts, remaining pieces or minutes, previous/start actions, a duplicate `Up Next` list, or extra archive/library exits inside this card. Browser-local visit recording remains active without a visible progress node.

### Collection pages

- The `/collections/` route renders a ruled broadsheet directory, not a dominant card grid.
- The directory has one page title/deck and two editorial columns: `Series` and `Topics`.
- Each visible collection appears as a compact `collection-record` row with kind, title, description, piece count, scope metadata, and a quiet `Start here` link when present.
- The index ignores `featured`; the field remains compatibility metadata and is not consumed by the active homepage.
- Individual collection pages render as newspaper section fronts with the actual collection title as the H1 and its description immediately below. Dated analysis retains publication dates; collection promotion does not imply current reporting.
- Bob's Almanack uses a bespoke collection layout and may be listed publicly only when its collection page and at least one issue are published in the same build.
- Bob's Almanack collection-page modules are fed only by committed Hugo data under `data/almanack/`; Hugo templates must not call live APIs during a build.
- The collection page uses:
  - `data/almanack/archive_links.yaml` for deterministic archive shelf marks keyed by short phrases and verified public OIP essay URLs.
  - `data/almanack/archive_link_candidates.yaml` for generated archive-link review candidates. Templates must not consume this file directly.
  - `data/almanack/on_this_day.yaml` for date-keyed historical events with source URLs and a script `generated_at` timestamp.
  - `data/almanack/weather_city_records.yaml` for display-ready Fahrenheit min/mean/max calendar-date aggregates from fixed NOAA/GHCN station IDs since 1990.
  - `data/almanack/world_week.yaml` for ordered, source-linked world-week entries with a script `generated_at` timestamp and review note.
- Run `scripts/update_almanack_modules.ps1` to refresh the whole local data set, or use the focused wrappers `scripts/update_almanack_archive_links.ps1`, `scripts/update_almanack_on_this_day.ps1`, `scripts/update_almanack_weather.ps1`, and `scripts/update_almanack_world_week.ps1`.
- Almanack data scripts cache upstream source responses under `.tmp-almanack-cache/`, support `-RefreshCache`, and support `-ReviewOnly` output under `reports/almanack-data-review/<issue-date>/` before replacing committed Hugo data.
- Section fronts use a label-free ledger line, a promoted `Start Here` entry, an ordered piece list, related collections, and quiet browse links.
- The Start Here item is promoted once and omitted from the contents list immediately below it.
- Collection pages do not render the visible `Reading Progress` panel, browser-local resume panel, visited-row markers, or collection-progress hooks.
- `Related Collections` is framed as adjacent terrain for what to read after finishing the current lane, not as a generic overflow list.
- Collection detail pages no longer render the old `How to Use This Collection` overview block or any per-collection reading-room treatment.
- Article pages may show collection membership only through compact boundary modules; `room_theme` is legacy data and does not drive article or collection-page skins.

### Storage contract

- Progress means visited piece paths in the current browser only.
- The exact `localStorage` key format is `oip-reading-progress:v1:<collection-slug>`.
- The stored JSON shape is:

```json
{
  "visited": ["/collections/member-path/"],
  "updatedAt": "2026-04-18T12:00:00.000Z"
}
```

The article continuation module records visits using its existing data attributes without exposing a progress label. Collection pages no longer expose a progress or resume interface; their retained status/resume helpers and storage format remain compatible.

### Legacy resume logic

The retained legacy collection-progress partial computes a resume link deterministically when mounted:

1. unvisited `start_here` page, if present
2. otherwise the first unvisited piece in collection order
3. otherwise the first piece in collection order

Resume labels are also fixed:

- `Start with <title>` when nothing in the collection is visited
- `Resume with <title>` when some pieces are visited and an unvisited target remains
- `Start Again with <title>` when every piece in the collection is already visited

## Adding a new collection

1. Add the definition to `data/collections.yaml`.
2. Create `content/collections/<slug>.md` if the collection should have a public page.
3. Add explicit `collections` front matter to the few pieces that truly belong.
4. Run `.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_collections.ps1`.
5. Run `.\tools\bin\generated\hugo.cmd --gc --minify` and verify `/collections/`, the collection page, and at least one member page.

## Auditing

`tests/collection_reading_path_behavior.test.mjs` exercises the production Hugo partial with temporary fixtures: topic preference, stable within-kind ordering, series and Library fallbacks, unpublished landings and members, minimum counts, preview exclusions, and current membership. It also checks collection descriptions, duplicate-free Start Here rendering, raw audit resolution, the unchanged progress storage contract, and the standard-versus-featured/Studio exit boundary. Node and PowerShell contracts cover markup and analytics. GitHub runs the Node checks; local publishing gates remain Hugo/PowerShell as documented in `docs/local-validation-policy.md`.

Membership-only maintenance must preserve all article text and unrelated metadata. The documented publishing-policy exemption applies only to verified ref-to-ref allowlisted front-matter-only diffs; run the actual committed base/head guardrail. An explicit full-content audit can reveal separate legacy findings, but this release neither repairs them silently nor creates audit PASS records. Maintain `start_here` and descriptions in the collection definition; additional per-article ranking work is not required.

Use the audit script to review collection health and candidate assignments:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_collections.ps1
```

The script writes `reports/collections-audit.md` by default. It does not auto-write membership assignments.
