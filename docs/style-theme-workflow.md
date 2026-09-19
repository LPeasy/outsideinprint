# Style Theme Workflow

Outside In Print keeps global visual tuning in the fingerprinted Hugo stylesheet at `assets/css/main.css`.

## Preset Names

Saved style presets use a descriptive word plus a timestamp:

`oip-theme-<area>-<descriptor>-YYYYMMDD-HHMMSS`

Examples:

- `oip-theme-rules-classic-20260429-115754`
- `oip-theme-rules-clear-20260429-115754`
- `oip-theme-rules-print-20260429-161813`

Use the timestamp from the planning or implementation session that created the saved comparison set.

## Active Values

The active site-wide values live on `:root`.

When introducing a new preset:

1. Save the outgoing values in a timestamped preset class.
2. Save the incoming values in a timestamped preset class.
3. Copy the incoming values onto `:root` if the new preset should become the default.
4. Keep the saved preset classes in the stylesheet so future work can compare or temporarily apply them in browser devtools.

Runtime theme switching is allowed only through the approved public theme selector in the shared masthead. Keep the selector CSS-token based, use `html[data-theme="light"]` and `html[data-theme="dark"]`, bootstrap the theme before the fingerprinted stylesheet loads, and persist only `light` or `dark` in `localStorage["oip-theme"]`.

The homepage is the only surface that should use the full ceremonial OIP masthead. Its left deck contains Essays, Reports, and Literature. All other pages use the compact shared masthead. At mobile widths, both variants reduce ceremonial spacing and type scale while preserving 44px controls. The compact masthead is the site imprint; page titles, collection titles, article titles, and the Bob's Almanack issue nameplate should carry the page-specific hierarchy.

At 768px and below, the homepage's `.masthead-controls` places the compact proof group between Paper Bob and the theme toggle above the unchanged wordmark. Both buttons remain 44px controls; the proof has no banner frame. Desktop and compact-page controls keep their existing positions. The homepage reader note uses three always-visible sentences describing what the imprint publishes, what readers gain, and an invitation to step away from doomscrolling, ads, and algorithmic feeds, with its existing typography and no disclosure control or script. Imprint and author links remain beneath the note, in equal-width mobile columns. Featured metadata items cannot split internally; decorative slashes disappear through 360px.

The homepage body uses a 70rem desktop measure for the reader note, Featured Articles, library navigation, newsletter signup, and contributor button. The stats-only `home_reader_banner.html` partial appears only inside the homepage `.masthead-controls`, between Paper Bob and the theme toggle, above the Outside In Print wordmark. `.masthead-proof` has no separate border or background and flexes up to 42rem. Above 400px it has three compact cells. At 400px and below, Articles and Readers occupy two short rows beside a full-height Weekly Newsletter link; Readers displays the `10k+` alias from `data/homepage_metrics.yaml` while preserving its full figure for accessibility. The newsletter link retains a 44px tap target. `home_reader_newsletter.html` owns the separate signup region after the library controls while retaining the existing `home-reader-banner*` signup hooks. The `.home-v2-library.home-v2-next__links` navigation carries only Browse the library and Surprise me, using 44px controls and the shared wide page shell. The final `.home-v2-next` region contains only the existing 44px `.home-v2-next__cta` button linking to `/contribute/`, centered with `display:flex` and `justify-content:center`. Its wrapper has a `.5rem` top margin, no border, and no background; it has no article wrapper or supporting copy. Preserve these alignments and narrow-screen fallbacks when changing spacing or divider rules.

Within Featured Articles, the lead and newest supporting card place their metadata, reading time, and headline above full-width artwork. The lead uses `home-v2-featured__lead-heading`; supporting cards use `home-v2-featured__item-heading`. Compact supporting cards keep their headings and summaries in the right column beside small square artwork spanning both rows; their heading remains first in document order without duplicate text. The newest supporting card alone uses a contained 16:9 illustration above its summary, a publication date, and a restrained freshness tag: `New!` for the first 14 elapsed days, then `Latest` on the next successful rebuild. The article link stays on the artwork, and a separate 44px zoom target shows a magnifier SVG on a pale disc. The Dolphin lead retains its wide hero and eager, high-priority image loading, followed by its summary and article CTA. Compact only the Featured Articles spacing; leave the masthead and welcome unchanged. At 900px and below, stack the Featured Articles heading and introduction to preserve breathing room. Keep the image/dialog controls and narrow-screen artwork layouts readable.

