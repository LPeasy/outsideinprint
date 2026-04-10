# Imported Medium Media Follow-Up

## Confirmed Issue

The imported-media regression came from Medium-imported essays whose markdown still referenced `https://cdn-images-1.medium.com/...` URLs while their localized media folders under `static/images/medium/<slug>/` were empty.

The importer reports already recorded the failure mode:

- `biter-the-slang-word-that-hits`
- `rethinking-invasive-species-management`
- `camp-mystic-evacuation-timeline-guadalupe-river-flash-flood-july-4-2025`

Each of those essays showed `media_fetch_failed` warnings during import, but the prior importer behavior still marked the entry as converted. This PR removes the runtime Medium dependency for the three blocking essays and adds guardrails so future imports fail before that state can be committed again.

## Current Unblock Strategy

The three blocked essays now ship localized placeholder SVG assets in `static/images/medium/<slug>/` so the public site no longer depends on Medium CDN image availability for those pages.

## Recommended Future Path

Run one repo-wide assessment before any mass cleanup:

1. Scan every essay with `medium_source_url`.
2. Compare markdown image references against files present in `static/images/medium/<slug>/`.
3. Produce a prioritized backlog of essays with missing originals, duplicate placeholders, or unresolved external image dependencies.

That assessment should be the single decision point for any broader backfill of the remaining imported Medium essays.
