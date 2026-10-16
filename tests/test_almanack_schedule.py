"""Bounded conversion and real Hugo scheduling guards, without the image library."""

import datetime as dt
import base64
import importlib.util
import json
import runpy
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("stage_almanack", ROOT / "scripts/stage_almanack_publication.py")
STAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STAGE)
HUGO = runpy.run_path(str(ROOT / "scripts/render_almanack_distribution.py"))["HUGO"]
RELEASE = "2026-10-17T08:00:00-04:00"
ROUTE = "/almanack/2026-10-17/"
SOURCE = b'''---
title: "Bob's Almanack"
metadata_title: "Bob's Almanack - October 17, 2026"
date: 2026-10-17
draft: true
url: "/almanack/2026-10-17/"
issue_number: 24
editorial_contract: "almanack-v1"
description: "Syd has a story to tell."
collections: ["bobs-almanack"]
bob_note: "Stop and listen."
---
Protected body, quote, link and original whitespace.
'''


def write_fixture(root):
    """Keep production eligibility/collection/feed partials; simplify only presentation."""
    for folder in ("content/almanack", "content/collections", "layouts/_default", "layouts/collections",
                   "layouts/partials/almanack", "layouts/partials/feeds", "layouts/partials/archive", "data"):
        (root / folder).mkdir(parents=True, exist_ok=True)
    (root / "hugo.toml").write_text('''baseURL = "https://outsideinprint.org/"
timeZone = "America/New_York"
disableKinds = ["taxonomy", "term"]
[outputs]
home = ["HTML", "RSS"]
page = ["HTML"]
section = ["HTML", "RSS"]
''', encoding="utf-8")
    (root / "content/almanack/2026-10-17.md").write_bytes(STAGE.staged_source(SOURCE, RELEASE))
    (root / "content/almanack/2026-10-10.md").write_text('''---
title: "Prior Issue"
date: 2026-10-10
draft: false
url: "/almanack/2026-10-10/"
collections: ["bobs-almanack"]
---
Prior issue.
''', encoding="utf-8")
    (root / "content/collections/bobs-almanack.md").write_text('''---
title: "Bob's Almanack archive"
date: 2026-01-01
layout: "bobs-almanack"
url: "/collections/bobs-almanack/"
---
''', encoding="utf-8")
    (root / "data/collections.json").write_text(json.dumps({"collections": [
        {"slug": "bobs-almanack", "explicit_only": True, "description": "Almanack archive"}]}), encoding="utf-8")
    shutil.copytree(ROOT / "layouts/partials/collections", root / "layouts/partials/collections")
    for name in ("feeds/resolve-entries.html", "almanack/latest-issue-url.html", "archive/longform-kind.html"):
        shutil.copyfile(ROOT / "layouts/partials" / name, root / "layouts/partials" / name)
    # Description presentation is irrelevant to the timing predicate under test.
    (root / "layouts/partials/metadata_description.html").write_text('{{ return (.Params.description | default "Issue") }}', encoding="utf-8")
    (root / "layouts/_default/single.html").write_text('<h1>{{ .Title }}</h1><p>{{ .Params.bob_note }}</p>{{ .Content }}', encoding="utf-8")
    (root / "layouts/_default/list.html").write_text('{{ range .Pages }}<a href="{{ .RelPermalink }}">{{ .Title }}</a>{{ end }}', encoding="utf-8")
    (root / "layouts/index.html").write_text('''<p>Unchanged public homepage lead</p><a id="sample" href="{{ partial "almanack/latest-issue-url.html" . }}">Read the latest Almanack</a>''', encoding="utf-8")
    (root / "layouts/collections/bobs-almanack.html").write_text('''{{ $definition := partial "collections/lookup-definition.html" "bobs-almanack" }}{{ range partial "collections/resolve-items.html" (dict "collection" $definition "publishedOnly" true) }}<a href="{{ .RelPermalink }}">{{ .Title }}</a>{{ end }}''', encoding="utf-8")
    (root / "layouts/_default/rss.xml").write_text('''<rss version="2.0"><channel>{{ range partial "feeds/resolve-entries.html" (dict "site" site "mode" "almanack") }}<item><title>{{ .title }}</title><link>{{ .permalink }}</link></item>{{ end }}</channel></rss>''', encoding="utf-8")


