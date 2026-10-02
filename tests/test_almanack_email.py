"""Exercise generated email artifacts, not provider configuration or sending."""

import importlib.util
import json
import os
import shutil
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("almanack_email", REPO / "scripts/render_almanack_email.py")
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
HUGO = os.environ.get("OIP_HUGO_BIN") or shutil.which("hugo")


class ParsedEmail(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.text = []
        self.links = []
        self.images = []
        self.headlines = 0
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a":
            self.links.append(attrs.get("href"))
        if tag == "img":
            self.images.append(attrs)
        if tag == "h1":
            self.headlines += 1

    def handle_data(self, data):
        self.text.append(data)


@unittest.skipUnless(HUGO, "Pinned Hugo is required for rendered email tests")
class RenderedEmailTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="oip-email-test-")
        self.root = Path(self.temp.name)
        self.source = (REPO / "content/almanack/2026-09-26.md").read_text(encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def render(self, source):
        issue = self.root / "issue.md"
        issue.write_text(source, encoding="utf-8")
        destination = self.root / "rendered"
        metadata = renderer.render(issue, destination, HUGO)
        html = (destination / "email.html").read_text(encoding="utf-8")
        plain = (destination / "email.txt").read_text(encoding="utf-8")
        return metadata, html, plain

    def modern_source(self):
        article = (REPO / "content/essays/affirmations/rain-before-breakfast.md").read_text(encoding="utf-8")
        excerpt = "\n\n".join(article.split("---", 2)[2].strip().split("\n\n")[:4])
        source = self.source.split("---", 2)[1]
        source = source.replace('version: "1.0"', 'version: "1.0"\neditorial_contract: "almanack-v1"\nemail_preheader: "Rain, bread, and the public record."')
        source = source.replace('    description: "The Things We Say"', '    description: "The Things We Say"\n    excerpt: ' + json.dumps(excerpt))
        source = source.replace('    description: "A Fine Place to Start."', '    description: "A Fine Place to Start."\n    capsule: "A warm roll and a reader’s note make room to write."')
        source = source.replace('worth_reprinting:\n', 'worth_reprinting:\n  rationale: "A reason to revisit who enters the public record this week."\n')
        return "---" + source + "---\nBODY_DUPLICATION_SENTINEL\n", excerpt

    def test_issue22_preserves_approved_subject_link_and_all_five_pieces(self):
        source = (REPO / "content/almanack/2026-10-03.md").read_text(encoding="utf-8")
        metadata, html, plain = self.render(source)
        parsed = ParsedEmail(html)
        self.assertEqual(metadata["subject"], "Bob\u2019s Almanack ~ October 3, 2026 ~ Issue 22")
        self.assertEqual(metadata["issue_number"], 22)
        self.assertEqual(len(metadata["content"]["essays"]), 5)
        self.assertEqual(len(parsed.images), 6)
        self.assertIn("https://outsideinprint.org/collections/the-restless-heart/", parsed.links)
        self.assertNotIn("[The Restless Heart](", html)
        self.assertEqual(metadata["content"]["worth_reprinting"]["title"], "Say Less to Say More")
        for essay in metadata["content"]["essays"]:
            self.assertIn(essay["title"], plain)
            self.assertIn(essay.get("excerpt", essay.get("capsule", "")), plain)
        self.assertIn("I\u2019m grateful for this day and its opportunities.", plain)

    def test_legacy_source_preserves_issue_facts_artwork_and_canonical_number(self):
        metadata, html, plain = self.render(self.source)
        parsed = ParsedEmail(html)
        visible = " ".join(parsed.text)
        self.assertEqual(metadata["issue_number"], 21)
        self.assertIn("Issue 21", visible)
        self.assertIn("Issue 21", plain)
        self.assertEqual(parsed.headlines, 0, "The supplied image masthead must not acquire a duplicate heading.")
        self.assertEqual(len(parsed.images), 3)
        self.assertEqual(parsed.images[0]["src"], metadata["content"]["email_masthead"]["image_url"])
        self.assertEqual([image["alt"] for image in parsed.images[1:]], [item["image_alt"] for item in metadata["content"]["essays"]])
        for item in metadata["content"]["essays"]:
            self.assertIn(item["email_image"], html)
        margin = metadata["content"]["margin"]
        for key in ("one_number", "one_document"):
            self.assertIn(margin[key]["note"], visible)
            self.assertIn(margin[key]["note"], plain)
            self.assertIn(margin[key].get("source_url", margin[key].get("url")), parsed.links)
        for key in ("results", "records", "final_bows", "obituaries"):
            for item in margin[key]:
                self.assertIn(item["text"], visible)
                self.assertIn(item["text"], plain)
                self.assertIn(item["url"], parsed.links)
        self.assertIn(metadata["content"]["virtue"]["reflection"], visible)
        self.assertIn(metadata["content"]["virtue"]["reflection"], plain)
        for key in ("opening_quote", "middle_quote", "closing_quote"):
            self.assertIn(metadata["content"][key], visible)
            self.assertIn(metadata["content"][key], plain)
        for old in ("lpeasy.github.io", "medium.com/the-balanced-sheet", "issue #17"):
            self.assertNotIn(old, html + plain)
        self.assertTrue(metadata["review_only"])
        self.assertFalse(metadata["provider_preview_verified"])

    def test_excerpt_capsule_rationale_render_once_from_front_matter(self):
        source, excerpt = self.modern_source()
        metadata, html, plain = self.render(source)
        visible = " ".join(ParsedEmail(html).text)
        self.assertEqual(len(excerpt.split()), 67)
        for paragraph in excerpt.split("\n\n"):
            self.assertEqual(visible.count(paragraph), 1)
            self.assertEqual(plain.count(paragraph), 1)
        self.assertIn("From the essay", html)
        self.assertIn("Read the full essay", plain)
        for value in (metadata["content"]["essays"][1]["capsule"], metadata["content"]["worth_reprinting"]["rationale"]):
            self.assertEqual(visible.count(value), 1)
            self.assertEqual(plain.count(value), 1)
        self.assertNotIn(metadata["content"]["worth_reprinting"]["description"], visible)
        self.assertNotIn(metadata["content"]["worth_reprinting"]["blurb"], plain)
        self.assertNotIn("BODY_DUPLICATION_SENTINEL", html + plain)
        self.assertLess(html.index("View the web version"), html.index("Note from Bob"))
        self.assertLess(html.index("Note from Bob"), html.index("New from Outside In Print"))

    def test_invalid_excerpt_fails_before_writing_review_artifacts(self):
        source, excerpt = self.modern_source()
        with self.assertRaisesRegex(ValueError, "60–100"):
            self.render(source.replace(json.dumps(excerpt), '"A short label."'))
        self.assertFalse((self.root / "rendered/email.html").exists())

    def test_prose_is_escaped_in_html_and_preserved_in_plaintext(self):
        source = self.source.replace('bob_note: "', 'bob_note: "<script>alert(1)</script> & ')
        _, html, plain = self.render(source)
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)
        self.assertIn("<script>alert(1)</script> & ", plain)

    def test_private_review_link_is_explicit_and_stale_masthead_is_rejected(self):
        source = self.source.replace('version: "1.0"', 'version: "1.0"\nreview_notice: "Private September 26 review copy ~ not for publication."')
        _, html, plain = self.render(source)
        self.assertIn("Original published issue", html)
        self.assertIn("Original published issue", plain)
        self.assertNotIn("View the web version", html + plain)
        with self.assertRaises(Exception):
            self.render(source.replace('  issue_number: 21', '  issue_number: 17'))


if __name__ == "__main__":
    unittest.main()
