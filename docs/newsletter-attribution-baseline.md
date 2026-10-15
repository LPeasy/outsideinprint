# Newsletter baseline — October 15, 2026

The read-only Buttondown list capture completed at **2026-10-15 15:23:11 UTC**
(11:23:11 AM Eastern). Pagination completed in one page containing nine subscriber
records. The private source is the local baseline capture; no subscriber identity,
email, metadata payload, or credential is reproduced here.

| Observed provider status | Records |
| --- | ---: |
| `regular` | 5 |
| `unactivated` | 2 |
| `unsubscribed` | 2 |
| Total pre-existing baseline | 9 |

All nine records have a provider creation timestamp and `embedded_form` as the
available source. None has a recorded UTM campaign, source, or medium. Historical
campaign attribution is **unknown**. Creation timestamps establish signup dates,
not confirmation dates. These records must be imported as baseline and cannot
become new campaign conversions when they submit another form.

Two records are explicitly classified for exclusion: one known owner and one
documented signup test. Seven remain unreviewed; no record has yet been explicitly
classified as non-test in this capture. Therefore **current active non-test
subscribers are not yet established**. Five `regular` records must not be reported
as five active non-test readers. Plus-address patterns were not used to classify
tests.

The deployed fresh baseline completed at **2026-10-15T16:13:59.222Z**, with the
same nine records and classification counts. A complete deployed reconciliation
succeeded, and the configured webhook was enabled with zero failed attempts.
The Worker-origin signup test was blocked by Buttondown's firewall before creating
a subscriber; confirmation delivery and the full end-to-end check remain
unverified. Public forms retain their working Buttondown path. Complete the
private owner/test review before interpreting non-test audience totals. Retain
unknown historical sources and unknown first-confirmation timestamps as unknown.
