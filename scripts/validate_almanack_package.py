#!/usr/bin/env python3
"""Validate Bob's Almanack package structure and completion."""

from __future__ import annotations

import argparse
import datetime as dt
import html
import re
import runpy
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit


REQUIRED_FILES = (
    "web-archive.md",
    "email.md",
    "margin-rail.md",
    "source-checklist.md",
    "quote-ledger.md",
    "triage-summary.md",
    "manifest.md",
)

REQUIRED_EMAIL_HEADINGS = (
    "# Bob's Almanack",
    "## Note from Bob",
    "## New from Outside In Print",
    "## This Week's Virtue",
    "## In the Margins",
    "## Worth Reprinting",
)

FORBIDDEN_EMAIL_HEADINGS = (
    "## A Note from Robert V. Ussley",
    "## Editor's Note",
    "## Weekly Introduction",
)

REQUIRED_MARGIN_HEADINGS = (
    "## One Number",
    "## One Document",
    "## Results",
    "## Records",
    "## Final Bows",
    "## Obituaries",
)

REQUIRED_QUOTE_LEDGER_HEADINGS = (
    "# Quote Ledger",
    "## Poor Richard",
    "## Robert",
    "## Central Bank Update",
)

MARGIN_LIST_KEYS = ("results", "records", "final_bows", "obituaries")
URL_RE = re.compile(r"https?://[^\s)>]+", re.IGNORECASE)
WORD_RE = re.compile(r"\b[\w][\w'-]*\b")
UNSUPPORTED_EMAIL_RE = re.compile(
    r"(<script|<iframe|<video|<audio|<form|<svg|javascript:|data:)",
    re.IGNORECASE,
)
BARE_URL_LINE_RE = re.compile(r"(?im)^\s*https?://\S+\s*$")
EMPTY_IMAGE_ALT_RE = re.compile(r"!\[\s*\]\(", re.IGNORECASE)
MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)\r\n]+)\)")
LINKED_MARKDOWN_IMAGE_RE = re.compile(r"\[!\[([^\]]+)\]\(([^)\r\n]+)\)\]\(([^)\r\n]+)\)")
QUOTE_BLOCK_RE = re.compile(
    r"(?m)^>\s*(?!~\s)([^\r\n]+)\s*\r?\n>\s*\r?\n>\s*~\s*(Robert|Poor Richard)\s*$"
)
ROBERT_QUOTE_FORBIDDEN_WORD_RE = re.compile(r"\bclean\b", re.IGNORECASE)
OLD_POOR_RICHARD_HEADING_RE = re.compile(r"(?m)^##\s+Poor Richard\s*$")
OLD_POOR_RICHARD_LABEL_RE = re.compile(r"(?m)^>\s*Poor Richard\s*:")
OLD_MAXIM_FIELD_RE = re.compile(r"(?m)^(opening_maxim|middle_maxim|closing_maxim)\s*:")
PLACEHOLDER_RE = re.compile(
    r"\[[^\]]*(?:TODO|TBD|placeholder|lead essay|second essay|third essay|archive title|figure|virtue|"
    r"one sentence|item|link|document title|name, age|exact published subtitle|40 to 90)[^\]]*\]",
    re.IGNORECASE,
)
MARKDOWN_IMAGE_WITH_ALT_RE = re.compile(r"!\[[^\]]+\]\([^)]+\)")

