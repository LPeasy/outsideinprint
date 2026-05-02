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

## Data model

Each collection in `data/collections.yaml` supports these fields:

- `slug`: public URL key.
- `title`: reader-facing label.
- `kind`: `topic` or `series`.
- `public`: whether the collection is intended for reader-facing use.
- `force_public`: optional override that allows a public collection to stay listed before it reaches `min_items`.
- `min_items`: minimum resolved piece count before public listing.
- `explicit_only`: disables fallback matching when true.
- `featured`: allows the collection to appear in featured strips such as the homepage; `/collections/` does not use this field for ordering or presentation.
- `weight`: ordering control for collection listings.
- `start_here`: optional page slug that gets a dedicated callout.
- `room_theme`: legacy metadata retained for compatibility. Current collection index and detail pages do not consume it for presentation.
- `description`: short editorial framing used on index, detail, and homepage strips.
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
4. Public listings require `public: true` and either `count >= min_items` or `force_public: true`.
5. Collection item order is `collection_weight` ascending, then date descending.

## Templates touched by the system

- `layouts/collections/list.html`: broadsheet directory grouped into `Series` and `Topics`, with compact ruled rows rather than a card grid.
- `layouts/collections/single.html`: individual collection page rendered as a newspaper section front.
- `layouts/index.html`: featured collections strip.
- `layouts/_default/single.html`: article header and aftermatter, including the compact collection boundary in the article record rail, the article-exit continuation zone for collection-member pages, and quiet final article links.
- `layouts/partials/collections/reading-path.html`: server-rendered article continuation zone for the first public collection match only.
- `layouts/partials/collections/collection-progress.html`: legacy browser-local progress panel partial retained for compatibility, but not mounted by collection pages.
- `layouts/partials/collections/reading-progress-script.html`: client-only progress enhancer for article continuation modules.

## Reading path and progress

Collections now support two reader-facing sequence layers that reuse the existing resolver and ordering rules.

### Article pages

- A collection-member article renders exactly one article-exit continuation zone.
- The module always uses the first public match from `layouts/partials/collections/resolve-page-collections.html`.
- Eligible collection-member articles also render compact collection links in the article record rail keyed to that same first public match.
- When an article has two public explicit collections, the article record rail lists both collection names in front matter order. The first public match still controls the continuation module.
- Collections influence article pages only through compact boundary modules:
  - the header record rail collection boundary
  - the continuation module
- The article body, hero, publication record, final article links, and editorial form variants remain neutral.
- The separate mounted collection-membership block is no longer part of the article-member flow.
- Standalone articles use the same quiet final article links as collection-member articles.
- The continuation zone shows:
  - `Continue This Collection`
  - linked collection title
  - `Piece N of M`
  - `Visited X of M in this browser.`
  - `Remaining after this piece: X pieces | Y min`
  - `Entry Point` when the current page is the collection entry point
  - `New to this thread? Start at <link>.` when the collection defines `start_here` and the current page is not it
  - a fixed action row:
    - mid-collection: `Continue to <next title>`, `View Collection`, and `Previous piece` when available
    - end-of-collection: `View Collection`, `Start Again with <title>`, and `Previous piece` when available
  - an `Up Next` preview row showing the next one or two pieces in order with sequence number and reading time
  - `Browse collections` and `Search the library` as archive exits

### Collection pages

- The `/collections/` route renders a ruled broadsheet directory, not a dominant card grid.
- The directory has one page title/deck and two editorial columns: `Series` and `Topics`.
- Each visible collection appears as a compact `collection-record` row with kind, title, description, piece count, scope metadata, and a quiet `Start here` link when present.
- The index ignores `featured`; homepage and other existing featured surfaces may still use that field.
- Individual collection pages render as newspaper section fronts with the actual collection title as the H1.
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

The active reader-facing use is the article continuation module. Collection pages no longer expose a progress or resume interface.

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

Use the audit script to review collection health and candidate assignments:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_collections.ps1
```

The script writes `reports/collections-audit.md` by default. It does not auto-write membership assignments.
