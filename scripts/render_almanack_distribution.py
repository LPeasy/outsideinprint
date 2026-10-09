#!/usr/bin/env python3
"""Export the approved Classic email body through the shared PR #131 renderer."""
import argparse
import hashlib
import json
import os
import shutil
import re
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORTER = ROOT / "config/almanack-email/exporter/scripts/render_almanack_email.py"
PINNED_HUGO = Path.home() / "Documents/30_Resources/toolchains/hugo/0.167.0/hugo.exe"
HUGO = Path(os.environ.get("OIP_HUGO_BIN") or (str(PINNED_HUGO) if PINNED_HUGO.is_file() else shutil.which("hugo")) or PINNED_HUGO)
CONTRACT = "classic-shared-v1"
MEDIUM = "https://medium.com/the-balanced-sheet"
CONTRAST = runpy.run_path(str(Path(__file__).with_name("almanack_email_contrast.py")))



EXTENSION = "almanack-bob-bookshelf-v1"

def exporter_signature():
    root = EXPORTER.parents[1]
    paths = [p for folder in (root / "scripts", root / "layouts") for p in folder.rglob("*") if p.is_file() and p.suffix in (".py", ".html", ".txt", ".json")]
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.relative_to(root).as_posix().encode("utf-8") + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()


def render(issue, output_dir, hugo=HUGO):
    module = runpy.run_path(str(EXPORTER))
    metadata = module["render"](issue, output_dir, str(hugo))
    number = metadata.get("issue_number")
    content = metadata.get("content", {})
    masthead = content.get("email_masthead")
    if (type(number) is not int or number <= 0
            or type(content.get("issue_number")) is not int
            or content.get("issue_number") != number
            or not re.search(r"\bIssue " + str(number) + r"$", metadata.get("subject", ""))
            or (masthead is not None and (type(masthead.get("issue_number")) is not int
                                         or masthead.get("issue_number") != number))):
        raise ValueError("Canonical issue number, subject and masthead must agree before Buttondown handoff.")
    metadata["secondary_id"] = number
    directory = Path(output_dir)
    html_path = directory / "email.html"
    text_path = directory / "email.txt"
    body = html_path.read_text(encoding="utf-8")
    footer = '<a style="color:#346782;" href="https://outsideinprint.org/">Outside In Print</a>'
    if body.count(footer) != 1:
        raise ValueError("Expected exactly one shared Outside In Print footer link.")
    body = body.replace(footer, footer + f' · <a style="color:#346782;" href="{MEDIUM}">The Balanced Sheet</a>')
    body = CONTRAST["apply_contrast"](body)
    html_path.write_text(body, encoding="utf-8", newline="\n")
    text = text_path.read_text(encoding="utf-8")
    text = text.replace("https://outsideinprint.org/\nColor over the lines.",
                        f"https://outsideinprint.org/\nThe Balanced Sheet: {MEDIUM}\nColor over the lines.")
    if MEDIUM not in text:
        raise ValueError("The plaintext footer is missing The Balanced Sheet.")
    text_path.write_text(text, encoding="utf-8", newline="\n")
    metadata.update(distribution_contract=CONTRACT, buttondown_template="classic",
                    email_contrast_contract=CONTRAST["CONTRAST_CONTRACT"],
                    exporter_commit="248757a3bef9406435c9472728985597d53ecb7e",
                    html_sha256=hashlib.sha256(html_path.read_bytes()).hexdigest(),
                    text_sha256=hashlib.sha256(text_path.read_bytes()).hexdigest())
    if any(content.get(key) for key in ("bob_feature", "bob_ornaments", "bookshelf")):
        metadata.update(exporter_base_commit=metadata["exporter_commit"],
                        exporter_extension=EXTENSION,
                        exporter_extension_sha256=exporter_signature())
    (directory / "email.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    review_path = directory / "REVIEW.txt"
    review = review_path.read_text(encoding="utf-8")
    review += (f"\nButtondown Issue number (top-level secondary_id): {number}. "
               "Set this per email; metadata alone does not set the footer. "
               "Read back the saved draft and verify its number and exact subject "
               "against this export and the masthead before preview, scheduling or sending.\n")
    review_path.write_text(review, encoding="utf-8", newline="\n")
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issue", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--hugo", type=Path, default=HUGO)
    args = parser.parse_args()
    metadata = render(args.issue, args.output_dir, args.hugo)
    print(json.dumps({key: metadata[key] for key in ("subject", "preheader", "distribution_contract", "provider_preview_verified")}))


if __name__ == "__main__":
    main()
