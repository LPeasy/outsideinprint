# OIP-99-Edit Refinement Report

Workflow: `simple_logic_publication_packaging`

Package: `2026-07-04-borrowed-hour`

Decision state: `PUBLICATION_READY`

Current score: `94/100`

Primary strength: The piece is short, plain, fair to exceptions, and clear about the time transfer from tonight to tomorrow.

Primary weakness: The central claim is conditional. The essay must not claim that phones caused the national short-sleep rate.

Highest-value addition: Publication front matter, Simple Logic collection membership, hero image metadata, and live-site audit evidence.

Highest-value removal: The final copy removed high-severity contrast-cliche scanner hits before publication.

Source risk: `MANAGEABLE`

Image risk: `LOW`

## Editorial Philosophy Audit

Decision: PASS

| Test | Result | Evidence |
|---|---|---|
| Evidence | PASS | Sleep recommendation, device-before-bed guidance, short-sleep statistic, and sleep-deficiency consequences use CDC, NCHS, and NHLBI. |
| Logic | PASS | The argument follows a narrow time equation: if phone time delays sleep and wake time stays fixed, tomorrow bears some cost. |
| Incentives | PASS | Names the incentive to treat late phone time as private, cost-free personal time. |
| Tradeoffs | PASS | Grants that phone time can be rest, care, work, or safety, then names the tradeoff when it cuts sleep. |
| Consequences | PASS | Consequences include focus, reaction, driving, work, patience, and promise-keeping. |
| Uncertainty | PASS | The essay does not claim phones caused national sleep shortage or that everyone can solve sleep by willpower. |
| Institutional Behavior | PASS | The relevant power shift is personal: tonight spends tomorrow's attention. Source roles are official health/data guidance, not governing commands. |

## Media Framing Audit

Decision: PASS

| Test | Result | Evidence |
|---|---|---|
| Media Frame Identified | PASS | No major-media story controls the piece; the possible inherited frames are wellness scolding and anti-phone panic. |
| Primary Source Rebuild | PASS | The factual record is rebuilt from CDC, NCHS, and NHLBI sources. |
| Assumption Quarantine | PASS | The essay quarantines moral blame by naming work, care, pain, grief, shift work, children, stress, and sleep disorders. |
| Source Hierarchy | PASS | Official health and federal data sources are used for factual claims. No secondary reporting is used in the story body. |
| Inherited Frame Rejected | PASS | The essay avoids panic, self-help certainty, and medical claims beyond the sources. |

## Rubric

| Category | Score | Notes |
|---|---:|---|
| Fair claim and no strawman | 12/12 | Grants harmless phone use, work, care, pain, grief, shift work, children, stress, and sleep disorders. |
| Premise-chain logic | 17/18 | The chain is clean: phone delays sleep, morning stays fixed, tomorrow receives the cost. |
| Evidence hierarchy | 14/16 | CDC, NCHS, and NHLBI cover the factual claims; no secondary reporting is used. |
| Uncertainty discipline | 14/14 | Causal and moral overclaims are quarantined in `evidence-control.md` and the body. |
| Plain-language clarity | 11/12 | 373 words, Flesch-Kincaid grade 4.1, short sections, one main message. |
| OIP insight | 9/10 | Turns familiar bedtime phone behavior into a practical responsibility ledger without wellness scolding. |
| Visual logic | 7/8 | The hero shows the transfer; the extra generated sign is legible and object-bound. |
| Review package readiness | 10/10 | Required files are complete, research was saved, and validators pass. |

## Source Hierarchy Cleanup

Official sources support the factual claims. The phone-cost claim remains a conditional time-arithmetic claim. Secondary reporting was not used for factual claims.

## Static Audit Summary

Simple Logic package validator:

```powershell
python C:\Users\lawto\.codex\skills\simple-logic-candidate\scripts\validate_simple_logic_package.py --package C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-04-borrowed-hour
```

Result: PASS. `Simple Logic package validation passed.`

Franklin pullquote checker:

```powershell
python C:\Users\lawto\.codex\skills\franklin-straight-style\scripts\check_franklin_pullquotes.py --input C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-04-borrowed-hour\story.md
```

Result: PASS. `Franklin pullquote validation passed.`

AI-tell strict scan:

```powershell
python C:\Users\lawto\.codex\skills\ai-tell-remover\scripts\ai_tell_scan.py --input C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-04-borrowed-hour\story.md --body-only --format markdown --strict
```

Result: PASS. `0 unresolved AI-tell audit hits in body prose`.

## Figure Decisions

| Figure | Decision | Reason | Required Change |
|---|---|---|---|
| Hero image | KEEP | The cartoon shows the bedroom responsibility transfer with object-bound labels and no real likenesses or logos. | Publish as `static/images/essays/borrowed-hour/hero.png`. |
| Front-page cartoon | PUBLISH | The same image meets the OIP front-page cartoon standard and links cleanly to the essay. | Publish through `update_front_page_cartoon.ps1` as `Borrowed Hour`. |

## Model/Data Fidelity Notes

NCHS 2024 short-sleep data must stay context only. The essay does not claim phones caused the statistic.

## Layout/Export Readiness

The live essay has standard OIP front matter, a local hero image, explicit `simple-logic` collection membership, a description, author metadata, version metadata, and accepted audit evidence.

## Final Recommendation

`PUBLICATION_READY`

Proceed with normal OIP publication validation and front-page cartoon publication.

