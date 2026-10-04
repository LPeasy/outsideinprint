#!/usr/bin/env python3
"""Install the approved Almanack social policy and a scoped skill handoff.

No renderer, network, provider, automation or scheduling changes. Unknown local
content stops preflight before any write. Preserve every replaced file in backups.
"""
import argparse
import hashlib
import json
from pathlib import Path
import uuid


STANDARD_ID = "almanack-issue-launch-sample-v1"
STANDARD_SOURCE = Path(__file__).resolve().parents[1] / "config/almanack-social/standard.json"
SKILL_ANCHOR = (
    "Keep BUTTONDOWN_API_KEY only in the process environment if an already authorized API handoff uses it. "
    "Never log, save or expose it; do not create credentials as part of template work. "
    "Prefer the signed-in supported browser when the user requests it.\n\n"
    "## Automation and authorization\n"
)
SKILL_SECTION = """## Almanack issue-launch social

For future manually authorized Almanack issue-launch social preparation and handoff, follow `config/almanack-social/standard.json` in the canonical workspace. This is a separate social preparation step; it does not add work to the weekly email automation or authorize posting, scheduling or changes to other campaigns.

Use a readable sample: compact Bob's Almanack masthead, the actual canonical issue date and number, the selected article's actual artwork and exact title, a short verbatim excerpt, and a clear CTA on warm cream. Preserve the complete artwork without cropping, stretching, substitution or regeneration. Use the owner's Library references named in the standard for visual direction; their historical date, number and content are not future defaults. Do not claim pixel inspection until the reference was actually viewed.

Prepare Facebook and Instagram assets at 1080 x 1350 and Pinterest at 1080 x 1620. Keep Facebook and Pinterest destinations as the direct canonical issue URL; keep Instagram's existing Almanack link-in-bio destination. Verify the excerpt against the selected article body, and the date, number, title and artwork against the approved issue. Save a verification report beside the assets with source references, exact excerpt, measured dimensions, destinations and review results.

Review the exact final assets at phone viewing size before handoff or any separately authorized publication. Shorten the selected verbatim passage instead of shrinking text until unreadable. Stop on missing source verification, incorrect dimensions or destinations, unreadable text, or cropped artwork. Keep the generic site share card, non-Almanack campaigns, email controls and current automation schedule unchanged."""


def load_standard(path):
    standard = json.loads(Path(path).read_text(encoding="utf-8"))
    if standard.get("schema_version") != 1 or standard.get("standard_id") != STANDARD_ID:
        raise ValueError("Unknown Almanack social standard; no files changed")
    scope = standard.get("scope", {})
    if (scope.get("campaign_type") != "issue_launch"
            or scope.get("applies_to") != "future manually authorized social preparation and handoff"
            or any(scope.get(key) is not False for key in (
                "changes_weekly_automation", "authorizes_posting_or_scheduling",
                "changes_other_campaigns", "changes_email_controls"))):
        raise ValueError("Social standard exceeds the approved preparation scope; no files changed")
    expected = {
        "facebook": (1080, 1350, "direct_canonical_issue_url"),
        "instagram": (1080, 1350, "existing_almanack_link_in_bio"),
        "pinterest": (1080, 1620, "direct_canonical_issue_url"),
    }
    platforms = standard.get("platforms", {})
    if set(platforms) != set(expected):
        raise ValueError("Unknown social platform set; no files changed")
    for name, contract in expected.items():
        data = platforms[name]
        if tuple(data.get(key) for key in ("width", "height", "destination")) != contract:
            raise ValueError(f"Wrong {name} dimensions or destination; no files changed")
    artwork = standard.get("artwork", {})
    if (artwork.get("preserve_whole_artwork") is not True
            or any(artwork.get(key) is not False for key in (
                "allow_crop", "allow_stretch", "allow_substitution_or_regeneration"))):
        raise ValueError("Artwork preservation contract is missing; no files changed")
    references = standard.get("references", [])
    if [item.get("library_file_id") for item in references] != [
        "libfile_d57c65df3b4481918a8d0cbc2f04139a", "libfile_23228fcc3ed08191ba899ec0988f3ce1"
    ]:
        raise ValueError("Approved Library references differ; no files changed")
    if any(item.get("pixel_inspection") not in ("pending", "verified") for item in references):
        raise ValueError("Reference inspection status is missing; no files changed")
    if set(standard.get("source_verification", {})) != {
        "issue_date", "issue_number", "article", "excerpt", "destination"
    } or not standard.get("review", {}).get("required_before_handoff"):
        raise ValueError("Source verification and review requirements are missing; no files changed")
    return standard


