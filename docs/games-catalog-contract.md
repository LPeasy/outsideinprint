# Games Catalog Contract

`Games` is a descriptive website category operated by Outside In Print LLC. It is not a DBA, separate publisher, or separate legal identity.

## Lifecycle

This bounded candidate publishes only `/games/` and `/games/idle-times/`. The catalog contains one record: Idle Times, linked to its public brief.

The candidate tree contains no other game record or content route. It also contains no trailer, price, checkout, account creation, email capture, or game download.

## Controlled actions

The catalog contract accepts only `disabled`, `browser_play`, `external_wishlist`, and `external_purchase`. External actions require HTTPS, an allowlisted storefront hostname, and no query string or fragment. The Idle Times candidate uses only:

`https://store.steampowered.com/app/4978200/Idle_Times/`

The website never changes a state automatically based on a date. Steam controls actual availability.

## Identity and support

Each record must use `Outside In Print LLC` as the operator and `support@outsideinprint.org` as the support address. Product copy says the games are operated and supported by the LLC. It does not claim that the LLC created all pre-LLC work or that Steam has verified the LLC as seller, payee, or tax party. The release makes no statement about the Steam account's legal, seller, payee, tax, or bank identity.

## Media allowlist

The October 8, 2026 refresh uses the seven owner-approved desktop-author screenshots already published in Steam Store revision 10, plus the cursor Bob/newsprint Main Capsule published in revision 12. The game represented is 1.0.1. Source identities, dimensions and SHA-256 values are recorded in [games-idle-times-1.0.1-media.json](games-idle-times-1.0.1-media.json). The website change is prepared for review; this document does not establish its deployment.

The approved Pet-on-desktop screenshot is the hero on both Games routes. The other six screenshots and personality capsule form the detail gallery. Sharing metadata uses the personality capsule. The existing responsive image renderer creates bounded AVIF/WebP variants and a processed JPEG sharing image; full-size source PNGs remain unpublished.

Current copy presents Full Desk, Mini Companion and Pet Bob, playful cursor interactions, JUKE-BOB, 114 illustrated rewards, eight original tracks, the draggable gallery and Robert V. Ussley's connection to Outside In Print. The compact catalog shows the first three benefits; the detail page shows all five. Removed claims include resizable Pet Desk, the retired search/unread gallery controls and a guaranteed weekly free-editions schedule. Purchase links and their four approved UTM source slots, LLC/support identity, system requirements, local-play statement, AI/music and mature-content disclosures remain intact.

## Historical media

The October 4, 2026 refresh used six reviewed 0.2.5 resources. Their original receipt remains in [games-idle-times-0.2.5-media.json](games-idle-times-0.2.5-media.json). These sources are preserved but are no longer selected by the current catalog:

| Resource | Role | SHA-256 |
|---|---|---|
| `idle-times-0.2.5-main-capsule.png` | title capsule | `c9b267381be2dfcb1024773c38e99f8fe62d4f60bb4553b057edac331d12ef6e` |
| `idle-times-0.2.5-01-full-desk.png` | Full Desk hero | `8484dfc29dd454f03b072fd55cb09fb1330b0320ccfef1917ee27d935d419856` |
| `idle-times-0.2.5-02-printing.png` | Bob working the press | `d33f054beedc798626ae644bc4a936d287c5e2815365618d98ff53edccbc4abc` |
| `idle-times-0.2.5-03-pressroom-radio.png` | original soundtrack playlist | `df7b59d4e9dccf281afb8c5e146632f636022c7ce0a4d24a58555a05a9c8e7ef` |
| `idle-times-0.2.5-04-comic-collections.png` | collection shelf | `60499e3c579a2b3e72126be8bdcf31a319dde9b4ce21161df637f7b9c998d75e` |
| `idle-times-0.2.5-05-comic-reader.png` | comic reader | `e641a796ae89eaad3751b833436d22e8f6b1122e5d283d2888815eb2fbcc5d8e` |

No new tracks, illustration additions, storefronts or soundtrack entitlements are introduced by the website refresh.

These historical sources remain byte-identical to their original approved set and are no longer selected by the current catalog. Preserve them for the frozen responsive-image migration contract:

| Resource | Role | SHA-256 |
|---|---|---|
| `idle-times-main-capsule.png` | title capsule | `5797e830c285688a3e5f6840fd189d8281ad31320af2388074fb3016ee853109` |
| `idle-times-packaged-desk-1920x1080.png` | Full Desk capture | `0d5c4e1d01f10f4e8d070db2ce555c55d66655f1ecfd66df4adbfd38eef7b339` |
| `idle-times-packaged-library-1920x1080.png` | Comic Shelf capture | `0eac2dd310f4a6365666f1662b814ad28d6b8ee3e3558ddf3947fd1658a7b954` |

## Metadata

Games pages use generic `WebPage` metadata only. `Product`, `Offer`, `SoftwareApplication`, and `VideoGame` schema are not permitted in this release.
