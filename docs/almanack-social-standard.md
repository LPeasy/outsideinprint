# Almanack issue-launch social standard

Use `config/almanack-social/standard.json` for future Bob's Almanack issue-launch
social preparation. This is a scoped manual handoff standard. It does not alter
the weekly package/email automation, generic site share cards, non-Almanack
campaigns, or existing posts and schedules.

The image must give readers a real sample: a compact Bob's Almanack masthead,
the issue's canonical date and number, the selected article's actual artwork and
exact title, a short verbatim excerpt, and a clear invitation to read the full
issue. Use the approved warm cream visual references. Preserve the whole artwork
without cropping, stretching, repainting or generating a substitute.

| Platform | Image size | Destination |
| --- | --- | --- |
| Facebook | 1080 × 1350 | Direct canonical issue URL |
| Instagram | 1080 × 1350 | Existing Almanack link in bio |
| Pinterest | 1080 × 1620 | Direct canonical issue URL |

Read the actual issue source before preparation. Use its date and `issue_number`,
not the selected article's publication date or a provider's counter. Select an
article included in that issue and verify the title, artwork and short excerpt
against the article. The excerpt is a contiguous verbatim passage, not a new
summary or a remembered quotation. The article is a sample; Facebook and
Pinterest lead to the full issue.

The approved references are recorded by their stable Library IDs in the standard.
Their October 3 date, Issue 22 number and selected article are examples, not
defaults. Inspect their actual pixels before claiming a visual match. This
change does not introduce a social rendering service or a posting integration.
Prepare the assets manually using available design tools and the scoped handoff
instructions added to the Almanack skill.

The approved October 3, 2026 example is Issue 22 and samples **The Noise of the
Crowd** with its original `editorial/words-rising-from-silence` artwork. Its exact
excerpt is “We can spend a whole day taking in words without hearing what we want
to say.” Source URLs and the original artwork hash are recorded in
`approved_example` for traceability. Future cards must use their own issue and
selected article.

Before handoff, record source URLs/paths, date, number, exact title, artwork
identity, exact excerpt, image dimensions and platform destinations beside the
assets. Inspect the final exported images at phone viewing size: masthead, title,
excerpt and CTA must be readable, with no clipped text or missing artwork. Choose
a shorter exact passage when necessary; do not make the text unreadably small.
Verify the actual Instagram bio destination before any separately authorized
post; this standard does not change it.

## Local installation

`scripts/install_almanack_social_standard.py` preflights the source policy and
the known installed-skill anchor before writing. It copies the standard into
the outer workspace and adds one scoped social-preparation section to the
installed `oip-bobs-almanack` skill. It backs up changed files, rejects unknown
local content, preserves unrelated skill instructions and supports repeat runs.

Use the repository's pinned Python wrapper with `--workspace-root`,
`--skill-path`, and `--backup-dir`. Run `--check` first to inspect the exact two
targets. No renderer, email helper, provider settings, automation or schedule
is changed. The installer validates the policy contract; the source and visual
review of each future image remains a required production check.

The current reference pixel checks are pending because the Library transfer
helper cannot preserve its metadata under native Windows Python. No font choice,
spacing measurement, pixel match or phone-readability result is claimed until
the approved images can be inspected.
