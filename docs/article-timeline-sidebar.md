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

`assets/css/main.css` owns the geometry. Above 980px, the aside stretches to the main body's height and distributes its entries across that height. At smaller widths it follows the body as a compact list, without desktop spacing. Physical print also stacks the timeline and keeps each entry together across page breaks. No JavaScript is required.

The first use is `why-daylight-saving-time`, adapted from immutable Contributor Desk revision 11. All twelve timeline entries and their source links are retained. The main essay's wording is unchanged; the vote tally and a caption's time range use plain hyphens to satisfy the publishing preflight. The staging package records the export, source artwork and production adaptation hashes.
