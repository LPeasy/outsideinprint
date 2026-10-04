#!/usr/bin/env python3
"""Install the contrast adapter into the existing local Almanack workflow.

No provider calls. Validate every bounded edit before backups or writes.
Keep the immutable exporter snapshot and canonical-numbering guards unchanged.
"""
import argparse
import hashlib
import json
from pathlib import Path
import uuid


CONTRACT = "parchment-paired-v1"
POLICY = (
    "Pair dark ink #332a22 with cream #f4eddf directly on retained content cells and "
    "reader-facing elements, including quote paragraphs, so removing the outer body "
    "does not lose text color. Keep blue #346782 links underlined. Retain these fixed "
    "pairs in normal and dark provider-wrapper simulations. Local simulations do not "
    "verify an actual email client: inspect the approved provider and received preview "
    "in light and dark modes before claiming client verification. Keep custom provider "
    "CSS disabled and preserve sent emails."
)
OLD_STANDARD = "The sole body adaptation is the approved Medium footer link, included in HTML and plaintext."
NEW_STANDARD = (
    "The wrapper adds the approved Medium footer link in HTML and plaintext, then "
    "applies the parchment-paired-v1 contrast adapter to HTML. " + POLICY
)
OLD_SKILL = "The project wrapper uses the immutable shared renderer from merged PR #131 and adds the approved Medium footer link."
NEW_SKILL = OLD_SKILL + " It then applies the parchment-paired-v1 contrast adapter to HTML. " + POLICY


def replace_once(text, old, new, label):
    if text.count(new) == 1:
        if old in text.replace(new, "", 1):
            raise ValueError(f"{label}: mixed old and installed snippets; no files changed")
        return text
    if text.count(old) != 1:
        raise ValueError(f"{label}: expected exactly one known snippet; no files changed")
    return text.replace(old, new, 1)


def patch_renderer(text):
    # Require the installed canonical-numbering fix; never silently bypass it.
    for guard in ('    metadata["secondary_id"] = number\n',
                  '        raise ValueError("Canonical issue number, subject and masthead must agree before Buttondown handoff.")\n'):
        if text.count(guard) != 1:
            raise ValueError("Expected installed canonical-numbering guard; no files changed")
    changes = (
        ('MEDIUM = "https://medium.com/the-balanced-sheet"\n',
         'MEDIUM = "https://medium.com/the-balanced-sheet"\nCONTRAST = runpy.run_path(str(Path(__file__).with_name("almanack_email_contrast.py")))\n'),
        ('    html_path.write_text(body, encoding="utf-8", newline="\\n")',
         '    body = CONTRAST["apply_contrast"](body)\n    html_path.write_text(body, encoding="utf-8", newline="\\n")'),
        ('    metadata.update(distribution_contract=CONTRACT, buttondown_template="classic",\n',
         '    metadata.update(distribution_contract=CONTRACT, buttondown_template="classic",\n                    email_contrast_contract=CONTRAST["CONTRAST_CONTRACT"],\n'),
    )
    for index, (old, new) in enumerate(changes):
        text = replace_once(text, old, new, f"render_almanack_distribution.py edit {index + 1}")
    return text


def patch_standard(text):
    data = json.loads(text)
    if data.get("standard") != "classic-shared-v1" or data.get("template") != "classic":
        raise ValueError("Expected Classic shared standard; no files changed")
    if "secondary_id" not in data.get("provider_numbering", ""):
        raise ValueError("Expected installed provider-numbering policy; no files changed")
    for key, value in (("email_contrast_contract", CONTRACT), ("body_contrast", POLICY)):
        if key in data and data[key] != value:
            raise ValueError(f"Unknown {key}; no files changed")
    old = '  "provider_numbering": '
    new = ('  "email_contrast_contract": ' + json.dumps(CONTRACT) + ',\n'
           '  "body_contrast": ' + json.dumps(POLICY) + ',\n' + old)
    result = replace_once(text, old, new, "standard.json")
    # A partial or duplicated previous installation must not produce duplicate keys.
    if result.count('"email_contrast_contract":') != 1 or result.count('"body_contrast":') != 1:
        raise ValueError("Partial or duplicate contrast policy; no files changed")
    return result


def plan_changes(workspace_root, skill_path, helper_source):
    root = Path(workspace_root).resolve()
    helper = Path(helper_source).read_bytes()
    changes = []

    def update(path, transform):
        original = path.read_bytes()
        text = original.decode("utf-8").replace("\r\n", "\n")
        changed = transform(text)
        newline = "\r\n" if b"\r\n" in original else "\n"
        result = changed.replace("\n", newline).encode("utf-8")
        if result != original:
            changes.append((path, original, result))

    update(root / "scripts/render_almanack_distribution.py", patch_renderer)
    update(root / "scripts/validate_almanack_distribution.py", lambda text: replace_once(
        text,
        '            fresh = module["render"](issue, output)\n',
        '            fresh = module["render"](issue, output)\n'
        '            if metadata.get("email_contrast_contract") != fresh.get("email_contrast_contract"):\n'
        '                errors.append("email.json email_contrast_contract is stale.")\n',
        "validate_almanack_distribution.py"))
    update(root / "config/almanack-email/standard.json", patch_standard)
    update(root / "config/almanack-email/approved-buttondown-standard.md", lambda text: replace_once(
        text, OLD_STANDARD, NEW_STANDARD, "approved-buttondown-standard.md"))
    update(Path(skill_path).resolve(), lambda text: replace_once(text, OLD_SKILL, NEW_SKILL, "SKILL.md"))
    destination = root / "scripts/almanack_email_contrast.py"
    if destination.exists():
        if destination.read_bytes() != helper:
            raise ValueError("Existing contrast helper differs; no files changed")
    else:
        changes.append((destination, None, helper))
    return changes


def install(workspace_root, skill_path, backup_dir, helper_source):
    changes = plan_changes(workspace_root, skill_path, helper_source)
    if not changes:
        return []
    for path, original, _ in changes:
        if (path.read_bytes() if path.exists() else None) != original:
            raise ValueError(f"{path} changed during preflight; no files changed")
    backup = Path(backup_dir).resolve() / ("almanack-contrast-" + uuid.uuid4().hex)
    backup.mkdir(parents=True)
    manifest = []
    for index, (path, original, changed) in enumerate(changes):
        filename = f"{index:02d}-{path.name}"
        if original is not None:
            (backup / filename).write_bytes(original)
        manifest.append({"path": str(path), "backup": filename if original is not None else None,
                         "before_sha256": hashlib.sha256(original).hexdigest() if original is not None else None,
                         "after_sha256": hashlib.sha256(changed).hexdigest()})
    (backup / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for path, _, changed in changes:
        path.write_bytes(changed)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--skill-path", type=Path, required=True, help="Installed oip-bobs-almanack SKILL.md")
    parser.add_argument("--backup-dir", type=Path, required=True)
    parser.add_argument("--helper-source", type=Path, default=Path(__file__).with_name("almanack_email_contrast.py"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        changes = plan_changes(args.workspace_root, args.skill_path, args.helper_source)
        print(json.dumps({"check": "PASS", "pending_files": [str(change[0]) for change in changes]}, indent=2))
    else:
        print(json.dumps({"installed": install(args.workspace_root, args.skill_path, args.backup_dir, args.helper_source)}, indent=2))


if __name__ == "__main__":
    main()
