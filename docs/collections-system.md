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
- `featured`: allows the collection to appear in featured strips.
- `weight`: ordering control for collection listings.
- `start_here`: optional page slug that gets a dedicated callout.
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

- `layouts/collections/list.html`: public collections index.
- `layouts/collections/single.html`: individual collection page.
- `layouts/index.html`: featured collections strip.
- `layouts/_default/single.html`: restrained "Part of this collection" block.

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
