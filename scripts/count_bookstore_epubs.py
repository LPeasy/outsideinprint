"""Read-only word counts for the four bookstore editions.

Uses only the Python standard library. Reads an EPUB supplied by the operator;
never rewrites it, prints its text, or prints private paths or artifact hashes.
The fixed content scopes deliberately exclude cover, title and copyright pages.
"""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET


NS = {"opf": "http://www.idpf.org/2007/opf", "x": "http://www.w3.org/1999/xhtml"}
BLOCKS = {
    "address", "article", "aside", "blockquote", "dd", "div", "dl", "dt",
    "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
    "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section",
    "table", "tbody", "td", "th", "thead", "tr", "ul", "br",
}
# A word is a Unicode letter/digit sequence; internal apostrophes and hyphens
# remain within that word. Underscores are separators. Numeric note markers count.
WORDS = re.compile(r"[^\W_]+(?:['\u2019\-][^\W_]+)*", flags=re.UNICODE)
SCOPES = {
    "american_nightmare": {
        f"EPUB/text/ch{i:03}.xhtml" for i in range(2, 32)
    },
    "parable_of_the_sheep": {
        f"EPUB/text/chapter-{i:02}.xhtml" for i in range(1, 14)
    },
    "the_water_cycle": {
        "OEBPS/chapters/03_prologue.xhtml",
        "OEBPS/chapters/04_part1.xhtml",
        "OEBPS/chapters/05_part2.xhtml",
        "OEBPS/chapters/06_part3.xhtml",
        "OEBPS/chapters/07_conclusion.xhtml",
        "OEBPS/chapters/08_sources.xhtml",
    },
    "2045": {
        "EPUB/text/02-the-cracked-pot.xhtml",
        "EPUB/text/03-memory-lane.xhtml",
        "EPUB/text/04-chicago-96-tomorrow.xhtml",
        "EPUB/text/05-zero-sum.xhtml",
        "EPUB/text/06-the-fair-advertising-tax-reform-act.xhtml",
        "EPUB/text/07-the-infinite-meeting-tenebris.xhtml",
        "EPUB/text/08-veritas-lex.xhtml",
        "EPUB/text/09-the-last-human-artist.xhtml",
        "EPUB/text/10-the-habeas-court.xhtml",
        "EPUB/text/11-deus-machina.xhtml",
        *(f"EPUB/text/illustration-{i:02}.xhtml" for i in range(1, 11)),
    },
}


def text_with_block_boundaries(element: ET.Element) -> str:
    """Preserve inline words; separate block elements without counting markup."""
    tag = element.tag.rsplit("}", 1)[-1]
    if tag in {"script", "style"}:
        return ""
    result = element.text or ""
    for child in element:
        result += text_with_block_boundaries(child) + (child.tail or "")
    return "\n" + result + "\n" if tag in BLOCKS else result


def count_edition(book: str, epub_path: str) -> dict:
    with zipfile.ZipFile(epub_path) as archive:
        container = ET.fromstring(archive.read("META-INF/container.xml"))
        opf_path = next(
            element.attrib["full-path"]
            for element in container.iter()
            if element.tag.endswith("}rootfile")
        )
        package = ET.fromstring(archive.read(opf_path))
        manifest = {
            item.attrib["id"]: item.attrib["href"]
            for item in package.find("opf:manifest", NS)
        }
        rows = []
        for item in package.find("opf:spine", NS):
            member = posixpath.normpath(
                str(PurePosixPath(opf_path).parent / manifest[item.attrib["idref"]])
            )
            if member not in SCOPES[book]:
                continue
            root = ET.fromstring(archive.read(member))
            body = root.find("x:body", NS)
            if body is None:
                raise ValueError("Required reading member has no XHTML body")
            rows.append({
                "member": member,
                "words": len(WORDS.findall(text_with_block_boundaries(body))),
            })
        if len(rows) != len(SCOPES[book]) or {r["member"] for r in rows} != SCOPES[book]:
            raise ValueError("Edition does not match the complete audited content scope")
        language = next(
            element.text for element in package.iter()
            if element.tag.endswith("}language")
        )
        return {
            "book": book,
            "epub_version": package.attrib["version"],
            "language": language,
            "word_count": sum(row["words"] for row in rows),
            "members": rows,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book", required=True, choices=tuple(SCOPES))
    parser.add_argument("--epub", required=True, help="Local full published edition")
    args = parser.parse_args()
    try:
        result = count_edition(args.book, args.epub)
    except (OSError, ValueError, KeyError, StopIteration, ET.ParseError, zipfile.BadZipFile):
        parser.exit(1, "Unable to audit the supplied edition; check its format and complete content scope.\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