The `image_led: true` pilot on *Life is a controlled fall* places its full-width illustration before the title inside a 52rem article header. Its caption and fullscreen action remain, and its compact desktop masthead gives the illustration room at the top of the page. Standard articles retain their title-before-side-plate opening; do not apply this treatment globally.

## Primary Navigation

The shared masthead owns one `Primary` navigation landmark. At widths above 768px, it presents `Read` and `Explore` as native disclosure controls, followed by direct `About`, `Bookstore`, and `Contribute` links, in that order. `Read` contains Latest, Archive, Collections, Library, and Feeling curious?; `Explore` contains Gallery plus the publication-gated Apps & Tools and Games destinations. Studio and Support remain available from the footer rather than the primary navigation.

At 768px and below, the closed ribbon reads `Read`, `Explore`, and `About`, in that order. Read and Explore are separate disclosures: Archive and Bookstore appear in Read, while Contribute remains available in Explore. Keep the ribbon on one row at 320px and larger, with readable labels, separators between destinations, non-overlapping 44px-high interaction targets, and disclosure panels that expand cleanly below the ribbon. Desktop disclosure panels may overlay content below the ribbon. Destination metadata and exact active-state ownership live in `layouts/partials/masthead.html`; link rendering lives in `layouts/partials/masthead_nav_link.html`; disclosure coordination lives in `layouts/partials/masthead_navigation_script.html`. Do not use ARIA menu roles, hover-only opening, or analytics events for disclosure controls.

Light mode is the OIP paper edition. Use the restrained parchment tokens and shared paper surface variables for cards, panels, forms, route headers, image plates, and footer surfaces. Dark mode remains the classic OIP dark atmosphere. Do not copy Bob's Almanack-only layout treatments across the site; borrow its warm paper material, fine rules, and restrained ink palette.

## Divider Rules

Structural dividers should use semantic custom properties rather than repeated raw color values.

Current divider tokens:

- `--oip-rule-hairline`
- `--oip-rule-faint`
- `--oip-rule-list`
- `--oip-rule-standard`
- `--oip-rule-clear`
- `--oip-rule-engraved`
- `--oip-rule-engraved-strong`
- `--oip-rule-engraved-gradient`
- `--oip-rule-engraved-rail`

Use these for page structure, section boundaries, archive lists, homepage zones, and article aftermatter dividers.

Do not use these tokens for card borders, image frames, buttons, forms, focus rings, collection accent themes, or hover accents unless a future plan explicitly broadens the theme surface.

## Future Print-Rule Experiments

For a COA3-style print-rule treatment, add a new timestamped preset before changing active values. Prefer a small number of semantic variables first, then add any ornamental or gradient rules behind those variables so the design can be tuned without hunting many selectors.

## COA3 Active Preset

The active COA3 preset is `oip-theme-rules-print-20260429-161813`. It keeps ordinary structural dividers close to the prior clear preset and adds two warmer engraved rule tokens for signature thresholds only.

Use `--oip-rule-engraved` and `--oip-rule-engraved-strong` for masthead and nav rails, section-front openings, archive month/year boundaries, homepage manifesto and start-reading separators, gallery spotlight/archive thresholds, article record/reading-path aftermatter, and the site footer.

Use `--oip-rule-engraved-gradient` and `--oip-rule-engraved-rail` as semantic threshold tools, not general borders. The horizontal gradient is for route openings, major section starts, archive/library group boundaries, gallery/current-cartoon splits, article record panels, article figure/heading thresholds, and footer openings. The rail is for short leading accents on archive/library rows where a full engraved separator would be too heavy.

Do not extend the engraved tokens into card/panel borders, image frames, buttons, forms, focus rings, collection-room theme variables, or hover/accent states without a new plan.

## COA3 Second Pass Guidance

The second-pass engraved archive polish should stay CSS-first and restrained. Prefer a single gradient threshold or short rail at an editorial boundary over repeated ornamental treatment on every item. Long archive and library lists should use quieter row separators with stronger month/type/group starts.

Article body treatment should protect reading flow. Body headings, figures, captions, embedded-media notices, the combined publication-record panel, and reading paths may receive subtle engraved thresholds; ordinary paragraphs should not.

Shop remains protected from route-specific engraving. It may inherit shared section-front and footer rules, but product cards, purchase controls, and form-like surfaces should remain outside the divider token system.
