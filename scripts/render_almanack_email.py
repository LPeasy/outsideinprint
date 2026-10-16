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


def check_optional_components(content):
    """Validate only explicitly supplied additions; historical issues stay unchanged."""
    steam = "https://store.steampowered.com/app/4978200/Idle_Times/"
    feature = content.get("bob_feature")
    if feature:
        if not isinstance(feature, dict) or not feature.get("title") or not feature.get("cta_label"):
            raise ValueError("bob_feature requires title and cta_label.")
        paragraphs = feature.get("paragraphs")
        if not isinstance(paragraphs, list) or not paragraphs or any(not isinstance(p, str) or not p.strip() for p in paragraphs):
            raise ValueError("bob_feature.paragraphs must contain nonempty plain text.")
        if feature.get("cta_url") != "https://outsideinprint.org/" or feature.get("secondary_cta_url") != steam or not feature.get("secondary_cta_label"):
            raise ValueError("The Bob demo invitation must point to the homepage and its secondary link to Steam.")
    ornaments = content.get("bob_ornaments")
    layout = content.get("bob_layout")
    if layout is not None and layout != "scattered-v1":
        raise ValueError("Unsupported bob_layout; use scattered-v1 or omit it for the historical layout.")
    if layout == "scattered-v1":
        allowed = {"masthead", "note", "lead", "guest", "divider", "bookshelf", "stories", "signoff"}
        if not isinstance(ornaments, dict) or not 1 <= len(ornaments) <= 8 or not set(ornaments).issubset(allowed):
            raise ValueError("scattered-v1 requires one to eight supported static pose slots.")
        dependencies = {"note": bool(content.get("bob_note")),
                        "lead": bool(content.get("essays")),
                        "guest": bool(content.get("guest_feature")),
                        "bookshelf": bool(content.get("bookshelf")),
                        "stories": len(content.get("essays", [])) >= 3,
                        "signoff": bool(content.get("closing_quote"))}
        if any(slot in ornaments and not present for slot, present in dependencies.items()):
            raise ValueError("Each selected scattered-v1 pose requires its corresponding editorial section.")
    if ornaments:
        allowed = {"masthead", "feature", "divider", "signoff"}
        if layout != "scattered-v1" and (not isinstance(ornaments, dict) or not 3 <= len(ornaments) <= 4 or not set(ornaments).issubset(allowed)):
            raise ValueError("bob_ornaments requires three or four supported static pose slots.")
        if "feature" in ornaments and not feature:
            raise ValueError("The hanging pose requires a Bob feature invitation.")
        for slot, pose in ornaments.items():
            if not isinstance(pose, dict) or pose.get("url") != steam or not isinstance(pose.get("image_alt"), str) or not pose["image_alt"].strip():
                raise ValueError("Every Bob ornament requires a functional accessible name and the Steam destination.")
            if not re.fullmatch(r"https://outsideinprint[.]org/.+[.](?:png|jpe?g|gif)", pose.get("image_url", ""), re.I):
                raise ValueError("Bob ornaments require hosted HTTPS raster images on Outside In Print.")
            if type(pose.get("width")) is not int or not 1 <= pose["width"] <= 320:
                raise ValueError("Bob ornament width must be an integer from 1 to 320 pixels.")
            if layout == "scattered-v1":
                if pose["width"] > 160 or type(pose.get("height")) is not int or not 1 <= pose["height"] <= 240:
                    raise ValueError("scattered-v1 poses require width at most 160 and explicit height from 1 to 240 pixels.")
                if pose.get("align", "right") not in ("left", "center", "right"):
                    raise ValueError("Bob ornament align must be left, center or right.")
            if "offset_pct" in pose and (layout != "scattered-v1" or slot != "masthead" or type(pose["offset_pct"]) is not int or not 0 <= pose["offset_pct"] <= 80):
                raise ValueError("Only the scattered masthead may use an integer offset_pct from 0 to 80.")
            if "placement" in pose and (layout != "scattered-v1" or slot != "lead" or pose["placement"] != "after-title"):
                raise ValueError("Only the scattered lead may use placement: after-title.")
            if "trail" in pose:
                trail = pose["trail"]
                if layout != "scattered-v1" or slot != "divider" or not isinstance(trail, dict) or set(trail) != {"image_url", "image_alt", "width", "height"}:
                    raise ValueError("Only the scattered divider may include a static raster trail with image_url, image_alt, width and height.")
                if not re.fullmatch(r"https://outsideinprint[.]org/.+[.]png", trail.get("image_url", ""), re.I) or not isinstance(trail.get("image_alt"), str) or not trail["image_alt"].strip():
                    raise ValueError("The divider trail requires a hosted Outside In Print HTTPS PNG and accessible description.")
                if type(trail.get("width")) is not int or not 1 <= trail["width"] <= 600 or type(trail.get("height")) is not int or not 1 <= trail["height"] <= 240:
                    raise ValueError("The divider trail requires integer width from 1 to 600 and height from 1 to 240 pixels.")
    book = content.get("bookshelf")
    if book:
        required = ("book_key", "title", "subtitle", "author", "url", "introduction", "image", "email_image", "image_alt", "excerpt_source_title", "excerpt_source_url", "cta_label")
        if not isinstance(book, dict) or any(not isinstance(book.get(k), str) or not book[k].strip() for k in required):
            raise ValueError("bookshelf requires the complete book, cover, source, and store-link fields.")
        if not re.fullmatch(r"https://outsideinprint[.]org/shop/[a-z0-9-]+/", book["url"]):
            raise ValueError("Bookshelf store links must use an existing Outside In Print product route.")
        if len(book["introduction"].split()) > 35:
            raise ValueError("Keep the Bookshelf introduction at most 35 words.")
        excerpts = book.get("excerpts")
        if not isinstance(excerpts, list) or not 2 <= len(excerpts) <= 3:
            raise ValueError("Bookshelf requires two or three verified short excerpts.")
        for excerpt in excerpts:
            if not isinstance(excerpt, dict) or any(not isinstance(excerpt.get(k), str) or not excerpt[k].strip() for k in ("text", "source_title", "source_url", "source_locator")):
                raise ValueError("Every Bookshelf excerpt requires exact text and source locators.")
        if sum(len(e["text"].split()) for e in excerpts) > 50:
            raise ValueError("Bookshelf excerpts together must be at most 50 words.")


def render(issue_path, output_dir, hugo):
    issue_path = Path(issue_path).resolve()
    output_dir = Path(output_dir).resolve()
    if not issue_path.is_file():
        raise ValueError(f"Issue file does not exist: {issue_path}")
    for forbidden in ("content", "static", "public"):
        if output_dir.is_relative_to(REPO / forbidden):
            raise ValueError("Email review artifacts must stay outside content/static/public.")
    version = subprocess.run([hugo, "version"], check=True, capture_output=True, text=True).stdout
    if not re.match(r"hugo v0\.167\.0.*\+extended", version):
        raise ValueError("Use the repository's pinned Hugo Extended 0.167.0.")

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
        check_optional_components(metadata["content"])
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
