# Hugo Extended 0.167.0 upgrade verification

The publishing runtime moves from Hugo Extended 0.164.0 to 0.167.0 separately from the Node/npm/Playwright update. Active CI, portable-tool metadata, wrappers, resolvers, fixtures, and version checks use the same pin. Historical release evidence remains unchanged.

## Same-clock comparison

Both Windows production builds used `2026-10-09T18:46:43Z`, the same publication sources and configuration, analytics enabled, and separate resources/output directories. No processed resources were shared across Hugo versions.

| Measure | 0.164.0 | 0.167.0 |
| --- | ---: | ---: |
| HTML routes | 367 | 367 |
| RSS feeds | 6 | 6 |
| Payload files, excluding paused PDFs | 5,962 | 5,962 |
| Managed derivatives | 5,100 | 5,100 |
| Image bytes | 590,189,958 | 590,189,958 |
| Total bytes | 644,674,172 | 644,674,177 |
| Local cold build seconds | 199.4 | 210.9 |

Routes, canonicals, descriptions, robots directives, feeds (including summaries), and rendered text agree except for reading estimates. Seven pieces gain one minute, appearing on ten archive/collection routes. Hugo's old non-CJK calculation used `(wordCount + 212) / 213`; the new calculation correctly implements rounding up at 212 words per minute with `(wordCount + 211) / 212`. Keep this upstream correction. No content or template workaround is needed. The only branch-page slug declaration already matches its directory name; routes remain stable.

`scripts/compare_hugo_output.py` records every changed route. It fails on unexpected changes. Its explicit `--allow-reading-time-update` option permits only identical metadata and text after removing reading estimates, with each estimate unchanged or increased by one minute. The comparison report has zero unexpected differences. Representative homepage selection, article contents, collection progress, gallery navigation, and cached/cold image fixtures passed with the candidate runtime. PR CI validates the complete production output and active browser suites before merge.

These timings describe two local cold builds; they do not establish a CI performance improvement. Processed resources remain keyed by Hugo version.

## Verified distribution pins

- Linux archive SHA-256: `0163f5c3deddac1f494a1629ddc40c65d18de9d5794facd98f7f96ac2c7d8957`.
- Windows archive SHA-256: `b04cdf0ae9098fe093ea90e1bd778d21649d71f55914d267aa60aa80b59074e0`.
- Extracted Windows executable SHA-256: `9f8525e6b6a90e5bdf8a03132cbb54f491055feb7b9a5af6bbf7f27c75b1de1b`.

The portable installer verifies both the archive and executable. CI verifies the Linux archive before extraction. A changed pin invalidates incompatible resources, while absence of a cache remains supported.

## Primary evidence

- [Hugo 0.167.0 release](https://github.com/gohugoio/hugo/releases/tag/v0.167.0).
- [Release asset metadata](https://api.github.com/repos/gohugoio/hugo/releases/tags/v0.167.0), including archive digests.
- [ReadingTime documentation](https://gohugo.io/methods/page/readingtime/).
- [0.164.0 implementation](https://github.com/gohugoio/hugo/blob/v0.164.0/hugolib/page__content.go#L816) and [0.167.0 implementation](https://github.com/gohugoio/hugo/blob/v0.167.0/hugolib/page__content.go#L815).

