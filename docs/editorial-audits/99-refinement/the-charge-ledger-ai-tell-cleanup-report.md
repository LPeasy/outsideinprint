# AI-Tell Cleanup Report

Target file: `C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-01-the-charge-ledger\story.md`  
Date reviewed: 2026-07-01  
Reviewer: Codex / ai-tell-remover

## Search Context

Search query or mode: `AI writing tells common phrases ChatGPT writing patterns 2026`; `how to spot AI generated writing common phrases 2026`  
Live-search date: 2026-07-01

Current tells learned (3 to 6):

1. Excessive em dash use as a polish shortcut.
2. Forced sass or canned contrast pivots.
3. Cliche openings such as fast-paced landscape framing.
4. Predictable paragraph and transition patterns.
5. Semi-formal AI vocabulary such as `delve`, `resonate`, `navigate`, and `commendable`.
6. Neat recap endings such as `ultimately`, `in summary`, and `to conclude`.

## Scan Commands

```powershell
python C:\Users\lawto\.codex\skills\ai-tell-remover\scripts\ai_tell_scan.py --input C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-01-the-charge-ledger\story.md --body-only --format markdown
python C:\Users\lawto\.codex\skills\ai-tell-remover\scripts\ai_tell_scan.py --input C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-01-the-charge-ledger\story.md --body-only --format markdown --strict
```

## Scan Summary

| Pass | Hits | Notes |
|---|---:|---|
| Before cleanup / refinement pass | 0 | Baseline before this general-audience pass was already clean. |
| After cleanup / refinement pass | 0 | Final strict scan passed. |

## Changes Applied

| Location | Original text | Pattern | Edit made | Reason |
|---|---|---|---|---|
| story.md opening | `The big number is easy to remember` | general-audience clarity | Recast around `One big number can hide several different columns.` | Opens with the reader's concrete ledger problem. |
| story.md early body | `found a large set` | legal-status precision | Recast as `announced charges alleging` | Keeps allegation status intact. |
| story.md section heads | `Claim -> Premise?`, `Logical Result`, `Possible Problem`, `What Breaks?` | scaffolding | Replaced with `The Big Number`, `Different Columns`, `Why Early Action Can Be Fair`, `The Simple Test` | Keeps logic visible without internal audit language. |
| story.md late body | `public-accounting problem`, `category drift` | abstraction | Replaced with `mixed columns`, `clean labels`, and `one pile` | Uses general-audience nouns. |

## Kept Hits

| Location | Text | Pattern | Justification |
|---|---|---|---|
| None | None | None | No unresolved hits remain. |

## Final Audit Result

0 unresolved AI-tell audit hits in body prose
