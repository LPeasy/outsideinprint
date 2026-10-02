# Almanack Steps 1 and 3: preparation for review

Prepared from verified `main` at `3325808123ce17d215a8f759e014345b1f20bc3a`
on Big-Floppa, October 2, 2026. This work stops at a tested draft PR.
Merge and deployment, provider welcome activation, and real-alias acceptance
tests each require the separate approval in the approved plan.

## Reader identity and welcome draft

Generic signup title: **Bob’s Almanack**. Description: **The free Saturday
letter from Outside In Print.** CTA: **Get Bob’s Almanack**. Sample label:
**Read a sample Saturday letter**. Segment landing promises, artwork, layout,
native forms, configured tags, double opt-in, redirects, and article cards
retain their existing behavior. The owned confirmation page identifies the
product and keeps the exact instruction to click the email confirmation link.

The intentional sample remains `/almanack/2026-07-25/`. This change does not
publish the private September 26 rewrite or create an October 3 edition.

The exact subject and body are in [almanack-welcome-draft.txt](almanack-welcome-draft.txt).
That file stores copy only. After separate activation approval, retain the
provider-required footer and unsubscribe controls. The owner previously
verified `almanack@outsideinprint.org` as From. This preparation did not
reverify it and does not invent a Reply-To address.

## Provider evidence and blockers