def patch_skill(text):
    installed = SKILL_ANCHOR.replace(
        "\n\n## Automation and authorization\n",
        "\n\n" + SKILL_SECTION + "\n\n## Automation and authorization\n",
    )
    if text.count(installed) == 1:
        rest = text.replace(installed, "", 1)
        if SKILL_ANCHOR in rest or "## Almanack issue-launch social" in rest:
            raise ValueError("Mixed social skill sections; no files changed")
        return text
    if text.count(SKILL_ANCHOR) != 1 or "## Almanack issue-launch social" in text:
        raise ValueError("Expected one known skill anchor; no files changed")
    return text.replace(SKILL_ANCHOR, installed, 1)


def plan_changes(workspace_root, skill_path, standard_source=STANDARD_SOURCE):
    root = Path(workspace_root).resolve()
    skill = Path(skill_path).resolve()
    source = Path(standard_source).resolve()
    load_standard(source)
    standard = source.read_bytes().replace(b"\r\n", b"\n")
    destination = root / "config/almanack-social/standard.json"
    changes = []
    if destination.exists():
        if destination.read_bytes().replace(b"\r\n", b"\n") != standard:
            raise ValueError("Existing social standard differs; no files changed")
    else:
        changes.append((destination, None, standard))
    original = skill.read_bytes()
    text = original.decode("utf-8").replace("\r\n", "\n")
    updated = patch_skill(text)
    newline = "\r\n" if b"\r\n" in original else "\n"
    result = updated.replace("\n", newline).encode("utf-8")
    if result != original:
        changes.append((skill, original, result))
    return changes


def _check_unchanged(changes):
    for path, original, _ in changes:
        if (path.read_bytes() if path.exists() else None) != original:
            raise ValueError(f"{path} changed during preflight; no installed files changed")


def install(workspace_root, skill_path, backup_dir, standard_source=STANDARD_SOURCE):
    changes = plan_changes(workspace_root, skill_path, standard_source)
    if not changes:
        return []
    _check_unchanged(changes)
    backup = Path(backup_dir).resolve() / ("almanack-social-" + uuid.uuid4().hex)
    backup.mkdir(parents=True)
    manifest = []
    for index, (path, original, changed) in enumerate(changes):
        filename = f"{index:02d}-{path.name}" if original is not None else None
        if filename:
            (backup / filename).write_bytes(original)
        manifest.append({
            "path": str(path), "backup": filename,
            "before_sha256": hashlib.sha256(original).hexdigest() if original is not None else None,
            "after_sha256": hashlib.sha256(changed).hexdigest(),
        })
    (backup / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    _check_unchanged(changes)
    for path, _, changed in changes:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(changed)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", required=True, type=Path)
    parser.add_argument("--skill-path", required=True, type=Path)
    parser.add_argument("--backup-dir", required=True, type=Path)
    parser.add_argument("--standard-source", type=Path, default=STANDARD_SOURCE)
    parser.add_argument("--check", action="store_true", help="Preflight only; write nothing")
    args = parser.parse_args()
    if args.check:
        changes = plan_changes(args.workspace_root, args.skill_path, args.standard_source)
        print(json.dumps({"check": "PASS", "pending_files": [str(row[0]) for row in changes]}, indent=2))
    else:
        print(json.dumps({"installed": install(args.workspace_root, args.skill_path, args.backup_dir,
                                               args.standard_source)}, indent=2))


if __name__ == "__main__":
    main()
