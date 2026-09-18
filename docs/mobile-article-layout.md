# Compact mobile article opening

COA 2 preserves the illustrated article opening while reducing the distance to
the writing. It applies only at viewport widths up to and including 768px, and
only to single pages in `essays`, `syd-and-oliver`, `reports`, and
`working-papers`. The base layout identifies those pages with
`article-reading-page` on the body.

The mobile contract is:

- A shorter compressed masthead and tighter opening gaps; no article fleuron.
- A single-column article header through 768px, including the tablet boundary.
- A headline size of `clamp(1.875rem, 4.2vw, 2rem)` (30–32px at the default
  root size).
- Visible, uncropped opening artwork, limited to 180px high and a 20rem-wide
  slot. Natural image proportions, existing fullscreen interaction, and image
  credits remain intact.
- Responsive `sizes` describes that smaller mobile slot; desktop source-size
  hints remain unchanged.
- Article wording, body typography, publication records, homepage, About,
  bookstore, and desktop arrangement are unchanged.

`tests/article_mobile_layout.test.mjs` covers the source contract. With
`OIP_SITE_DIR` pointing to a production Hugo build, it also checks representative
published headers and excluded routes. Supplying
`OIP_ARTICLE_BASELINE_SITE_DIR` enables byte-for-byte comparisons of article
bodies and publication records against an earlier build, without freezing future
editorial changes in permanent content snapshots.

Browser validation remains necessary for computed dimensions and interaction:
check 320px, 360px, 390px, and 768px in both themes, plus a desktop comparison.
Confirm no horizontal overflow or wordmark/control collisions, proportional
artwork, visible credits, keyboard opening and closing of the fullscreen image,
and focus returning to the original image button. Long titles can still require
scrolling before prose; the contract does not promise that every article's first
paragraph fits in the initial viewport.