[Welcome email documentation](https://docs.buttondown.com/transactional-emails-welcome)
labels the normal welcome as available on Standard, sent after confirmation,
and edited through Settings > Subscribing > Welcome. This uses the normal
welcome feature; it does not introduce a drip sequence or automation.
[Subscriber metadata documentation](https://docs.buttondown.com/subscriber-metadata)
labels subscriber metadata as available on Basic and documents structured
subscriber keys; verify the account’s actual metadata
entitlement rather than assuming a plan from public feature documentation.

The signed-out cloud browser cannot inspect this account. This execution
environment exposes the Computer Use skill but not its required `node_repl`
control tool, so it cannot inspect the existing signed-in Windows session.
Actual plan, normal welcome editor access, metadata entitlement, current From,
actual Reply-To, and native subscriber CSV export availability remain
unverified. No login, settings save, subscriber export, or purchase occurred.
Resolve these through read-only account inspection before provider activation.
Do not purchase an upgrade to bypass an entitlement blocker.

## Optional attribution fields

Both standalone form templates add only these five optional hidden fields:

| Native POST name | Validated value |
| --- | --- |
| `utm_campaign` | `almanack-organic` |
| `utm_medium` | `organic_social` |
| `utm_source` | `facebook`, `instagram`, `linkedin`, `pinterest`, or `x` |
| `metadata__oip_segment` | `weekend`, `everyday-history`, or `dialogue` |
| `metadata__oip_post` | Matching segment plus `-01` through `-04`, or `-bio` |

The controls start empty and disabled. Native submit populates them only from
the existing `analytics.js` acquisition state after validation and expiry
checks. Acquisition is initialized once per page; submit does not rerun
`funnelAcquisition()`. The original 30-minute expiry is unchanged by navigation
or submission. A later valid campaign entry replaces the previous entry.
Existing entry-route validation and duplicate-UTM rejection are preserved.
Unknown, invalid, absent, or expired codes are omitted; analytics-off and
no-JavaScript forms continue their normal native POST without the new fields.
Blocked session storage preserves valid current-page attribution only.

The provider’s [native form contract](https://docs.buttondown.com/building-your-subscriber-base)
supports hidden `metadata__<key>` inputs and requires normal form navigation
for validation and CAPTCHA. [UTMs via forms](https://buttondown.com/blog/2025-09-27)
documents the three UTM names in the form body. These docs establish the
contract, not observed persistence in this account. No new network request,
tracker, cookie, email in analytics, or arbitrary URL data is introduced.
The narrow privacy addition distinguishes browser code expiry from provider
record retention and discloses transfer with a voluntarily supplied email.

## Manual local report

Run `scripts/report_almanack_signups.py` only on demand from a manual native
Buttondown subscriber export. There is no API or scheduled report. The
[official CSV schema](https://docs.buttondown.com/data-exports-subscriber)
includes `id`, `email`, `subscriber_type`, `creation_date`, `subscription_date`,
the three UTM fields, `metadata`, and `tags`. Metadata may be a Python
dictionary literal or JSON; tags are semicolon-separated. Extra export
columns are ignored. The script never emits email addresses or subscriber IDs
to the aggregate report or console.

Keep raw CSVs, known test-ID lists, actual baseline-ID lists, and optional
cohort JSON outside every Git working directory. The CLI rejects Git paths
and input/output collisions. Use a private operator folder and access rules
appropriate for subscriber records. Do not commit these files or paste them
into public logs. Only code, synthetic fixtures and instructions belong here.

Supply an explicit timezone in all timestamps. The creation interval is
`[start, end)`, and `snapshot` is the actual export snapshot time. Example
command shape, replacing every placeholder with real paths and times:

```powershell
.\tools\bin\generated\python.cmd .\scripts\report_almanack_signups.py --input '<private manual CSV>' --start '<inclusive timestamp with timezone>' --end '<exclusive timestamp with timezone>' --snapshot '<actual export timestamp with timezone>' --test-ids '<private known test IDs>' --preexisting-ids '<private actual baseline IDs>' --output '<private aggregate Markdown>' --cohort-output '<private cohort JSON>'
```

`--test-ids`, `--preexisting-ids`, and `--cohort-output` are optional. Supply
known tests explicitly; `--test-tag` may also name an actually used test tag.
Earlier creation dates are classified as preexisting even without a baseline
file. A baseline file must come from actual earlier records. None has been
fabricated or exported during preparation.

Primary count: distinct subscriber IDs created in the interval, with all five
valid campaign codes and `Regular` status at snapshot T. Label:
**New signup cohort, confirmed active as of [timestamp]**. The report groups
platform, segment, and placement and separates unknown attribution, pending,
unsubscribed, tests, preexisting, outside-window, other-status, and invalid
records. Exact duplicate IDs are counted once; conflicting duplicates stop
the report. Known tests and explicit baseline IDs are excluded first, then
creation dates determine preexisting or outside-window records, then status
and valid codes determine the active cohort.
Creation and subscription dates are not confirmation timestamps. This is not
a claim of confirmations during the week and not a conversion rate from
unmatched website attempt totals.

Only at a later request, after two actual editions have been sent, use the
private saved ID cohort with a fresh full export, `--retention-cohort`, and
two repeatable `--sent-edition` arguments containing verified send timestamps.
The script requires distinct send timestamps after the initial snapshot and
at or before the later snapshot. It reports continued subscription, pending,
unsubscribed, other-status, and missing IDs. This measures continued
subscription, separately from engagement; it does not measure reading, opens,
or clicks. Operator-supplied send evidence is required; the script cannot
verify an account’s actual sending activity.

[The synthetic report](almanack-signups-synthetic-report.md) demonstrates the
output using only invented fixture IDs and reserved `example.invalid` emails.
It is not an account baseline.

## Later approved acceptance test

Use a newly approved alias; do not reuse an old unsubscribed alias. Record the
approved alias privately as a test before submitting, then add its subscriber
ID to the known-test exclusion file when the pending record exists. Verify:

1. Submit pending A, then pending B through approved native form paths.
2. Inspect whether pending B overwrites metadata; record the observed result.
3. Confirm through the email link, then inspect the same subscriber ID,
   current metadata, and one expected welcome with the provider footer.
4. Submit active A again and inspect duplicate behavior without assuming
   that metadata or attribution stays unchanged.
5. Unsubscribe only the test alias and exclude its ID from the signup cohort.

Provider persistence and overwrite behavior are currently unverified. Never
promise immutable first-touch attribution. Mocked POST tests prove the
website’s native navigation and field behavior, not provider persistence or
email delivery. Real submissions and provider changes remain approval-gated.

No Step 2 outreach, upgrades, broadcasts, extra social posts, drip sequence,
backend, webhooks, credentials, or unrelated email-export guard fixes are
included.
