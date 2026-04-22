# Collections System

Outside In Print uses collections as curated editorial reading lanes, not as a broad taxonomy layer.
Hugo taxonomies remain disabled in `hugo.toml`, so every collection is defined intentionally in `data/collections.yaml` and resolved through the `layouts/partials/collections/*` helpers.

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
- `room_theme`: optional presentation key reused by collection-detail reading rooms and the article light-accent layer.
- `description`: short editorial framing used on index, detail, and homepage strips.
- `metadata`: optional reader-facing label/value pairs.
- `fallback`: legacy matching fields (`series`, `topics`, `tags`, `sections`).

## Page front matter

Collections use these page params:

- `collections`: array of collection slugs. If present, this is the source of truth.
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

1. If a page has `collections`, only those explicit memberships count.
2. If a page has no `collections`, fallback matching may be used.
3. If a collection has `explicit_only: true`, fallback is never used for that collection.
4. Public listings require `public: true` and either `count >= min_items` or `force_public: true`.
5. Collection item order is `collection_weight` ascending, then date descending.

## Templates touched by the system

- `layouts/collections/list.html`: unified public collections card directory grouped into `Series` and `Topics`.
- `layouts/collections/single.html`: individual collection page.
- `layouts/index.html`: featured collections strip.
- `layouts/_default/single.html`: article header and aftermatter, including the primary-collection light-accent context, the article-exit continuation zone for collection-member pages, and the fallback `Read Next` path for standalone pages.
- `layouts/partials/collections/reading-path.html`: server-rendered article continuation zone for the first public collection match only.
- `layouts/partials/collections/collection-progress.html`: collection-page browser-local progress and resume module.
- `layouts/partials/collections/reading-progress-script.html`: client-only progress enhancer shared by article and collection pages.

## Reading path and progress

Collections now support two reader-facing sequence layers that reuse the existing resolver and ordering rules.

### Article pages

- A collection-member article renders exactly one article-exit continuation zone.
- The module always uses the first public match from `layouts/partials/collections/resolve-page-collections.html`.
- Eligible collection-member articles also render a compact `From the Collection` header context keyed to that same first public match.
- The article light-accent layer uses `room_theme` only for restrained article chrome:
  - the header context block
  - the continuation module
- The article body, hero, citation, author card, newsletter, and standalone `Read Next` styling remain neutral.
- The separate mounted collection-membership block is no longer part of the article-member flow.
- Standalone articles keep the existing `Read Next` fallback.
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

- Each collection page renders a browser-local `Reading Progress` panel above `In This Collection`.
- The panel does not use cookies, a backend, or analytics state.
- Each collection row can show a `Visited` marker when the current browser has already opened that piece.
- Collection detail pages no longer render the old `How to Use This Collection` overview block.
- Collection detail pages may also apply an explicit per-collection reading-room treatment via `room_theme`.
- Article pages may reuse `room_theme` only for the compact primary-collection light-accent layer.
- The `/collections/` route now renders one unified directory of room-echo cards for every visible collection.
- That directory groups cards under `Series` and `Topics` only; it does not render a separate featured strip or a neutral row index.
- The collections index route ignores `featured`; homepage and other existing featured surfaces may still use it.
- The full room system remains collection-detail-page only. Homepage, collection index, library, and article-body styling do not inherit these themes.
- The room layer changes visual atmosphere only:
  - background field
  - panel material
  - border / divider language
  - tonal accents
  - header and section framing
- It does not change collection ordering, progress logic, CTA order, or shared section structure.

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

### Resume logic

The collection-page resume link is deterministic:

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
4. Run `powershell -ExecutionPolicy Bypass -File .\scripts\audit_collections.ps1`.
5. Run `.\tools\bin\generated\hugo.cmd --gc --minify` and verify `/collections/`, the collection page, and at least one member page.

## Auditing

Use the audit script to review collection health and candidate assignments:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\audit_collections.ps1
```

The script writes `reports/collections-audit.md` by default. It does not auto-write membership assignments.
