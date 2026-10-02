Synthetic demonstration only. These are invented fixture records, not an account baseline.

# New signup cohort, confirmed active as of 2026-09-08T12:00:00Z

Creation window: [2026-09-01T00:00:00Z, 2026-09-08T00:00:00Z).

Distinct active new signups: **3**.

| Platform | Segment | Placement | Count |
| --- | --- | --- | ---: |
| facebook | weekend | weekend-01 | 1 |
| pinterest | everyday-history | everyday-history-bio | 1 |
| x | dialogue | dialogue-04 | 1 |

Separate counts (each ID belongs to one bucket):

- unknown_attribution_active: 2
- pending: 1
- unsubscribed: 1
- tests: 2
- preexisting: 2
- outside_window: 1
- other_status: 1
- invalid_creation_date: 1

Duplicate rows ignored: 1.
Rows without an ID: 1.

- Regular is status at the manually supplied export snapshot, not a confirmation timestamp.
- creation_date and subscription_date do not establish when confirmation occurred.
- Attribution is provider snapshot data; pending resubmissions may overwrite metadata.
- This report makes no confirmed-during-window claim and no conversion rate from site attempts.
- Unknown attribution and pending, unsubscribed, test, and preexisting records are separate.
