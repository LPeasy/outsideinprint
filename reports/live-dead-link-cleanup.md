# Live Dead-Link Cleanup

Date: 2026-06-27

## Summary

The prior live crawl reviewed 220 sitemap URLs. Internal page links, internal media/assets, `data-*-src` embedded assets, placeholder image references, Medium placeholder SVG references, and external Medium CDN image references all had zero broken results.

The external-link pass found 21 likely real dead targets (`404` or `410`) across live published pages. This cleanup replaces those targets in essay content and mirrors matching updates into editorial source-checklist files where present.

## Result

- Confirmed dead external source targets before repair: 21
- Confirmed dead external source targets after repair: 0 confirmed in parsed source links and built public HTML
- Stale URL occurrences repaired in repo content/docs: 26
- Public URL, route, template, image, and media contracts changed: no

## Validation

- Replacement URLs checked with a browser-style user agent: 21 of 21 returned `200`
- Fresh Hugo production build: passed
- Public route smoke test: passed
- Public HTML output regression test: passed
- Rendered internal `href`, `src`, and `data-*-src` references checked: 7,904
- Broken rendered internal references: 0

## Remaining Non-Dead External Warnings

The prior crawl also found non-dead external warnings: 98 `403`, 1 `401`, 1 `402`, 1 `429`, 1 `500`, and 44 timeout/no-response results. Those were left unchanged because they are blocked, paywalled, rate-limited, transient, or script-sensitive rather than confirmed dead links.

External-link CI was not tightened in this pass. The current external web surface produces too many false positives for a blanket external-link failure gate.
