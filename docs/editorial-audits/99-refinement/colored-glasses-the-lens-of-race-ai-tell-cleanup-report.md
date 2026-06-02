# AI-Tell Cleanup Report

Target file: `content/essays/colored-glasses-the-lens-of-race.md`
Date reviewed: 2026-06-01
Reviewer: Codex / ai-tell-remover

## Search Context

Search query or mode: `site:grammarly.com AI writing telltale signs generic phrases ultimately crucial delve landscape`; `site:prowritingaid.com AI writing common phrases ChatGPT tells`

Live-search date: 2026-06-01

Current tells learned:

1. Predictable structure, steady tone, and repeated sentence shapes can make prose read as AI-assisted.
2. Phrases such as `delve into` and `at its core` remain common public examples of AI-sounding copy.
3. Generic formal words and phrases can sound polished while weakening the writer's own voice.
4. Repeated phrases within a short span can make prose feel mechanical.
5. AI detectors and style audits remain probabilistic, so human review must judge context before editing.

## Scan Commands

```powershell
.\tools\bin\generated\python.cmd C:\Users\lawto\.codex\skills\ai-tell-remover\scripts\ai_tell_scan.py --input content\essays\colored-glasses-the-lens-of-race.md --body-only --format markdown
.\tools\bin\generated\python.cmd C:\Users\lawto\.codex\skills\ai-tell-remover\scripts\ai_tell_scan.py --input content\essays\colored-glasses-the-lens-of-race.md --body-only --format markdown --strict
```

## Scan Summary

| Pass | Hits | Notes |
|---|---:|---|
| Before cleanup | 2 | One low repeated-cadence hit and one medium unsupported-certainty marker on `clearly`. |
| Intermediate cleanup | 1 | The unsupported-certainty hit was resolved; one low repeated-cadence hit remained. |
| After cleanup | 0 | Final scan reported `0 unresolved AI-tell audit hits in body prose`. |

## Changes Applied

| Location | Original text | Pattern | Edit made | Reason |
|---|---|---|---|---|
| Opening paragraph | `The central flaw in any race-first ideology...` | repeated-paragraph-cadence | Recast as `Any race-first ideology carries a central flaw...` | Varied adjacent paragraph openings while preserving the claim. |
| Second paragraph | `The strongest defense of critical race theory...` | repeated-paragraph-cadence | Recast as `Critical race theory's strongest defense...` | Removed repeated `The` opening without changing meaning. |
| Second paragraph | One paragraph combined the defense and response. | repeated-paragraph-cadence | Split after the first sentence. | Varied cadence without adding content. |
| Closing paragraph | `See people clearly enough...` | unsupported-certainty | Recast as `See people as persons...` | Removed an unsupported-certainty marker and made the sentence more concrete. |

## Kept Hits

| Location | Text | Pattern | Justification |
|---|---|---|---|
| None | None | None | No unresolved hits remain. |

## Final Audit Result

`0 unresolved AI-tell audit hits in body prose`