class AlmanackScheduleTests(unittest.TestCase):
    def test_converter_preserves_every_other_byte_in_lf_and_crlf_sources(self):
        for source in (SOURCE, SOURCE.replace(b"\n", b"\r\n")):
            result = STAGE.staged_source(source, RELEASE)
            ending = b"\r\n" if b"\r\n" in source else b"\n"
            self.assertEqual(source, result.replace(b"draft: false", b"draft: true", 1)
                             .replace(ending + b"publishDate: " + RELEASE.encode(), b"", 1))

    def test_converter_rejects_existing_schedule_missing_or_duplicate_draft(self):
        cases = [SOURCE.replace(b"draft: true", b"draft: false"),
                 SOURCE.replace(b"draft: true\n", b""),
                 SOURCE.replace(b"draft: true", b"draft: true\ndraft: true"),
                 SOURCE.replace(b"draft: true", b"draft: true\npublishDate: 2026-10-17"),
                 SOURCE.replace(b"draft: true", b"draft: true\nPublishDate: 2026-10-17")]
        for source in cases:
            with self.subTest(source=source), self.assertRaises(ValueError):
                STAGE.staged_source(source, RELEASE)

    def test_hugo_parses_only_approved_schedule_changes(self):
        before = STAGE.parse_with_hugo(SOURCE, HUGO)
        after = STAGE.parse_with_hugo(STAGE.staged_source(SOURCE, RELEASE), HUGO)
        expected = dict(before["params"], draft=False, publishdate=RELEASE)
        self.assertEqual(after["params"], expected)
        self.assertFalse(after["draft"])
        self.assertEqual(after["publishDate"], RELEASE)
        self.assertEqual(after["route"], ROUTE)

    def test_release_checks_eastern_offset_date_and_future_instant(self):
        now = dt.datetime(2026, 10, 16, tzinfo=dt.timezone.utc)
        self.assertEqual(STAGE.release_time(RELEASE, "2026-10-17", HUGO, now).isoformat(), RELEASE)
        for value in ("2026-10-17T08:00:00-05:00", "2026-10-17T08:00:00", "2026-10-18T08:00:00-04:00"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                STAGE.release_time(value, "2026-10-17", HUGO, now)
        with self.assertRaises(ValueError):
            STAGE.release_time(RELEASE, "2026-10-17", HUGO, dt.datetime(2026, 10, 17, 12, tzinfo=dt.timezone.utc))
        # Winter time uses -05:00 without any Python timezone package.
        winter = "2026-12-05T08:00:00-05:00"
        self.assertEqual(STAGE.release_time(winter, "2026-12-05", HUGO, now).isoformat(), winter)

    def test_payload_preflight_is_idempotent_and_never_overwrites_different_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            payload = {"content/almanack/2026-10-17.md": b"approved", "static/images/almanack/test.png": b"art"}
            STAGE.apply_payload(payload, root)
            STAGE.apply_payload(payload, root, validate_only=True)
            STAGE.apply_payload(payload, root)
            (root / "content/almanack/2026-10-17.md").write_bytes(b"changed")
            with self.assertRaises(ValueError):
                STAGE.apply_payload({**payload, "static/new.png": b"new"}, root)
            self.assertFalse((root / "static/new.png").exists())
            self.assertEqual((root / "content/almanack/2026-10-17.md").read_bytes(), b"changed")
            with self.assertRaises(ValueError):
                STAGE.apply_payload({"../outside.md": b"escape"}, root)

    def test_only_referenced_issue_art_is_included_and_unsafe_urls_fail(self):
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTj0AAAAASUVORK5CYII=")
        with tempfile.TemporaryDirectory() as tmp:
            package = Path(tmp)
            (package / "bob-poses").mkdir()
            for name in ("chosen.png", "unused.png"):
                (package / "bob-poses" / name).write_bytes(png)
            (package / "paper-masthead.png").write_bytes(png)
            prefix = "https://outsideinprint.org/images/almanack/2026-10-17/"
            content = {"email_masthead": {"image_url": prefix + "paper-masthead.png"},
                       "bob_ornaments": {"masthead": {"image_url": prefix + "chosen.png"}},
                       "existing_story_art": "https://outsideinprint.org/images/rendered/editorial/old/hero.png"}
            assets = STAGE.issue_assets(content, "2026-10-17", package)
            self.assertEqual(set(assets), {"static/images/almanack/2026-10-17/paper-masthead.png",
                                          "static/images/almanack/2026-10-17/chosen.png"})
            for suffix in ("../escape.png", "chosen.png?other=1", "chosen.png#fragment"):
                content["bob_ornaments"]["masthead"]["image_url"] = prefix + suffix
                with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                    STAGE.issue_assets(content, "2026-10-17", package)

    def test_before_and_at_release_route_collection_sample_feeds_and_sitemap(self):
        with tempfile.TemporaryDirectory(prefix="almanack-schedule-fixture-") as tmp:
            root = Path(tmp)
            write_fixture(root)
            for label, clock, eligible in (("before", "2026-10-17T07:59:59-04:00", False),
                                           ("release", RELEASE, True)):
                output = root / label
                subprocess.run([str(HUGO), "--source", str(root), "--destination", str(output),
                                "--clock", clock, "--panicOnWarning"], check=True, capture_output=True, text=True)
                self.assertEqual((output / "almanack/2026-10-17/index.html").exists(), eligible)
                for path in ("collections/bobs-almanack/index.html", "index.html", "index.xml", "almanack/index.xml", "sitemap.xml"):
                    with self.subTest(clock=clock, path=path):
                        self.assertEqual(ROUTE in (output / path).read_text(encoding="utf-8"), eligible)
                self.assertIn("Unchanged public homepage lead", (output / "index.html").read_text(encoding="utf-8"))
                if not eligible:
                    self.assertIn('/almanack/2026-10-10/', (output / "index.html").read_text(encoding="utf-8"))
            # Deliberate preview can render the future route; normal production flags cannot.
            output = root / "preview"
            subprocess.run([str(HUGO), "--source", str(root), "--destination", str(output), "--clock",
                            "2026-10-17T07:59:59-04:00", "--buildFuture", "--panicOnWarning"],
                           check=True, capture_output=True, text=True)
            self.assertTrue((output / "almanack/2026-10-17/index.html").exists())
            self.assertNotIn(ROUTE, (output / "collections/bobs-almanack/index.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
