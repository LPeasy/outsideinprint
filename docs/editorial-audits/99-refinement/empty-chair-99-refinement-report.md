# OIP-99-Edit Refinement Report

Workflow: `simple_logic_publication_packaging`

Package: `2026-07-03-empty-chair`

Decision state: `PUBLICATION_READY`

Current score: `94/100`

Primary strength: The piece is short, plain, fair to legitimate boundaries, and clear about the responsibility shift when no one names the next carrier.

Primary weakness: The cultural premise is conditional. The essay must not claim that boundary language caused a national caregiving crisis.

Highest-value addition: Publication front matter, Simple Logic collection membership, hero image metadata, and live-site audit evidence.

Highest-value removal: The live copy removes one habitual house-style blocker: `still` in `Unpaid work still lands somewhere`.

Source risk: `MANAGEABLE`

Image risk: `LOW`

## Editorial Philosophy Audit

Decision: PASS

| Test | Result | Evidence |
|---|---|---|
| Evidence | PASS | Boundary, caregiving, eldercare, and social-connection claims are tied to UC Davis Health, Mental Health America, AARP/NAC, BLS, SAMHSA, and HHS sources. |
| Logic | PASS | The argument moves from boundary legitimacy to care labor to burden assignment. |
| Incentives | PASS | Names the incentive to use therapeutic language to exit duty without naming the next carrier. |
| Tradeoffs | PASS | Protects real safety boundaries while naming the cost when ordinary duty is abandoned. |
| Consequences | PASS | Traces the burden to another family member, paid aide, emergency system, or no care. |
| Uncertainty | PASS | Bars causal claims about boundary culture, legal-duty claims, and group-blame claims. |
| Institutional Behavior | PASS | Relevant systems are family care, unpaid care, paid care, health systems, and emergency fallback; the essay does not overbuild an institutional claim. |

## Media Framing Audit

Decision: PASS

| Test | Result | Evidence |
|---|---|---|
| Media Frame Identified | PASS | No major-media frame controls the piece; media search results were not used as evidence. |
| Primary Source Rebuild | PASS | Factual support comes from official, direct, and health/public-health sources. |
| Assumption Quarantine | PASS | The draft does not assume boundaries are bad or family duty is unlimited. |
| Source Hierarchy | PASS | Official BLS/HHS/SAMHSA and direct AARP/NAC sources are separated from health-system/nonprofit guidance. |
| Inherited Frame Rejected | PASS | The essay avoids culture-war shorthand around therapy language and family obligation. |

## Rubric

| Category | Score | Notes |
|---|---:|---|
| Fair claim and no strawman | 11.5/12 | Handles the boundary claim fairly by protecting abuse, danger, burnout, and caregiver-limit cases. |
| Premise-chain logic | 16.5/18 | The claim, duty, assignment, and possible burden shift are visible without worksheet prose. |
| Evidence hierarchy | 14/16 | Uses official BLS/HHS/SAMHSA, direct AARP/NAC, and health-system/nonprofit guidance. |
| Uncertainty discipline | 13.5/14 | Clearly bars causal claims about boundary culture, legal-duty claims, and group blame. |
| Plain-language clarity | 12/12 | 498 words, Flesch-Kincaid grade 5.4, short sections, clean links, Franklin pullquotes, and final AI-tell scan clean. |
| OIP insight | 9/10 | Strong underobserved point: a no-plan boundary can move ordinary duty to someone else. |
| Visual logic | 8/8 | Cartoon and package visuals clarify the human transfer without false certainty. |
| Review package readiness | 9/10 | Package validates and carries explicit source-risk caveats. |

## Source Hierarchy Cleanup

Official and direct sources support the factual claims. Health-system and nonprofit guidance support the fair version of boundary practice. Secondary reporting was not used for factual claims.

## Static Audit Summary

Simple Logic package validator:

```powershell
python C:\Users\lawto\.codex\skills\simple-logic-candidate\scripts\validate_simple_logic_package.py --package C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-03-empty-chair
```

Result: PASS. `Simple Logic package validation passed.`

Franklin pullquote checker:

```powershell
python C:\Users\lawto\.codex\skills\franklin-straight-style\scripts\check_franklin_pullquotes.py --input C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-03-empty-chair\story.md
```

Result: PASS. `Franklin pullquote validation passed.`

AI-tell strict scan:

```powershell
python C:\Users\lawto\.codex\skills\ai-tell-remover\scripts\ai_tell_scan.py --input C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-03-empty-chair\story.md --body-only --format markdown --strict
```

Result: PASS. `0 unresolved AI-tell audit hits in body prose`.

## Figure Decisions

| Figure | Decision | Reason | Required Change |
|---|---|---|---|
| Hero image | KEEP | The cartoon shows the family-table responsibility transfer with object-bound labels and no real likenesses or logos. | Publish as `static/images/essays/empty-chair/hero.png`. |
| Front-page cartoon | PUBLISH | The same image meets the OIP front-page cartoon standard and the user named it `Care Rota`. | Publish through `update_front_page_cartoon.ps1` as `Care Rota`. |

## Model/Data Fidelity Notes

BLS and AARP/NAC counts use different definitions and must stay separate. The essay does not add or compare them. The cultural boundary premise remains a conditional logic claim, not a measured trend.

## Layout/Export Readiness

The live essay has standard OIP front matter, a local hero image, explicit `simple-logic` collection membership, a description, author metadata, version metadata, and accepted audit evidence.

## Final Recommendation

`PUBLICATION_READY`

Proceed with normal OIP publication validation and front-page cartoon publication.
