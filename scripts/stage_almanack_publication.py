#!/usr/bin/env python3
"""Stage or verify an approved Almanack for a timed website release, offline.

The source package remains draft:true. Only its staged draft flag and a new
publishDate may differ. This program never commits, publishes, or sends email.
"""

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import runpy
import struct
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = "almanack-scheduled-publication-v1"
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def pinned_hugo(hugo):
    result = subprocess.run([str(hugo), "version"], check=True, capture_output=True, text=True)
    if not re.match(r"hugo v0\.167\.0.*\+extended", result.stdout):
        raise ValueError("Use the pinned Hugo Extended 0.167.0.")


def parse_with_hugo(source, hugo):
    """Use the site's parser and timezone, without a Python YAML dependency."""
    with tempfile.TemporaryDirectory(prefix="almanack-schedule-parse-") as tmp:
        root = Path(tmp)
        (root / "content").mkdir()
        (root / "layouts/_default").mkdir(parents=True)
        (root / "content/issue.md").write_bytes(source)
        (root / "hugo.toml").write_text('''baseURL = "https://outsideinprint.org/"
timeZone = "America/New_York"
disableKinds = ["home", "section", "taxonomy", "term", "rss", "sitemap"]
[outputs]
page = ["HTML", "ScheduleJSON"]
[outputFormats.ScheduleJSON]
mediaType = "application/json"
baseName = "schedule"
isPlainText = true
''', encoding="utf-8")
        (root / "layouts/_default/single.schedulejson.json").write_text(
            '{{ dict "params" .Params "draft" .Draft "date" (.Date.Format "2006-01-02T15:04:05-07:00") "publishDate" (.PublishDate.Format "2006-01-02T15:04:05-07:00") "route" (.OutputFormats.Get "HTML").RelPermalink | jsonify }}',
            encoding="utf-8")
        (root / "layouts/_default/single.html").write_text('{{ .Title }}', encoding="utf-8")
        subprocess.run([str(hugo), "--source", str(root), "--buildDrafts", "--buildFuture", "--panicOnWarning"],
                       check=True, capture_output=True, text=True)
        files = list((root / "public").rglob("schedule.json"))
        if len(files) != 1:
            raise ValueError("Expected one Hugo schedule metadata output.")
        return json.loads(files[0].read_text(encoding="utf-8"))


def release_time(value, issue_date, hugo, now=None):
    if not ISO.fullmatch(value):
        raise ValueError("Release requires a full ISO timestamp with explicit Eastern offset and seconds.")
    release = dt.datetime.fromisoformat(value)
    if release.date().isoformat() != issue_date:
        raise ValueError("Release must fall on the approved Almanack issue date.")
    # Let pinned Hugo's America/New_York timezone resolve DST, including Windows.
    wall = value[:19]
    eastern = parse_with_hugo(f'---\ntitle: Clock\ndate: "{wall}"\n---\n'.encode(), hugo)["date"]
    if eastern != value:
        raise ValueError(f"Release offset does not match America/New_York: expected {eastern}.")
    if release <= (now or dt.datetime.now(dt.timezone.utc)):
        raise ValueError("The authorized release time has passed; do not queue or retry it.")
    return release


def staged_source(source, release_at):
    """Change precisely one scalar and insert one scalar; preserve all other bytes."""
    source.decode("utf-8", errors="strict")
    match = re.match(rb"\A---(\r?\n)(.*?)\r?\n---(?:\r?\n|\Z)", source, re.S)
    if not match:
        raise ValueError("Expected one YAML front-matter block with an opening delimiter.")
    front = match[2]
    drafts = list(re.finditer(rb"(?im)^draft\s*:.*$", front))
    if len(drafts) != 1 or not re.fullmatch(rb"draft: true[ \t]*\r?", drafts[0][0]):
        raise ValueError("Approved source must have exactly one canonical draft: true field.")
    if re.search(rb"(?im)^publishdate\s*:", front):
        raise ValueError("Source package must not already declare publishDate; preserve the draft package.")
    old = drafts[0]
    start, end = match.start(2) + old.start(), match.start(2) + old.end()
    replacement = old[0].replace(b"true", b"false", 1)
    # Keep a CR in a CRLF source attached to its original line.
    if replacement.endswith(b"\r"):
        replacement = replacement[:-1]
        suffix = b"\r"
    else:
        suffix = b""
    replacement += match[1] + b"publishDate: " + release_at.encode("ascii") + suffix
    return source[:start] + replacement + source[end:]


def issue_assets(content, issue_date, package):
    """Only issue-specific approved static PNGs are copied; existing story art is reused."""
    prefix = f"/images/almanack/{issue_date}/"
    paths = set()

    def walk(value):
        if isinstance(value, dict):
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
        elif isinstance(value, str) and value.startswith("https://outsideinprint.org" + prefix):
            parsed = urlsplit(value)
            name = parsed.path.removeprefix(prefix)
            if parsed.netloc != "outsideinprint.org" or parsed.query or parsed.fragment or not re.fullmatch(r"[a-z0-9-]+[.]png", name):
                raise ValueError("Issue artwork must be a plain HTTPS PNG URL in the exact issue directory.")
            paths.add(name)

    walk(content)
    if "paper-masthead.png" not in paths:
        raise ValueError("Scheduled Almanack requires its approved issue-specific paper masthead.")
    assets = {}
    for name in sorted(paths):
        source = package / name if name == "paper-masthead.png" else package / "bob-poses" / name
        data = source.read_bytes()
        if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
            raise ValueError(f"Issue artwork is not a PNG: {source}")
        width, height = struct.unpack(">II", data[16:24])
        if not width or not height or max(width, height) > 8192:
            raise ValueError(f"Invalid artwork dimensions: {source}")
        assets[f"static{prefix}{name}"] = (source, data, width, height)
    return assets