THINGS_WE_SAY_POLICY_START = dt.date(2026, 9, 5)
POOR_RICHARD_BEFORE_MARGINS_START = dt.date(2026, 9, 19)
ISSUE_METADATA_POLICY_START = dt.date(2026, 9, 19)
THINGS_WE_SAY_POLICY = "things-we-say-ledger-v1"
THINGS_WE_SAY_LEDGER_REF = "origin/main:editorial/affirmations-bank.md"
THINGS_WE_SAY_LEDGER_URL = (
    "https://outsideinprint.org/collections/the-things-we-say/#the-words-we-say"
)
FRANKLIN_ANALYZER_PATH = (
    Path.home()
    / ".codex"
    / "skills"
    / "franklin-conversational-grade7"
    / "scripts"
    / "analyze_explainer.py"
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def clean_value(value: str) -> str:
    value = value.strip()
    if value in {"", "[]", "{}", "null", "~"}:
        return ""
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    return value


def line_indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def extract_front_matter(text: str) -> tuple[str, list[str]]:
    if not text.startswith("---\n"):
        return "", ["web-archive.md must start with YAML front matter"]
    match = re.match(r"(?s)^---\n(.*?)\n---\s*", text)
    if not match:
        return "", ["web-archive.md must contain a closing front matter delimiter"]
    return match.group(1), []


def front_matter_lines(front_matter: str) -> list[str]:
    return front_matter.splitlines()


def get_scalar(lines: list[str], key: str, indent: int = 0) -> str:
    pattern = re.compile(rf"^ {{{indent}}}{re.escape(key)}\s*:\s*(.*?)\s*$")
    for line in lines:
        match = pattern.match(line)
        if match:
            return clean_value(match.group(1))
    return ""


def get_block(lines: list[str], key: str, indent: int = 0) -> list[str]:
    pattern = re.compile(rf"^ {{{indent}}}{re.escape(key)}\s*:\s*(.*?)\s*$")
    start_index = None
    for index, line in enumerate(lines):
        if pattern.match(line):
            start_index = index
            break
    if start_index is None:
        return []

    block: list[str] = []
    for line in lines[start_index + 1 :]:
        if line.strip() and line_indent(line) <= indent:
            break
        block.append(line)
    return block


def parse_mapping(block_lines: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in block_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("- ") or ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        result[key.strip()] = clean_value(value)
    return result


def parse_list_items(block_lines: list[str]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for line in block_lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("- "):
            if current is not None:
                items.append(current)
            current = {}
            rest = stripped[2:].strip()
            if ":" in rest:
                key, value = rest.split(":", 1)
                current[key.strip()] = clean_value(value)
            elif rest:
                current["text"] = clean_value(rest)
            continue
        if current is not None and ":" in stripped:
            key, value = stripped.split(":", 1)
            current[key.strip()] = clean_value(value)
    if current is not None:
        items.append(current)
    return items


def count_words(text: str) -> int:
    return len(WORD_RE.findall(text))


def sentence_count(text: str) -> int:
    normalized = re.sub(r"\b(?:U\.S|U\.K|Mr|Mrs|Ms|Dr|Prof|Sen|Rep)\.", "", text)
    return len(
        [
            part
            for part in re.split(r"[.!?](?:\s|$)", normalized)
            if part.strip()
        ]
    )


def validate_bob_note(note: str) -> list[str]:
    errors: list[str] = []
    note = note.strip()
    if not note:
        return ["bob_note must be populated"]

    word_count = count_words(note)
    if not 25 <= word_count <= 45:
        errors.append(f"bob_note must be 25 to 45 words; found {word_count}")

    sentences = sentence_count(note)
    if not 2 <= sentences <= 3:
        errors.append(f"bob_note must be 2 to 3 sentences; found {sentences}")

    if URL_RE.search(note) or re.search(r"\[[^\]]+\]\([^)]+\)", note):
        errors.append("bob_note must not contain links")

    if not FRANKLIN_ANALYZER_PATH.is_file():
        errors.append(
            f"Franklin readability analyzer not found: {FRANKLIN_ANALYZER_PATH}"
        )
        return errors

    try:
        analyzer = runpy.run_path(str(FRANKLIN_ANALYZER_PATH))
        result = analyzer["analyze_text"](
            note,
            target_min=5.0,
            target_max=6.9,
            allow_below_target=False,
            allow_pullquotes=False,
        )
    except Exception as exc:
        errors.append(f"bob_note readability analysis failed: {exc}")
        return errors

    if result.get("strict_failures"):
        grade = result.get("metrics", {}).get("flesch_kincaid_grade")
        flags = ", ".join(result.get("strict_failures", []))
        errors.append(
            "bob_note must pass the Franklin grades 5.0 to 6.9 gate; "
            f"estimated grade {grade}, flags: {flags}"
        )

    return errors


def validate_campaign(campaign: dict[str, str]) -> list[str]:
    errors: list[str] = []
    if not campaign:
        return errors
    for key in ("headline", "message", "cta_url"):
        if not campaign.get(key):
            errors.append(f"campaign.{key} must be populated")
    secondary_label = campaign.get("secondary_cta_label", "").strip()
    secondary_url = campaign.get("secondary_cta_url", "").strip()
    if bool(secondary_label) != bool(secondary_url):
        errors.append(
            "campaign must populate secondary_cta_label and secondary_cta_url together or omit both"
        )
    for key in ("cta_url", "secondary_cta_url"):
        url = campaign.get(key, "").strip()
        if url and not re.fullmatch(
            r"(?:/(?!/)|https://outsideinprint\.org/)[^\s\\<>()]*", url
        ):
            errors.append(
                f"campaign.{key} must be a root-relative OIP path or an absolute https://outsideinprint.org/ URL"
            )
    if bool(campaign.get("image")) != bool(campaign.get("image_alt")):
        errors.append("campaign must populate image and image_alt together or omit both")
    image = campaign.get("email_image") or campaign.get("image", "")
    if image and not (image.startswith("/") or image.startswith("https://outsideinprint.org/")):
        errors.append("managed campaign image requires an email_image public raster URL")
    if campaign.get("email_image") and not campaign.get("image"):
        errors.append("campaign.email_image requires image and image_alt")
    if image and not re.search(r"\.(?:png|jpe?g|webp)(?:[?#].*)?$", image, re.I):
        errors.append("campaign email image must use a raster URL")
    return errors


def validate_worth_blurb(blurb: str) -> list[str]:
    errors: list[str] = []
    blurb = blurb.strip()
    if not blurb:
        return ["worth_reprinting.blurb must be populated"]

    word_count = count_words(blurb)
    if not 35 <= word_count <= 65:
        errors.append(
            f"worth_reprinting.blurb must be 35 to 65 words; found {word_count}"
        )

    sentences = sentence_count(blurb)
    if not 2 <= sentences <= 4:
        errors.append(
            f"worth_reprinting.blurb must be 2 to 4 sentences; found {sentences}"
        )

    if not re.search(r"\b(?:back|return|returns|returning|again|reprint|reprinting)\b", blurb, re.IGNORECASE):
        errors.append(
            "worth_reprinting.blurb must plainly say why the article is returning"
        )

    if not FRANKLIN_ANALYZER_PATH.is_file():
        errors.append(
            f"Franklin readability analyzer not found: {FRANKLIN_ANALYZER_PATH}"
        )
        return errors

    try:
        analyzer = runpy.run_path(str(FRANKLIN_ANALYZER_PATH))
        result = analyzer["analyze_text"](
            blurb,
            target_min=5.0,
            target_max=6.9,
            allow_below_target=True,
            allow_pullquotes=False,
        )
    except Exception as exc:
        errors.append(f"worth_reprinting.blurb readability analysis failed: {exc}")
        return errors

    if result.get("strict_failures"):
        grade = result.get("metrics", {}).get("flesch_kincaid_grade")
        flags = ", ".join(result.get("strict_failures", []))
        errors.append(
            "worth_reprinting.blurb must pass the Franklin grades 5.0 to 6.9 gate; "
            f"estimated grade {grade}, flags: {flags}"
        )

    return errors


def validate_worth_reprinting(worth: dict[str, str]) -> list[str]:
    """Validate Almanack-authored fields without rewriting the source deck."""
    errors: list[str] = []
    for key in ("title", "url", "description", "blurb"):
        if not worth.get(key):
            errors.append(f"worth_reprinting.{key} must be populated")
    if worth.get("blurb"):
        errors.extend(validate_worth_blurb(worth["blurb"]))
    return errors


def section_text(markdown: str, heading: str) -> str:
    pattern = re.compile(
        rf"(?ims)^##\s+{re.escape(heading)}\s*$([\s\S]*?)(?=^##\s+|\Z)"
    )
    match = pattern.search(markdown)
    return match.group(1) if match else ""


def has_markdown_heading(markdown: str, heading: str) -> bool:
    return bool(re.search(rf"(?m)^{re.escape(heading)}\s*$", markdown))


def absolute_oip_url(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if value.startswith("https://outsideinprint.org/"):
        return value
    if value.startswith("/"):
        return "https://outsideinprint.org" + value
    return value


def truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def normalize_ledger_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip().replace("\u2019", "'")


def parse_affirmations_bank(bank_text: str) -> set[str]:
    section_match = re.search(
        r"(?ms)^## Affirmations\s*$\s*(.*?)(?=^##\s+|\Z)",
        bank_text,
    )
    if not section_match:
        return set()

    entries: set[str] = set()
    for line in section_match.group(1).splitlines():
        match = re.match(r"^-\s+(.+?)\s*$", line)
        if match:
            entries.add(normalize_ledger_text(match.group(1)))
    return entries


def find_hugo_repositories(package_dir: Path) -> list[Path]:
    candidates: list[Path] = []
    for ancestor in (package_dir, *package_dir.parents):
        nested = ancestor / "outsideinprint"
        if nested.is_dir() and (nested / ".git").exists():
            candidates.append(nested)
        if (ancestor / ".git").exists() and (ancestor / "content").is_dir():
            candidates.append(ancestor)

    default_repo = Path(r"C:\Users\lawto\Documents\OutsideInPrint\outsideinprint")
    if default_repo.is_dir() and (default_repo / ".git").exists():
        candidates.append(default_repo)

    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate.resolve()).lower()
        if key not in seen:
            unique.append(candidate.resolve())
            seen.add(key)
    return unique


def load_affirmations_bank(
    package_dir: Path,
    explicit_path: Path | None = None,
) -> tuple[set[str], list[str]]:
    if explicit_path is not None:
        resolved = explicit_path.expanduser().resolve()
        if not resolved.is_file():
            return set(), [f"Things We Say affirmations bank not found: {resolved}"]
        try:
            entries = parse_affirmations_bank(read_text(resolved))
        except (OSError, UnicodeError) as exc:
            return set(), [f"unable to read Things We Say affirmations bank: {exc}"]
        if not entries:
            return set(), [f"Things We Say affirmations bank has no ## Affirmations entries: {resolved}"]
        return entries, []

    repositories = find_hugo_repositories(package_dir)
    git_errors: list[str] = []
    for repository in repositories:
        try:
            result = subprocess.run(
                ["git", "-C", str(repository), "show", THINGS_WE_SAY_LEDGER_REF],
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=False,
            )
        except OSError as exc:
            git_errors.append(f"{repository}: {exc}")
            continue
        if result.returncode != 0:
            detail = result.stderr.strip() or f"git exited {result.returncode}"
            git_errors.append(f"{repository}: {detail}")
            continue
        entries = parse_affirmations_bank(result.stdout)
        if entries:
            return entries, []
        git_errors.append(f"{repository}: {THINGS_WE_SAY_LEDGER_REF} has no ## Affirmations entries")

    detail = "; ".join(git_errors) if git_errors else "no OIP Hugo repository was found"
    return set(), [
        "unable to load canonical Things We Say ledger "
        f"{THINGS_WE_SAY_LEDGER_REF}: {detail}"
    ]


def markdown_link_target(value: str) -> str:
    return value.strip().split()[0].strip("<>\"'")


def validate_no_placeholders(package_dir: Path) -> list[str]:
    errors: list[str] = []
    for name in required_package_files(package_dir):
        path = package_dir / name
        text = read_text(path) if path.is_file() else ""
        text_without_image_alt = MARKDOWN_IMAGE_WITH_ALT_RE.sub("![image](image)", text)
        if path.is_file() and PLACEHOLDER_RE.search(text_without_image_alt):
            errors.append(f"{name} still contains scaffold placeholders")
    return errors


def validate_email_section_order(email: str, issue_date: str) -> list[str]:
    try:
        date = dt.date.fromisoformat(issue_date)
    except ValueError:
        # The front-matter validator reports missing or invalid issue dates.
        return []
    if date < POOR_RICHARD_BEFORE_MARGINS_START:
        return []

    headings = [
        re.search(rf"(?m)^{re.escape(heading)}[ \t]*$", email)
        for heading in (
            "## This Week's Virtue", "## In the Margins", "## Worth Reprinting",
        )
    ]
    quotes = list(QUOTE_BLOCK_RE.finditer(email))
    if not all(headings) or [quote.group(2) for quote in quotes] != [
        "Robert", "Poor Richard", "Robert",
    ]:
        # Heading and quote-shape checks report these incomplete structures.
        return []

    virtue, margins, worth = headings
    middle, closing = quotes[1:]
    if not (
        virtue.start() < middle.start() < margins.start() < worth.start() < closing.start()
        and not email[middle.end():margins.start()].strip()
    ):
        return [
            "email.md must place Poor Richard directly above In the Margins, "
            "after This Week's Virtue and before Worth Reprinting and closing Robert"
        ]
    return []


def validate_email_markdown(
    email: str,
    required_linked_images: list[dict[str, str]] | None = None,
    strict: bool = False,
    email_masthead: dict[str, str] | None = None,
    canonical_url: str = "",
    issue_date: str = "",
) -> list[str]:
    errors: list[str] = []
    normalized = email.lstrip("\ufeff")

    if normalized.startswith("---"):
        errors.append("email.md must not start with YAML front matter")

    for heading in REQUIRED_EMAIL_HEADINGS:
        if heading == "# Bob's Almanack" and email_masthead is not None:
            continue
        if not has_markdown_heading(email, heading):
            errors.append(f"email.md missing heading: {heading}")

    masthead_image_start = -1
    if email_masthead is not None:
        masthead_url = email_masthead.get("image_url", "")
        masthead_alt = email_masthead.get("image_alt", "")
        masthead_link = f"[![{masthead_alt}]({masthead_url})]({canonical_url})"
        if normalized.startswith(masthead_link + "\n") and is_email_masthead_image_url(masthead_url):
            masthead_image_start = email.index(masthead_link) + 1
        else:
            errors.append("email.md must begin with the configured masthead image linked to canonical_url")
        if email.count(masthead_link) != 1:
            errors.append("email.md must contain exactly one configured linked masthead")
        if has_markdown_heading(email, "# Bob's Almanack") or "Printer's Almanack Sheet" in email:
            errors.append("email.md must not duplicate the text nameplate/register when email_masthead is present")
        expected_cta = f"# [Read the full issue ->]({canonical_url})"
        if expected_cta not in "\n".join(normalized.splitlines()[:16]):
            errors.append("email.md masthead requires the live H1 Read the full issue CTA near the top")

    for heading in FORBIDDEN_EMAIL_HEADINGS:
        if has_markdown_heading(email, heading):
            errors.append(f"email.md contains forbidden weekly introduction heading: {heading}")

    if strict:
        errors.extend(validate_email_section_order(email, issue_date))
        if OLD_POOR_RICHARD_HEADING_RE.search(email):
            errors.append("email.md must not use ## Poor Richard quote headings")
        if OLD_POOR_RICHARD_LABEL_RE.search(email):
            errors.append("email.md must not use inline Poor Richard: quote labels")

        quote_blocks = [
            {"text": match.group(1).strip(), "attribution": match.group(2).strip()}
            for match in QUOTE_BLOCK_RE.finditer(email)
        ]
        expected_attributions = ["Robert", "Poor Richard", "Robert"]
        actual_attributions = [block["attribution"] for block in quote_blocks]
        if actual_attributions != expected_attributions:
            errors.append("email.md must contain exactly three quote blocks attributed in order: Robert, Poor Richard, Robert")
        for index, block in enumerate(quote_blocks, start=1):
            if not block["text"]:
                errors.append(f"email.md quote block {index} must include quote text")
            if block["attribution"] == "Robert" and ROBERT_QUOTE_FORBIDDEN_WORD_RE.search(block["text"]):
                errors.append("email.md Robert quote blocks must not use the word clean")

    unsupported = UNSUPPORTED_EMAIL_RE.search(email)
    if unsupported:
        errors.append(f"email.md contains unsupported Buttondown email element or URL scheme: {unsupported.group(1)}")

    bare_url = BARE_URL_LINE_RE.search(email)
    if bare_url:
        errors.append("email.md contains a standalone bare URL line; use Markdown links or attached source text")

    if EMPTY_IMAGE_ALT_RE.search(email):
        errors.append("email.md contains a Markdown image with empty alt text")

    for match in MARKDOWN_IMAGE_RE.finditer(email):
        image_target = match.group(1).strip()
        image_url = markdown_link_target(image_target)
        image_url_without_suffix = re.split(r"[?#]", image_url, maxsplit=1)[0]
        if not image_url.startswith("https://outsideinprint.org/") and match.start() != masthead_image_start:
            errors.append("email.md Markdown image URLs must be absolute https://outsideinprint.org/ URLs")
            break
        if image_url_without_suffix.lower().endswith(".svg"):
            errors.append("email.md contains a Markdown image URL ending in .svg")
            break

    if required_linked_images:
        linked_images = []
        for match in LINKED_MARKDOWN_IMAGE_RE.finditer(email):
            alt = match.group(1).strip()
            image_url = markdown_link_target(match.group(2))
            link_url = markdown_link_target(match.group(3))
            linked_images.append(
                {
                    "alt": alt,
                    "image": image_url,
                    "link": link_url,
                }
            )

        for item in required_linked_images:
            expected_image = absolute_oip_url(item.get("email_image") or item.get("image", ""))
            expected_link = absolute_oip_url(item.get("url", ""))
            expected_alt = item.get("image_alt", "").strip()
            title = item.get("title", "untitled")
            if not expected_image or not expected_link or not expected_alt:
                continue
            if not expected_image.startswith("https://outsideinprint.org/"):
                errors.append(f"email.md required cartoon image for {title} must resolve to outsideinprint.org")
                continue
            if not expected_link.startswith("https://outsideinprint.org/"):
                errors.append(f"email.md required cartoon link for {title} must resolve to outsideinprint.org")
                continue
            found = any(
                candidate["alt"] == expected_alt
                and candidate["image"] == expected_image
                and candidate["link"] == expected_link
                for candidate in linked_images
            )
            if not found:
                errors.append(f"email.md missing linked cartoon image for {title}")

    return errors


def is_email_masthead_image_url(value: str) -> bool:
    if re.search(r"[\s\\\[\]()<>]", value):
        return False
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.netloc.lower() in {"outsideinprint.org", "assets.buttondown.email"}
        and bool(re.search(r"\.(?:png|jpe?g|webp)$", parsed.path, re.I))
    )


def get_email_masthead(lines: list[str]) -> dict[str, str] | None:
    for line in lines:
        match = re.match(r"^email_masthead\s*:\s*(.*?)\s*$", line)
        if match:
            if match.group(1):
                return {}
            return parse_mapping(get_block(lines, "email_masthead"))
    return None


def validate_email_masthead(
    masthead: dict[str, str] | None,
    issue_date: str,
    issue_number: str,
    canonical_url: str,
    email_issue_link: bool,
) -> list[str]:
    if masthead is None:
        return []
    errors: list[str] = []
    if not is_email_masthead_image_url(masthead.get("image_url", "")):
        errors.append("email_masthead.image_url must be an HTTPS raster URL at outsideinprint.org or assets.buttondown.email")
    alt = masthead.get("image_alt", "").strip()
    if not alt or re.search(r"[\r\n\[\]<>]", alt):
        errors.append("email_masthead.image_alt must contain plain, nonempty alt text")
    date = masthead.get("issue_date", "")
    try:
        valid_date = dt.date.fromisoformat(date).isoformat() == date
    except ValueError:
        valid_date = False
    if not valid_date or date != issue_date:
        errors.append("email_masthead.issue_date must match the web-archive.md date in YYYY-MM-DD form")
    number = masthead.get("issue_number", "")
    if not re.fullmatch(r"[0-9]+", number) or int(number) <= 0 or number != issue_number:
        errors.append("email_masthead.issue_number must match the positive integer web-archive.md issue_number")
    if not canonical_url.startswith("https://outsideinprint.org/") or not email_issue_link:
        errors.append("email_masthead requires canonical_url and email_issue_link: true")
    return errors


def validate_source_urls(margin_text: str) -> list[str]:
    errors: list[str] = []
    for heading in ("One Number", "One Document", "Results", "Records", "Final Bows", "Obituaries"):
        text = section_text(margin_text, heading)
        if not text.strip():
            errors.append(f"margin-rail.md missing content under {heading}")
        elif not URL_RE.search(text):
            errors.append(f"margin-rail.md {heading} section must include a source URL")
    return errors


def validate_quote_ledger(package_dir: Path, strict: bool) -> list[str]:
    errors: list[str] = []
    ledger_path = package_dir / "quote-ledger.md"
    if not ledger_path.is_file():
        return errors

    ledger = read_text(ledger_path)
    for heading in REQUIRED_QUOTE_LEDGER_HEADINGS:
        if not has_markdown_heading(ledger, heading):
            errors.append(f"quote-ledger.md missing heading: {heading}")

    if not strict:
        return errors

    if re.search(r"(?m)^-\s+\[\s\]", ledger):
        errors.append("quote-ledger.md contains unchecked checklist items")

    if "quote-bank.md" not in ledger:
        errors.append("quote-ledger.md must record the central quote-bank.md update")

    web_path = package_dir / "web-archive.md"
    if not web_path.is_file():
        return errors

    web = read_text(web_path)
    front_matter, fm_errors = extract_front_matter(web)
    if fm_errors:
        return errors

    lines = front_matter_lines(front_matter)
    for key in ("opening_quote", "middle_quote", "closing_quote"):
        quote = get_scalar(lines, key)
        if quote and quote not in ledger:
            errors.append(f"quote-ledger.md missing web-archive.md {key}")

    middle_quote_source_url = get_scalar(lines, "middle_quote_source_url")
    if middle_quote_source_url and middle_quote_source_url not in ledger:
        errors.append("quote-ledger.md missing middle_quote_source_url")

    issue_date_text = get_scalar(lines, "date")
    try:
        issue_date = dt.date.fromisoformat(issue_date_text)
    except ValueError:
        issue_date = None
    policy = get_scalar(lines, "aphorism_source_policy")
    enforce_things_we_say = bool(policy) or bool(
        issue_date and issue_date >= THINGS_WE_SAY_POLICY_START
    )
    if enforce_things_we_say:
        ledger_ref = get_scalar(lines, "robert_quote_ledger_ref")
        ledger_url = get_scalar(lines, "robert_quote_ledger_url")
        if ledger_ref and ledger_ref not in ledger:
            errors.append("quote-ledger.md missing robert_quote_ledger_ref")
        if ledger_url and ledger_url not in ledger:
            errors.append("quote-ledger.md missing robert_quote_ledger_url")

    return errors


def validate_email_quote_sync(email: str, front_matter_lines_: list[str]) -> list[str]:
    quote_blocks = [
        normalize_ledger_text(match.group(1))
        for match in QUOTE_BLOCK_RE.finditer(email)
    ]
    if len(quote_blocks) != 3:
        return []

    expected = [
        normalize_ledger_text(get_scalar(front_matter_lines_, key))
        for key in ("opening_quote", "middle_quote", "closing_quote")
    ]
    if quote_blocks != expected:
        return [
            "email.md quote text must exactly match web-archive.md opening, middle, and closing quotes"
        ]
    return []


def get_required_email_linked_images(package_dir: Path) -> tuple[list[dict[str, str]], list[str]]:
    web_path = package_dir / "web-archive.md"
    if not web_path.is_file():
        return [], []

    web = read_text(web_path)
    front_matter, fm_errors = extract_front_matter(web)
    if fm_errors:
        return [], fm_errors

    lines = front_matter_lines(front_matter)
    essays = parse_list_items(get_block(lines, "essays"))
    required = [essay for essay in essays if essay.get("image") and essay.get("image_alt")]
    email_ornament = parse_mapping(get_block(lines, "email_ornament"))
    if email_ornament.get("image") and email_ornament.get("image_alt") and email_ornament.get("url"):
        required.append({"title": "email ornament", **email_ornament})

    campaign = parse_mapping(get_block(lines, "campaign"))
    if campaign.get("image") and campaign.get("image_alt") and campaign.get("cta_url"):
        required.append({"title": "campaign", **campaign, "url": campaign["cta_url"]})

    return required, []


def validate_email_story_copy(
    email: str,
    essays: list[dict[str, str]],
    worth: dict[str, str],
    *,
    article_dividers: bool = False,
) -> list[str]:
    errors: list[str] = []
    if essays:
        lead_index = next(
            (index for index, essay in enumerate(essays) if essay.get("role", "").strip().lower() == "lead"),
            0,
        )
        ordered = [essays[lead_index], *[essay for index, essay in enumerate(essays) if index != lead_index]]
        expected_lines: list[str] = []
        for index, essay in enumerate(ordered):
            title = essay.get("title", "").strip()
            url = absolute_oip_url(essay.get("url", ""))
            description = essay.get("description", "").strip()
            if article_dividers and index:
                expected_lines.extend(["---", ""])
            expected_lines.extend([f"### [{title}]({url})", ""])
            image = (essay.get("email_image") or essay.get("image", "")).strip()
            image_alt = essay.get("image_alt", "").strip()
            if image and image_alt:
                expected_lines.extend(
                    [f"[![{image_alt}]({absolute_oip_url(image)})]({url})", ""]
                )
            if description:
                expected_lines.extend([description, ""])
        expected_lines.append("---")
        actual = section_text(email, "New from Outside In Print").strip()
        expected = "\n".join(expected_lines).strip()
        if actual != expected:
            errors.append(
                "email.md New from Outside In Print must contain only linked titles, available paired cartoons, and exact front-matter subtitles/decks"
            )

    worth_title = worth.get("title", "").strip()
    worth_url = absolute_oip_url(worth.get("url", ""))
    worth_description = worth.get("description", "").strip()
    worth_blurb = worth.get("blurb", "").strip()
    worth_section = section_text(email, "Worth Reprinting")
    if worth_title and f"### [{worth_title}]({worth_url})" not in worth_section:
        errors.append("email.md Worth Reprinting must use the linked front-matter title")
    if worth_description and worth_description not in worth_section:
        errors.append("email.md Worth Reprinting must use the exact front-matter subtitle/deck")
    if worth_blurb and worth_blurb not in worth_section:
        errors.append("email.md Worth Reprinting must include the exact front-matter blurb")
    if worth_description and worth_blurb:
        description_index = worth_section.find(worth_description)
        blurb_index = worth_section.find(worth_blurb)
        if description_index < 0 or blurb_index <= description_index:
            errors.append(
                "email.md Worth Reprinting blurb must appear below the exact subtitle/deck"
            )
    if re.search(r"(?m)^\s*Read(?:\s*->|:)\s*", worth_section):
        errors.append("email.md Worth Reprinting must not add a separate read-link label")

    return errors


def validate_email_bob_note(
    email: str,
    bob_note: str,
    campaign: dict[str, str],
) -> list[str]:
    errors: list[str] = []
    bob_note = bob_note.strip()
    note_heading = "## Note from Bob"
    new_heading = "## New from Outside In Print"
    note_index = email.find(note_heading)
    new_index = email.find(new_heading)

    note_section = section_text(email, "Note from Bob")
    note_copy = "\n".join(
        line for line in note_section.splitlines() if line.strip() != "---"
    ).strip()
    if bob_note and note_copy != bob_note:
        errors.append("email.md Note from Bob must contain only the exact front-matter bob_note")

    if note_index >= 0 and new_index >= 0 and note_index >= new_index:
        errors.append("email.md Note from Bob must appear before New from Outside In Print")

    opening_quote = QUOTE_BLOCK_RE.search(email)
    if opening_quote and note_index >= 0 and note_index <= opening_quote.end():
        errors.append("email.md Note from Bob must appear after the opening Robert quote")

    campaign_positions = []
    for key in (
        "headline", "message", "cta_label", "cta_url",
        "secondary_cta_label", "secondary_cta_url",
    ):
        value = campaign.get(key, "").strip()
        if value and value in email:
            campaign_positions.append(email.find(value))
    if campaign_positions and note_index >= 0 and note_index <= max(campaign_positions):
        errors.append("email.md Note from Bob must appear after the campaign")

    return errors


def get_expected_issue_link(package_dir: Path) -> tuple[str, list[str]]:
    web_path = package_dir / "web-archive.md"
    if not web_path.is_file():
        return "", []

    web = read_text(web_path)
    front_matter, fm_errors = extract_front_matter(web)
    if fm_errors:
        return "", fm_errors

    lines = front_matter_lines(front_matter)
    if not truthy(get_scalar(lines, "email_issue_link")):
        return "", []

    canonical_url = get_scalar(lines, "canonical_url")
    if not canonical_url:
        return "", ["web-archive.md email_issue_link is true but canonical_url is empty"]
    if not canonical_url.startswith("https://outsideinprint.org/"):
        return "", ["web-archive.md canonical_url must be an absolute https://outsideinprint.org/ URL"]
    return canonical_url, []


def validate_issue_metadata(
    lines: list[str],
    issue_date: dt.date,
    existing_descriptions: list[str] | None = None,
) -> list[str]:
    if issue_date < ISSUE_METADATA_POLICY_START:
        return []
    errors: list[str] = []
    month = (
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    )[issue_date.month - 1]
    expected_title = f"Bob's Almanack — {month} {issue_date.day}, {issue_date.year}"
    if get_scalar(lines, "metadata_title") != expected_title:
        errors.append(f"web-archive.md metadata_title must be exactly {expected_title}")
    description = get_scalar(lines, "description")
    if not 70 <= len(description) <= 160:
        errors.append("web-archive.md issue description must be 70 to 160 characters")
    if re.search(r"(?:\.\.\.|…)\s*$", description):
        errors.append("web-archive.md issue description must not end with an ellipsis")
    if description and description.casefold() in {
        value.strip().casefold() for value in (existing_descriptions or [])
    }:
        errors.append("web-archive.md issue description must be unique among installed Almanack issues")
    return errors


def validate_web_front_matter(
    package_dir: Path,
    strict: bool,
    affirmations_bank_path: Path | None = None,
) -> list[str]:
    errors: list[str] = []
    web_path = package_dir / "web-archive.md"
    if not web_path.is_file():
        return errors

    web = read_text(web_path)
    front_matter, fm_errors = extract_front_matter(web)
    errors.extend(fm_errors)
    if fm_errors:
        return errors

    lines = front_matter_lines(front_matter)
    for pattern in (
        r'^title:\s+"Bob\'s Almanack"',
        r"^date:\s+\d{4}-\d{2}-\d{2}",
        r"^draft:\s+(true|false)",
        r"^opening_quote:",
        r"^opening_quote_attribution:",
        r"^middle_quote:",
        r"^middle_quote_attribution:",
        r"^middle_quote_source_url:",
        r"^closing_quote:",
        r"^closing_quote_attribution:",
        r"^essays:",
        r"^margin:",
    ):
        if not re.search(pattern, front_matter, flags=re.MULTILINE):
            errors.append(f"web-archive.md missing required front matter pattern: {pattern}")

    errors.extend(validate_email_masthead(
        get_email_masthead(lines), get_scalar(lines, "date"),
        get_scalar(lines, "issue_number"), get_scalar(lines, "canonical_url"),
        truthy(get_scalar(lines, "email_issue_link")),
    ))

    if not strict:
        return errors

    if OLD_MAXIM_FIELD_RE.search(front_matter):
        errors.append("web-archive.md must not use old *_maxim front matter fields")

    issue_number_text = get_scalar(lines, "issue_number")
    if not issue_number_text:
        errors.append("web-archive.md issue_number must be populated")
    elif not issue_number_text.isdigit() or int(issue_number_text) <= 0:
        errors.append("web-archive.md issue_number must be a positive integer")

    issue_date_text = get_scalar(lines, "date")
    try:
        issue_date = dt.date.fromisoformat(issue_date_text)
    except ValueError:
        errors.append("web-archive.md date must use YYYY-MM-DD")
        issue_date = None

    if issue_date and issue_date.weekday() != 5:
        errors.append("web-archive.md date must be a Saturday")
    if issue_date and issue_date >= dt.date(2026, 10, 3) and get_scalar(lines, "editorial_contract") != "almanack-v1":
        errors.append("New issues require the approved almanack-v1 shared email contract")

    if issue_date and issue_date >= ISSUE_METADATA_POLICY_START:
        existing_descriptions: list[str] = []
        for repository in find_hugo_repositories(package_dir):
            for issue_path in (repository / "content" / "almanack").glob("????-??-??.md"):
                if issue_path.stem == issue_date_text:
                    continue
                other_front_matter, other_errors = extract_front_matter(read_text(issue_path))
                if not other_errors:
                    existing_descriptions.append(get_scalar(
                        front_matter_lines(other_front_matter), "description",
                    ))
        errors.extend(validate_issue_metadata(lines, issue_date, existing_descriptions))

    folder_match = re.match(r"^almanack-package-(\d{4}-\d{2}-\d{2})$", package_dir.name)
    if folder_match and issue_date_text and folder_match.group(1) != issue_date_text:
        errors.append("package folder date must match web-archive.md date")

    if get_scalar(lines, "draft").lower() != "true":
        errors.append("web-archive.md must keep draft: true")

    canonical_url = get_scalar(lines, "canonical_url")
    if canonical_url and not canonical_url.startswith("https://outsideinprint.org/"):
        errors.append("web-archive.md canonical_url must be an absolute https://outsideinprint.org/ URL")
    if truthy(get_scalar(lines, "email_issue_link")) and not canonical_url:
        errors.append("web-archive.md email_issue_link is true but canonical_url is empty")

    collection_values = [
        (item.get("text") or item.get("slug") or item.get("collection") or "").strip().lower()
        for item in parse_list_items(get_block(lines, "collections"))
    ]
    if "bobs-almanack" not in collection_values:
        errors.append("web-archive.md collections must include bobs-almanack")

    quote_expectations = (
        ("opening_quote", "opening_quote_attribution", "Robert"),
        ("middle_quote", "middle_quote_attribution", "Poor Richard"),
        ("closing_quote", "closing_quote_attribution", "Robert"),
    )
    for quote_key, attribution_key, expected_attribution in quote_expectations:
        quote_text = get_scalar(lines, quote_key)
        if not quote_text:
            errors.append(f"web-archive.md {quote_key} must be populated")
        actual_attribution = get_scalar(lines, attribution_key)
        if actual_attribution != expected_attribution:
            errors.append(f"web-archive.md {attribution_key} must be {expected_attribution}")
        if expected_attribution == "Robert" and ROBERT_QUOTE_FORBIDDEN_WORD_RE.search(quote_text):
            errors.append(f"web-archive.md {quote_key} must not use the word clean")

    middle_quote_source_url = get_scalar(lines, "middle_quote_source_url")
    if not middle_quote_source_url:
        errors.append("web-archive.md middle_quote_source_url must be populated")
    elif not URL_RE.match(middle_quote_source_url):
        errors.append("web-archive.md middle_quote_source_url must be an absolute URL")

    policy = get_scalar(lines, "aphorism_source_policy")
    enforce_things_we_say = bool(policy) or bool(
        issue_date and issue_date >= THINGS_WE_SAY_POLICY_START
    )
    if enforce_things_we_say:
        if policy != THINGS_WE_SAY_POLICY:
            errors.append(
                f"web-archive.md aphorism_source_policy must be {THINGS_WE_SAY_POLICY}"
            )
        ledger_ref = get_scalar(lines, "robert_quote_ledger_ref")
        if ledger_ref != THINGS_WE_SAY_LEDGER_REF:
            errors.append(
                "web-archive.md robert_quote_ledger_ref must be "
                f"{THINGS_WE_SAY_LEDGER_REF}"
            )
        ledger_url = get_scalar(lines, "robert_quote_ledger_url")
        if ledger_url != THINGS_WE_SAY_LEDGER_URL:
            errors.append(
                "web-archive.md robert_quote_ledger_url must be the live Things We Say ledger URL"
            )

        bank_entries, bank_errors = load_affirmations_bank(
            package_dir,
            explicit_path=affirmations_bank_path,
        )
        errors.extend(bank_errors)
        if bank_entries:
            for quote_key in ("opening_quote", "closing_quote"):
                quote_text = normalize_ledger_text(get_scalar(lines, quote_key))
                if quote_text not in bank_entries:
                    errors.append(
                        f"web-archive.md {quote_key} must exactly match a Things We Say ledger affirmation"
                    )

    if re.search(r"(?m)^opening_note\s*:", front_matter):
        errors.append("web-archive.md must not contain the retired opening_note field")

    bob_note = get_scalar(lines, "bob_note")
    shared_email = get_scalar(lines, "editorial_contract") == "almanack-v1"
    if shared_email:
        if not bob_note or len(bob_note.split()) > 50:
            errors.append("bob_note must be specific and at most 50 words")
    else:
        errors.extend(validate_bob_note(bob_note))

    campaign = parse_mapping(get_block(lines, "campaign"))
    errors.extend(validate_campaign(campaign))

    essays = parse_list_items(get_block(lines, "essays"))
    card_limit = 5 if shared_email else 4
    if not 1 <= len(essays) <= card_limit:
        errors.append(f"web-archive.md must contain 1 to {card_limit} essay cards; found {len(essays)}")
    else:
        lead = essays[0]
        for key in (("title", "url") if shared_email else ("title", "url", "description")):
            if not lead.get(key):
                errors.append(f"lead essay is missing {key}")
        if lead.get("url") and not (lead["url"].startswith("/") or URL_RE.match(lead["url"])):
            errors.append("lead essay url must be site-relative or absolute")
        for index, essay in enumerate(essays, start=1):
            for key in (("title", "url") if shared_email else ("title", "url", "description")):
                if not essay.get(key):
                    label = "exact published subtitle/deck in description" if key == "description" else key
                    errors.append(f"essay card {index} is missing {label}")
            if bool(essay.get("image")) != bool(essay.get("image_alt")):
                errors.append(f"essay card {index} must populate image and image_alt together or omit both")

    virtue = parse_mapping(get_block(lines, "virtue"))
    virtue_reflection = virtue.get("reflection", "")
    virtue_words = count_words(virtue_reflection)
    if not virtue.get("name"):
        errors.append("virtue.name must be populated")
    if not virtue_reflection:
        errors.append("virtue.reflection must be populated")
    elif not 40 <= virtue_words <= 90:
        errors.append(f"virtue.reflection must be 40 to 90 words; found {virtue_words}")

    worth = parse_mapping(get_block(lines, "worth_reprinting"))
    if shared_email:
        for key in ("title", "url", "rationale"):
            if not worth.get(key):
                errors.append(f"worth_reprinting.{key} must be populated")
    else:
        errors.extend(validate_worth_reprinting(worth))

    one_number = parse_mapping(get_block(lines, "one_number", indent=2))
    for key in ("figure", "note", "source_url"):
        if not one_number.get(key):
            errors.append(f"margin.one_number.{key} must be populated")
    if one_number.get("source_url") and not URL_RE.match(one_number["source_url"]):
        errors.append("margin.one_number.source_url must be an absolute URL")

    one_document = parse_mapping(get_block(lines, "one_document", indent=2))
    for key in ("title", "issued_by", "date", "note", "url"):
        if not one_document.get(key):
            errors.append(f"margin.one_document.{key} must be populated")
    if one_document.get("url") and not URL_RE.match(one_document["url"]):
        errors.append("margin.one_document.url must be an absolute URL")

    for key in MARGIN_LIST_KEYS:
        items = parse_list_items(get_block(lines, key, indent=2))
        if not 1 <= len(items) <= 4:
            errors.append(f"margin.{key} must contain 1 to 4 items; found {len(items)}")
            continue
        for index, item in enumerate(items, start=1):
            text = item.get("text") or item.get("title") or item.get("name") or item.get("item")
            url = item.get("url") or item.get("source_url")
            if not text:
                errors.append(f"margin.{key} item {index} must include text")
            if not url:
                errors.append(f"margin.{key} item {index} must include a source URL")
            elif not URL_RE.match(url):
                errors.append(f"margin.{key} item {index} source URL must be absolute")

    return errors


def uses_shared_email(package_dir: Path) -> bool:
    source = package_dir / "web-archive.md"
    if not source.is_file():
        return False
    front_matter, errors = extract_front_matter(read_text(source))
    return not errors and get_scalar(front_matter_lines(front_matter), "editorial_contract") == "almanack-v1"


def required_package_files(package_dir: Path):
    if uses_shared_email(package_dir):
        return tuple(name for name in REQUIRED_FILES if name != "email.md") + ("email.html", "email.txt", "email.json", "REVIEW.txt")
    return REQUIRED_FILES


def validate_package(
    package_dir: Path,
    strict: bool,
    affirmations_bank_path: Path | None = None,
) -> list[str]:
    errors: list[str] = []
    if not package_dir.is_dir():
        return [f"{package_dir} is not a directory"]

    for name in required_package_files(package_dir):
        path = package_dir / name
        if not path.is_file():
            errors.append(f"missing required file: {name}")
        elif path.stat().st_size == 0:
            errors.append(f"empty required file: {name}")

    errors.extend(
        validate_web_front_matter(
            package_dir,
            strict=strict,
            affirmations_bank_path=affirmations_bank_path,
        )
    )

    email_path = package_dir / "email.md"
    if uses_shared_email(package_dir):
        module = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/validate_almanack_distribution.py"))
        errors.extend(module["validate"](package_dir))
    elif email_path.is_file():
        required_images: list[dict[str, str]] = []
        expected_issue_link = ""
        if strict:
            required_images, required_errors = get_required_email_linked_images(package_dir)
            if required_errors:
                errors.extend(required_errors)
            expected_issue_link, issue_link_errors = get_expected_issue_link(package_dir)
            if issue_link_errors:
                errors.extend(issue_link_errors)
        email = read_text(email_path)
        email_masthead = None
        canonical_url = ""
        issue_date = ""
        web_path = package_dir / "web-archive.md"
        if web_path.is_file():
            front_matter, fm_errors = extract_front_matter(read_text(web_path))
            if not fm_errors:
                fm_lines = front_matter_lines(front_matter)
                email_masthead = get_email_masthead(fm_lines)
                canonical_url = get_scalar(fm_lines, "canonical_url")
                issue_date = get_scalar(fm_lines, "date")
        errors.extend(validate_email_markdown(
            email, required_images, strict=strict,
            email_masthead=email_masthead, canonical_url=canonical_url,
            issue_date=issue_date,
        ))
        if strict:
            web_path = package_dir / "web-archive.md"
            if web_path.is_file():
                front_matter, fm_errors = extract_front_matter(read_text(web_path))
                if not fm_errors:
                    fm_lines = front_matter_lines(front_matter)
                    essays = parse_list_items(get_block(fm_lines, "essays"))
                    worth = parse_mapping(get_block(fm_lines, "worth_reprinting"))
                    bob_note = get_scalar(fm_lines, "bob_note")
                    campaign = parse_mapping(get_block(fm_lines, "campaign"))
                    errors.extend(validate_email_quote_sync(email, fm_lines))
                    errors.extend(validate_email_bob_note(email, bob_note, campaign))
                    errors.extend(
                        validate_email_story_copy(
                            email,
                            essays,
                            worth,
                            article_dividers=truthy(
                                get_scalar(fm_lines, "email_article_dividers")
                            ),
                        )
                    )
        if expected_issue_link:
            expected_cta = f"# [Read the full issue ->]({expected_issue_link})"
            if expected_cta not in email:
                errors.append("email.md missing configured H1 Read the full issue CTA")
            elif expected_cta not in "\n".join(email.splitlines()[:16]):
                errors.append("email.md H1 Read the full issue CTA must appear near the top")

    margin_path = package_dir / "margin-rail.md"
    if margin_path.is_file():
        margin = read_text(margin_path)
        for heading in REQUIRED_MARGIN_HEADINGS:
            if heading not in margin:
                errors.append(f"margin-rail.md missing heading: {heading}")
        if strict:
            errors.extend(validate_source_urls(margin))

    errors.extend(validate_quote_ledger(package_dir, strict=strict))

    manifest_path = package_dir / "manifest.md"
    if manifest_path.is_file():
        manifest = read_text(manifest_path)
        if "package_name: almanack-package-" not in manifest:
            errors.append("manifest.md missing package_name")
        if strict and "status: complete" not in manifest.lower():
            errors.append("manifest.md must record status: complete for strict validation")
        for name in required_package_files(package_dir):
            if name not in manifest:
                errors.append(f"manifest.md missing inventory entry: {name}")

    if strict:
        errors.extend(validate_no_placeholders(package_dir))
        checklist_path = package_dir / "source-checklist.md"
        if checklist_path.is_file():
            checklist = read_text(checklist_path)
            if re.search(r"(?m)^-\s+\[\s\]", checklist):
                errors.append("source-checklist.md contains unchecked checklist items")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a Bob's Almanack package.")
    parser.add_argument("package_dir", type=Path)
    parser.add_argument("--strict", action="store_true", help="Require completed content. This is the default.")
    parser.add_argument("--structure-only", action="store_true", help="Only check required files and headings.")
    parser.add_argument(
        "--affirmations-bank-path",
        type=Path,
        help="Explicit Things We Say affirmations-bank.md path (primarily for tests).",
    )
    args = parser.parse_args()

    strict = not args.structure_only
    if args.strict:
        strict = True

    errors = validate_package(
        args.package_dir.resolve(),
        strict=strict,
        affirmations_bank_path=args.affirmations_bank_path,
    )
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    print(f"OK: {args.package_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
