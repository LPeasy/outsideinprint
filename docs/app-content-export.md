# App content export

Hugo publishes `/app/v1/catalog.json` and revision-addressed reader JSON under `/app/v1/articles/`. The export includes eligible Library pieces, Almanack issues, public book samples, the public Gallery, collection membership, and public JukeBob metadata. Managed originals and paid book files are never exported.

The existing `books` field contains sample entries for older clients. The optional `bookCatalog` field contains bookstore metadata and sample IDs. It is derived from published product pages and the bookstore data, and links a sample only when that sample is eligible for the app feed. `offlineGalleryComplete` indicates that the exported artwork inventory includes the public Gallery.

## Curating the app front page

Edit `data/app_front_page.json` through the normal website publication workflow. The file is independent of the website homepage.

```json
{
  "schemaVersion": 1,
  "lead": { "mode": "latest" },
  "selectedIds": [
    "/essays/why-daylight-saving-time/",
    "/essays/the-coin-slot-on-the-corner/",
    "/essays/the-noise-of-the-crowd/"
  ]
}
```

`latest` chooses the newest eligible piece. To pin a different piece, use `"lead": { "mode": "pinned", "id": "/essays/why-daylight-saving-time/" }`. Supporting IDs are ordered. The app shows the first two after excluding the lead, with any later selections available as fallbacks. The build rejects duplicates, missing or unpublished IDs, Almanack issues, and samples in these editorial slots.

## Validation and release

IDs use an explicit `content_id` when supplied and otherwise use the canonical route. Preserve an explicit ID when renaming a route. Article revisions hash rendered reader HTML. The catalog revision covers content, front-page curation, bookstore metadata, and artwork. Clients validate updates before replacing the last good cached edition.

A local app-only render uses `hugo --renderSegments app`. Normal production builds include the export automatically. Validate with `python3 tests/test_app_catalog.py --site-dir public --clock <build-clock>`. On a full site build, the validator also compares exported artwork URLs with the generated Gallery. The deploy workflow runs this output check after Hugo. Publish through the website's checked PR, `release-ready`, and production deployment gates.