def prepare(package, release_at, hugo, site_root=ROOT):
    package, site_root = Path(package).resolve(), Path(site_root).resolve()
    if site_root != ROOT:
        raise ValueError("Run the dedicated script from the intended clean publication worktree.")
    pinned_hugo(hugo)
    validator = runpy.run_path(str(ROOT / "scripts/validate_almanack_package.py"))
    previous_hugo = os.environ.get("OIP_HUGO_BIN")
    os.environ["OIP_HUGO_BIN"] = str(hugo)
    try:
        errors = validator["validate_package"](package, strict=True,
                                               affirmations_bank_path=ROOT / "editorial/affirmations-bank.md")
    finally:
        if previous_hugo is None:
            os.environ.pop("OIP_HUGO_BIN", None)
        else:
            os.environ["OIP_HUGO_BIN"] = previous_hugo
    if errors:
        raise ValueError("Strict Almanack package validation failed:\n" + "\n".join(errors))
    source = (package / "web-archive.md").read_bytes()
    exported = json.loads((package / "email.json").read_text(encoding="utf-8"))
    issue_date = exported["issue_date"]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", issue_date):
        raise ValueError("Invalid canonical issue date.")
    release_time(release_at, issue_date, hugo)
    source_info = parse_with_hugo(source, hugo)
    if source_info["draft"] is not True or source_info["params"].get("editorial_contract") != "almanack-v1":
        raise ValueError("Only validated draft almanack-v1 packages can be staged.")
    route = f"/almanack/{issue_date}/"
    if source_info["route"] != route or source_info["date"][:10] != issue_date:
        raise ValueError("Issue date and canonical Almanack route must agree.")
    number = exported["issue_number"]
    if type(number) is not int or number < 1 or exported.get("secondary_id") != number:
        raise ValueError("Canonical source and Buttondown issue numbers must agree.")
    staged = staged_source(source, release_at)
    staged_info = parse_with_hugo(staged, hugo)
    expected = dict(source_info["params"])
    expected["draft"] = False
    expected["publishdate"] = release_at
    if (staged_info["draft"] is not False or staged_info["publishDate"] != release_at
            or staged_info["route"] != route or staged_info["date"] != source_info["date"]
            or staged_info["params"] != expected):
        raise ValueError("Hugo parsed a staged change beyond draft and publishDate.")
    relative = f"content/almanack/{issue_date}.md"
    assets = issue_assets(exported["content"], issue_date, package)
    payload = {relative: staged, **{path: item[1] for path, item in assets.items()}}
    return payload, {
        "contract": CONTRACT, "status": "validated-local-payload", "issue_date": issue_date,
        "issue_number": number, "release_at": release_at, "release_eastern": f"{release_at[:10]} {release_at[11:16]} ET",
        "canonical_url": "https://outsideinprint.org" + route,
        "source_sha256": sha256(source), "staged_sha256": sha256(staged),
        "source_remains_draft": True, "package": str(package), "site_root": str(site_root),
        "payload_allowlist": sorted(payload),
        "files": {path: {"sha256": sha256(data), "bytes": len(data)} for path, data in payload.items()},
        "artwork": {path: {"source": str(item[0]), "width": item[2], "height": item[3], "sha256": sha256(item[1])}
                    for path, item in assets.items()},
        "remote_write": False, "email_delivery": False,
    }


def apply_payload(payload, site_root, validate_only=False):
    """Preflight every path before any write. Differing existing files are never overwritten."""
    root = Path(site_root).resolve()
    for relative, data in payload.items():
        target = (root / relative).resolve()
        if not target.is_relative_to(root):
            raise ValueError("Payload escaped the intended worktree.")
        if target.exists() and (not target.is_file() or target.read_bytes() != data):
            raise ValueError(f"Existing staged file differs; inspect before replacing: {relative}")
        if validate_only and not target.is_file():
            raise ValueError(f"Staged payload is missing: {relative}")
    if not validate_only:
        for relative, data in payload.items():
            target = root / relative
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("stage", "validate"))
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--release-at", required=True)
    parser.add_argument("--hugo", type=Path)
    parser.add_argument("--report", type=Path, help="Local receipt outside the publication worktree; defaults to the package.")
    args = parser.parse_args()
    renderer = runpy.run_path(str(ROOT / "scripts/render_almanack_distribution.py"))
    hugo = args.hugo or renderer["HUGO"]
    report = (args.report or args.package / "scheduled-publication-validation.json").resolve()
    if report.is_relative_to(ROOT):
        parser.error("Validation receipts must stay outside the publication worktree.")
    try:
        payload, receipt = prepare(args.package, args.release_at, hugo)
        apply_payload(payload, ROOT, validate_only=args.action == "validate")
        receipt["checked_at_utc"] = dt.datetime.now(dt.timezone.utc).isoformat()
        receipt["action"] = args.action
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(json.dumps({"status": "PASS", "action": args.action, "release_at": args.release_at,
                          "payload_files": len(payload), "report": str(report)}))
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f"Almanack scheduled publication failed: {exc}\n")


if __name__ == "__main__":
    main()
