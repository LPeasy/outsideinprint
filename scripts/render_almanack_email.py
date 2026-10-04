#!/usr/bin/env python3
"""Render review-only Almanack HTML/plaintext from the web issue's front matter.

Uses pinned Hugo for YAML parsing and templating; no provider, credentials,
network calls, subscriber operations, or additional Python packages.
"""

import argparse
import hashlib
import json
import re
import runpy
import shutil
import subprocess
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CONTRAST = runpy.run_path(str(Path(__file__).with_name("almanack_email_contrast.py")))
CONFIG = """baseURL = "https://outsideinprint.org/"
timeZone = "America/New_York"
disableKinds = ["home", "section", "taxonomy", "term", "rss", "sitemap"]
[outputs]
page = ["Email", "EmailText", "EmailData"]
[outputFormats.Email]
mediaType = "text/html"
baseName = "email"
isHTML = true
permalinkable = false
[outputFormats.EmailText]
mediaType = "text/plain"
baseName = "email"
isPlainText = true
permalinkable = false
[outputFormats.EmailData]
mediaType = "application/json"
baseName = "email"
isPlainText = true
permalinkable = false
"""


def check_editorial_content(content):
    """Historical issues remain readable; new editions opt into the checklist."""
    if content.get("editorial_contract") != "almanack-v1":
        return
    essays = content.get("essays", [])
    excerpt = essays[0].get("excerpt", "") if essays else ""
    if not 60 <= len(excerpt.split()) <= 100:
        raise ValueError("The lead requires an actual 60–100-word excerpt.")
    if not content.get("email_preheader", "").strip():
        raise ValueError("Provide an issue-specific email_preheader.")
    note = content.get("bob_note", "")
    if not note.strip() or len(note.split()) > 50:
        raise ValueError("Provide a specific Bob note of at most 50 words.")
    for essay in essays[1:]:
        if not essay.get("capsule", "").strip():
            raise ValueError("Every supporting card requires a concrete capsule.")
    if not content.get("worth_reprinting", {}).get("rationale", "").strip():
        raise ValueError("Worth Reprinting requires a why-this-week rationale.")


def check_issue_number(metadata):
    """Bind the provider's footer number to the approved source, never its counter."""
    number = metadata.get("issue_number")
    if type(number) is not int or number < 1:
        raise ValueError("The canonical issue_number must be a positive integer.")
    content = metadata["content"]
    if content.get("issue_number") != number:
        raise ValueError("Exported issue_number must match the source issue_number.")
    match = re.search(r"\bIssue ([1-9][0-9]*)$", metadata.get("subject", ""))
    if not match or int(match[1]) != number:
        raise ValueError("The email subject must end with the canonical Issue number.")
    masthead = content.get("email_masthead") or {}
    if masthead.get("image_url") and masthead.get("issue_number") != number:
        raise ValueError("The image masthead must match the canonical issue_number.")
    return number


def render(issue_path, output_dir, hugo):
    issue_path = Path(issue_path).resolve()
    output_dir = Path(output_dir).resolve()
    if not issue_path.is_file():
        raise ValueError(f"Issue file does not exist: {issue_path}")
    for forbidden in ("content", "static", "public"):
        if output_dir.is_relative_to(REPO / forbidden):
            raise ValueError("Email review artifacts must stay outside content/static/public.")
    version = subprocess.run([hugo, "version"], check=True, capture_output=True, text=True).stdout
    if not re.match(r"hugo v0\.164\.0.*\+extended", version):
        raise ValueError("Use the repository's pinned Hugo Extended 0.164.0.")

    source = issue_path.read_bytes()
    with tempfile.TemporaryDirectory(prefix="oip-almanack-email-") as directory:
        project = Path(directory)
        (project / "content/almanack").mkdir(parents=True)
        (project / "layouts/almanack").mkdir(parents=True)
        (project / "content/almanack/issue.md").write_bytes(source)
        (project / "hugo.toml").write_text(CONFIG, encoding="utf-8")
        for name in ("single.email.html", "single.emailtext.txt", "single.emaildata.json"):
            shutil.copyfile(REPO / "layouts/almanack" / name, project / "layouts/almanack" / name)
        shutil.copytree(REPO / "layouts/partials/almanack", project / "layouts/partials/almanack")
        subprocess.run([hugo, "--source", str(project), "--buildDrafts", "--buildFuture",
                        "--panicOnWarning"], check=True, capture_output=True, text=True)
        artifacts = {}
        for suffix in ("html", "txt", "json"):
            matches = list((project / "public").rglob(f"email.{suffix}"))
            if len(matches) != 1:
                raise ValueError(f"Expected exactly one email.{suffix} artifact.")
            artifacts[suffix] = matches[0].read_text(encoding="utf-8")
        artifacts["html"] = CONTRAST["apply_contrast"](artifacts["html"])
        metadata = json.loads(artifacts["json"])
        metadata["email_contrast_contract"] = CONTRAST["CONTRAST_CONTRACT"]
        check_editorial_content(metadata["content"])
        metadata["secondary_id"] = check_issue_number(metadata)

    output_dir.mkdir(parents=True, exist_ok=True)
    metadata.update({"source_file": str(issue_path), "source_sha256": hashlib.sha256(source).hexdigest(),
                     "review_only": True, "provider_preview_verified": False})
    for suffix in ("html", "txt"):
        (output_dir / f"email.{suffix}").write_text(artifacts[suffix], encoding="utf-8")
    (output_dir / "email.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output_dir / "REVIEW.txt").write_text(
        "REVIEW ARTIFACT ~ NOT A SEND OR PROVIDER PREVIEW\n"
        f"{metadata['subject']}\nPreheader: {metadata['preheader']}\n\n"
        "This full HTML document and matching plaintext use the supplied issue front matter.\n"
        "HTML uses explicit parchment/ink pairs on retained content elements and blue underlined links.\n"
        "Light/dark browser simulations do not certify an actual email client.\n"
        f"Set Buttondown's top-level secondary_id (Issue number) to {metadata['secondary_id']}\n"
        "when creating the draft. Metadata alone does not set its footer number.\n"
        "Read back secondary_id and subject before preview, scheduling, or sending;\n"
        "stop on a missing or mismatched number. Inspect the actual provider footer.\n"
        "Provider wrappers, social links, and subscriber-specific unsubscribe/footer\n"
        "links require provider review. No provider configuration was changed.\n",
        encoding="utf-8")
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issue", required=True, help="Approved issue source or private review copy")
    parser.add_argument("--output-dir", required=True, help="Local review artifact directory")
    parser.add_argument("--hugo", default="hugo", help="Pinned Hugo executable or repository wrapper")
    args = parser.parse_args()
    try:
        metadata = render(args.issue, args.output_dir, args.hugo)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Almanack email render failed: {error}\n")
    print(json.dumps({"subject": metadata["subject"], "output_dir": str(Path(args.output_dir).resolve()),
                      "review_only": True, "provider_preview_verified": False}))


if __name__ == "__main__":
    main()
