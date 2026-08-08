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

Only these Idle Times page resources are approved for the bounded candidate:

| Resource | Role | SHA-256 |
|---|---|---|
| `idle-times-main-capsule.png` | title capsule | `5797e830c285688a3e5f6840fd189d8281ad31320af2388074fb3016ee853109` |
| `idle-times-packaged-desk-1920x1080.png` | Full Desk capture | `0d5c4e1d01f10f4e8d070db2ce555c55d66655f1ecfd66df4adbfd38eef7b339` |
| `idle-times-packaged-library-1920x1080.png` | Comic Shelf capture | `0eac2dd310f4a6365666f1662b814ad28d6b8ee3e3558ddf3947fd1658a7b954` |

## Metadata

Games pages use generic `WebPage` metadata only. `Product`, `Offer`, `SoftwareApplication`, and `VideoGame` schema are not permitted in this release.
