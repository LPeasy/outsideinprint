"""Compare publication semantics from two builds made at the same clock."""
from __future__ import annotations
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
import re
import xml.etree.ElementTree as ET


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = 0
        self.text = []
        self.metadata = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style"):
            self.hidden += 1
        if tag == "link" and attrs.get("rel") == "canonical":
            self.metadata["canonical"] = attrs.get("href")
        if tag == "meta" and attrs.get("name") in ("description", "robots"):
            self.metadata[attrs["name"]] = attrs.get("content")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.text.append(data)

    def normalized_text(self):
        return re.sub(r"\s+", " ", " ".join(self.text)).strip()


def text(markup):
    page = Page()
    page.feed(markup)
    return page.normalized_text()


def profile(directory):
    result = {"html": {}, "feeds": {}, "payload": {"files": 0, "bytes": 0, "imageBytes": 0, "derivatives": 0}}
    for file in sorted(directory.rglob("*")):
        if not file.is_file():
            continue
        relative = file.relative_to(directory).as_posix()
        if relative.startswith("pdfs/"):
            continue  # Production intentionally removes paused PDF artifacts.
        size = file.stat().st_size
        result["payload"]["files"] += 1
        result["payload"]["bytes"] += size
        if relative.startswith("images/"):
            result["payload"]["imageBytes"] += size
        if relative.startswith("images/rendered/"):
            result["payload"]["derivatives"] += 1
        if file.suffix == ".html":
            page = Page()
            page.feed(file.read_text(encoding="utf-8"))
            normalized = page.normalized_text()
            result["html"][relative] = {
                **page.metadata,
                "visibleTextSha256": hashlib.sha256(normalized.encode()).hexdigest(),
                "readingTimes": [int(value) for value in re.findall(r"\b(\d+) min read\b", normalized)],
                "textWithoutReadingTimesSha256": hashlib.sha256(re.sub(r"\b\d+ min read\b", "READING TIME", normalized).encode()).hexdigest(),
            }
        elif file.name == "index.xml":
            root = ET.parse(file).getroot()
            # Compare all exposed feed fields, including automatic summaries,
            # while allowing the generator version to reflect the upgrade.
            result["feeds"][relative] = [(element.tag, text(element.text or ""), sorted(element.attrib.items())) for element in root.iter() if element.tag.rsplit("}", 1)[-1] != "generator"]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--clock", required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--allow-reading-time-update", action="store_true", help="Accept only unchanged page text/metadata with reading estimates increasing by at most one minute; record every accepted difference.")
    args = parser.parse_args()
    for directory in (args.baseline, args.candidate):
        if not (directory / "index.html").is_file():
            parser.error(f"Missing completed build: {directory}")
    before, after = profile(args.baseline), profile(args.candidate)
    differences = []
    expected_differences = []
    for group in ("html", "feeds"):
        for route in sorted(set(before[group]) | set(after[group])):
            if before[group].get(route) != after[group].get(route):
                old, new = before[group].get(route), after[group].get(route)
                difference = {"group": group, "route": route, "before": old, "after": new}
                if args.allow_reading_time_update and group == "html" and old and new:
                    metadata_keys = set(old) | set(new)
                    metadata_keys -= {"visibleTextSha256", "readingTimes"}
                    estimates = list(zip(old["readingTimes"], new["readingTimes"]))
                    if (all(old.get(key) == new.get(key) for key in metadata_keys)
                            and len(old["readingTimes"]) == len(new["readingTimes"])
                            and all(a <= b <= a + 1 for a, b in estimates)):
                        difference["reason"] = "Hugo corrected reading-time rounding; all other text and metadata agree."
                        expected_differences.append(difference)
                        continue
                differences.append(difference)
    report = {"buildClockUtc": args.clock, "baseline": str(args.baseline), "candidate": str(args.candidate), "htmlRoutes": len(after["html"]), "feeds": len(after["feeds"]), "baselinePayload": before["payload"], "candidatePayload": after["payload"], "expectedDifferences": expected_differences, "differences": differences}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Compared {report['htmlRoutes']} HTML routes and {report['feeds']} feeds at {args.clock}; {len(differences)} unexpected differences, {len(expected_differences)} documented reading-time changes. Report: {args.report}")
    return int(bool(differences))


if __name__ == "__main__":
    raise SystemExit(main())
