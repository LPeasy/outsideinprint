# Shared site card

The canonical generic share image is `/images/brand/outside-in-print-share.png`: an opaque 1200 × 630 PNG, solid black with the two-line OUTSIDE / IN PRINT masthead in the site's `--oip-paper` color (`#EADBC1`). No subtitle, border, illustration, or additional copy.

The masthead currently loads no web fonts. The renderer uses its Georgia Bold system fallback, `.16em` tracking, and proportional line spacing. Regenerate on macOS from the repository root with `swift scripts/render_brand_share_card.swift`; the finished PNG is checked in, so production needs no font installation or rendering dependency.

`data/organization.yaml` owns the image, descriptive alt text, and explicit legacy-card aliases. The metadata resolver maps only those named generic cards to the canonical image. Open Graph, Twitter, and JSON-LD use the same result. Actual article illustrations, portraits, book covers, games artwork, and the homepage's selected cartoon retain their existing precedence. Article bodies, dates, and collection membership are unchanged.

The legacy files under `static/images/social/` remain byte-identical for historical links and the frozen migration contract. The new URL avoids reusing their cached image URLs. Existing social posts can retain cached previews until their provider refreshes them.
