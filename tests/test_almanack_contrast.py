"""Offline regression coverage for a provider that discards body inheritance."""

import runpy
import unittest
from html.parser import HTMLParser
from pathlib import Path

MODULE = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/almanack_email_contrast.py"))
apply_contrast = MODULE["apply_contrast"]


class Elements(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.elements = []
        self.words = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))

    def handle_data(self, text):
        self.words.append(text)

    def handle_entityref(self, name):
        self.words.append("&" + name + ";")

    def handle_charref(self, name):
        self.words.append("&#" + name + ";")


def contrast(foreground, background):
    def luminance(color):
        rgb = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
        rgb = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in rgb]
        return sum(x * weight for x, weight in zip(rgb, (0.2126, 0.7152, 0.0722)))
    a, b = sorted((luminance(foreground), luminance(background)))
    return (b + 0.05) / (a + 0.05)


class ContrastTests(unittest.TestCase):
    source = '''<!doctype html><html><head><title>Issue 23</title></head>
<body style="color:#332a22;background:#f4eddf">
<div style="display:none;max-height:0;mso-hide:all">Specific preheader</div>
<table role="presentation" style="background:#f4eddf"><tr><td style="padding:24px">
<header><img src="https://example.invalid/art.png" alt="Masthead &amp; art" style="width:100%;height:auto"></header>
<blockquote><p>A protected quote &amp; its &#8217; entity.</p><p style="font-size:14px">An attribution</p></blockquote>
<section><h2>Note from Bob</h2><p>Body <em>emphasis</em>.</p><ul><li>List fact</li></ul>
<a href="https://example.invalid/?style=untouched&amp;x=1" style="color:blue"><strong>Source</strong> <span>link</span></a></section>
<footer><p>Closing motto</p><a href="https://outsideinprint.org/">Outside In Print</a></footer>
</td></tr></table></body></html>'''

    def test_text_remains_paired_after_provider_discards_body_attributes(self):
        fixed = Elements(apply_contrast(self.source))
        # Assert retained descendants have their own foreground/background;
        # body-level color cannot satisfy this original regression.
        for tag, attrs in fixed.elements:
            if tag in ("table", "td", "h2", "p", "blockquote", "li", "em", "footer"):
                style = attrs.get("style", "")
                self.assertRegex(style, r"color:#[0-9a-f]{6}!important;")
                self.assertIn("background-color:#f4eddf!important;", style)
        quotes = [attrs for tag, attrs in fixed.elements if tag == "blockquote"]
        self.assertIn("color:#332a22!important", quotes[0]["style"])

    def test_links_and_their_emphasized_children_keep_accessible_blue(self):
        elements = Elements(apply_contrast(self.source)).elements
        for tag, attrs in elements:
            if tag in ("a", "strong", "span"):
                self.assertIn("color:#346782!important", attrs["style"])
                self.assertIn("text-decoration:underline!important", attrs["style"])

    def test_copy_links_art_and_typography_are_preserved(self):
        before, after = Elements(self.source), Elements(apply_contrast(self.source))
        self.assertEqual(before.words, after.words)
        self.assertEqual([tag for tag, _ in before.elements], [tag for tag, _ in after.elements])
        for (tag, old), (_, new) in zip(before.elements, after.elements):
            for name in ("href", "src", "alt", "role"):
                self.assertEqual(old.get(name), new.get(name))
            if tag == "img":
                self.assertEqual(old, new)
        self.assertIn("display:none;max-height:0;mso-hide:all", apply_contrast(self.source))
        self.assertIn("padding:24px", apply_contrast(self.source))

    def test_repeated_application_is_stable(self):
        once = apply_contrast(self.source)
        self.assertEqual(apply_contrast(once), once)

    def test_palette_meets_normal_text_contrast_and_reproduces_bad_provider_quote(self):
        for name in ("INK", "SECONDARY", "LINK"):
            self.assertGreaterEqual(contrast(MODULE[name], MODULE["PAPER"]), 4.5, name)
        self.assertLess(contrast("#d2d2d2", MODULE["PAPER"]), 1.4)

    def test_requires_generated_document_and_does_not_style_outside_its_body(self):
        with self.assertRaises(ValueError):
            apply_contrast("<p>Provider wrapper fragment</p>")
        outside = '<p style="color:green">Outside</p>'
        self.assertTrue(apply_contrast(self.source + outside).endswith(outside))


if __name__ == "__main__":
    unittest.main()
