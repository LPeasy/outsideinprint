# Codex Workflow for Outside In Print

## Purpose
Use Codex as an execution agent for print-output quality, not as general brainstorming chat.

## Standard Task Contract
Use this structure in every request:

```text
Goal:
Acceptance Criteria:
Constraints:
Validation:
Deliverable:
```

Example:

```text
Goal: Fix invoice PDF so SKU and quantity never wrap.
Acceptance Criteria: SKU and qty stay on one line at 100%, 125%, and 150% zoom.
Constraints: Keep current typography and spacing scale.
Validation: Build site and generate sample output for 3 real orders.
Deliverable: Code changes + validation summary + risks.
```

## Operating Rules
1. Ask Codex to implement immediately, not only propose.
2. Keep scope to one feature or one bug per request.
3. Require validation commands to run after edits.
4. Require output artifact checks for print-facing changes.
5. Require assumptions to be listed before risky edits.
6. Require changed files and regression risks in every response.

## Prompt Templates

### 1) Feature Template
```text
Implement this now.

Goal:
[one concrete user-visible print outcome]

Acceptance Criteria:
- [criterion 1]
- [criterion 2]

Constraints:
- Do not change unrelated behavior.
- Preserve existing style and structure.

Validation:
- Run relevant tests/lint/build.
- Generate representative print output samples.

Response format:
1) What changed
2) Validation run
3) Risks/follow-ups
4) Exact files touched
```

### 2) Bugfix Template
```text
Reproduce, fix, and prevent regression.

Bug:
[describe symptom + where seen]

Expected behavior:
[expected output]

Requirements:
- Add or update a regression test if feasible.
- Keep fix minimal and scoped.

Validation:
- Show reproduction signal before fix.
- Show passing signal after fix.

Response format:
1) Root cause
2) Fix implemented
3) Validation run
4) Files touched
```

### 3) Review Template
```text
Do a code review for this change.
Prioritize findings: bugs, regressions, missing tests, risky assumptions.
Output findings first, sorted by severity, with file/line references.
If no issues are found, say so explicitly and list residual risks/test gaps.
```

## Print-Focused Validation Checklist
Run this checklist whenever layout/output code changes:

1. Build/render succeeds with no new errors.
2. Pagination is stable (no orphan headings, broken table rows, or clipped footers).
3. Critical fields never wrap unexpectedly (SKU, qty, price, order IDs).
4. Font fallback is acceptable for special characters.
5. Barcodes/QR codes remain scannable in generated output.
6. Margins/bleed/safe zones remain within spec.
7. At least one realistic sample per major template is generated and reviewed.

## Team Response Standard
Require Codex to always return:

1. What changed
2. Validation run
3. Risks/follow-ups
4. Exact files touched

## Suggested Project Commands
Adjust as needed for your environment; keep command output in each task response.

```powershell
# Run tests
npm test

# Build site/output
hugo

# Optional lint/type checks (if configured)
npm run lint
npm run typecheck
```