# AI-Tell Cleanup Report

Target file: `C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-04-borrowed-hour\story.md`  
Date reviewed: 2026-07-04  
Reviewer: Codex / ai-tell-remover

## Search Context

Search query or mode: `current AI writing tells formulaic prose 2026`
Live-search date: 2026-07-04

Current tells learned:

1. Formulaic contrast frames that overuse "not X, but Y."
2. Abstract setup openers before the concrete subject.
3. Generic recap phrases such as "ultimately" and "key takeaway."
4. Over-balanced three-part explanation structures.
5. Bland evaluative scaffolds such as "the claim is simple" and "the real test is."
6. Repeated paragraph cadence with similar openings.

## Scan Commands

```powershell
python C:\Users\lawto\.codex\skills\ai-tell-remover\scripts\ai_tell_scan.py --input C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-04-borrowed-hour\story.md --body-only --format markdown
python C:\Users\lawto\.codex\skills\ai-tell-remover\scripts\ai_tell_scan.py --input C:\Users\lawto\Documents\OutsideInPrint\output\simple_logic_candidates\2026-07-04-borrowed-hour\story.md --body-only --format markdown --strict
```

## Scan Summary

| Pass | Hits | Notes |
|---|---:|---|
| Before cleanup | 2 | Two high-severity contrast-cliche hits found. |
| After cleanup | 0 | Final strict scan passed. |

## Final Audit Result

0 unresolved AI-tell audit hits in body prose

