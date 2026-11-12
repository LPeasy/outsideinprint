# Article timeline sidebar

An article may opt into a full-length timeline with `timeline_sidebar` front matter:

```yaml
timeline_sidebar:
  title: "How the clock changes became routine"
  entries:
    - date: "[1918](https://www.govinfo.gov/content/pkg/STATUTE-40/pdf/STATUTE-40-Pg451.pdf)"
      text: "U.S. federal daylight saving begins March 31."
```

`layouts/_default/single.html` retains the ordinary body markup for articles without this field. Opted-in articles use `.piece-reading-layout`, with the main `.piece-body` first in reading order and `article/timeline-sidebar.html` second. The aside requires a title and at least one entry with date and text; malformed values fail rendering. Dates and descriptions render inline Markdown, preserving source links.

`assets/css/main.css` owns the geometry. Above 980px, the aside stretches to the main body's height and distributes its entries across that height. At smaller widths it follows the body as a compact list, without desktop spacing. Physical print also stacks the timeline and keeps each entry together across page breaks. The dated list remains readable without JavaScript.

The first use is `why-daylight-saving-time`, adapted from immutable Contributor Desk revision 11. All twelve timeline entries and their source links are retained. The main essay's wording is unchanged; the vote tally and a caption's time range use plain hyphens to satisfy the publishing preflight. The staging package records the export, source artwork and production adaptation hashes.

## Full-width introduction and conclusion

An article can limit the rail to its historical middle by adding two H2 anchor IDs:

```yaml
timeline_sidebar:
  title: "SS United States, 1949–2026"
  start_heading: "a-liner-with-a-second-job"
  end_heading: "what-else-could-the-metal-have-become"
  entries:
    # The ordinary linked date/text entries go here.
```

`article/bounded-timeline.html` divides the already-rendered body at those headings. The introduction and the section beginning with `end_heading` span the reading layout. The right rail begins alongside `start_heading`; mobile and print reading order is introduction, historical middle, timeline, conclusion. Each boundary must identify one unique H2, and the end must follow the start. Invalid boundaries fail the build rather than dropping or repeating article text. Articles without `start_heading` retain the full-length timeline behavior.

Run `tests/test_bounded_timeline_contract.ps1` through the pinned PowerShell wrapper to check text/link preservation, reading order, the legacy default and invalid boundaries. Browser checks should also cover the 980px breakpoint and narrow phone widths.

## Annual tick marks

`assets/js/timeline-scale.js` decorates every timeline sidebar, including SS United States, Armistice Day and daylight saving. It preserves the existing CSS entry spacing and adds a vertical rule, one short tick per year and one longer tick aligned with each dated entry. There are no leader lines and no absolute positioning of labels.

Year positions interpolate within each gap between entries; the whole timeline is deliberately **not a uniform scale**. Known months and days, including leap years, inform those local proportions. Year-only dates use the beginning of the year, month-only dates use the beginning of the month, and ranges anchor at their midpoint. These placement conventions do not assert more historical precision than the displayed source date. Annual ticks remain complete even when a long historical gap packs them tightly.

The decorative SVG is hidden from assistive technology and physical print. The linked dates and descriptions retain their original reading order. Resize observers redraw the rule without changing article or label geometry; route-widget cleanup disconnects observers during navigation. Contributor Desk carries the same renderer in `web/preview.js` and companion styles in `web/preview.css`.

Run `node --test tests/timeline_scale.test.cjs` with the pinned Node runtime for calendar parsing and within-gap interpolation checks. Check desktop/mobile rendering after changes to the renderer or timeline CSS.
