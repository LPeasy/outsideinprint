"""Offline negative cases for the bounded Disney live-release verifier."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("verify_disney_release", Path(__file__).resolve().parents[1] / "scripts/ci/verify_disney_release.py")
verifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verifier)


class ReleaseVerification(unittest.TestCase):
    def setUp(self):
        self.source = '---\nfeatured_image_alt: "Artwork"\n---\n![Artwork](oip-image:essays/fixture/body)\n\n*Photo by [Owner](https://example.org/photo), [CC BY](https://example.org/license).*\n'
        self.release = {"slug": "fixture", "releaseAt": "2026-10-25T09:00:00-04:00", "endsAt": "2026-10-26T00:00:00-04:00",
                        "title": "Disney's Story", "opening": "First paragraph.", "ending": "Final paragraph.", "heroTitle": "Inside the Story", "heroCaption": "A new adventure.", "seriesPart": 2,
                        "sourceSha256": hashlib.sha256(self.source.encode()).hexdigest(),
                        "images": [{"id": "essays/fixture/hero", "width": 1672, "height": 941}, {"id": "essays/fixture/body", "width": 1200, "height": 800}]}
        self.config = {"flagship": "/essays/flagship/", "seriesRoutes": ["/essays/first/", "/essays/fixture/"]}
        self.sha, self.generated = "a" * 40, "2026-10-25T13:05:00.1234567Z"
        self.receipt = {"expectedSha": self.sha, "expectedGeneratedAt": self.generated, "observed": {"commitSha": self.sha, "generatedAtUtc": self.generated, "buildClockUtc": "2026-10-25T13:00:30Z"}}
        self.hero = self.picture("hero", 1600, 900)
        self.body_picture = self.picture("body", 1200, 800)
        self.pages = {
            "/essays/fixture/": '<meta property="og:image" content="/images/social.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="675"><meta name="twitter:image" content="/images/social.jpg"><article><h1>Disney’s Story</h1><p class="piece-byline"><span>By</span><a>Robert V. Ussley</a></p><figure>' + self.hero + '<figcaption>A new adventure.</figcaption></figure><div class="piece-body"><p>First paragraph.<p>' + self.body_picture + '<p><em>Photo by <a href="https://example.org/photo">Owner</a>, <a href="https://example.org/license">CC BY</a>.</em><p>Final paragraph.</div>' + self.nav(["/essays/first/"]) + '</article>',
            "/essays/first/": self.nav(["/essays/fixture/"]),
            "/collections/brands-business-consumer-choice/": '<a href="/essays/fixture/">Disney</a>',
            "/gallery/": '<section class="cartoon-gallery-spotlight"><h2>Inside the Story</h2><a href="/essays/fixture/">Read</a>' + self.hero + '</section>',
            "/": '<article class="home-v2-featured__lead"><a href="/essays/flagship/">Lead</a></article><article class="home-v2-featured__item--latest"><a class="reading-card__link" href="/essays/fixture/">Latest</a></article>',
        }
        self.calls = []

    @staticmethod
    def nav(paths):
        return '<nav data-article-series="disney-world-development"><ul>' + ''.join('<li><a href="' + path + '">Part</a>' for path in paths) + '</ul></nav>'

    @staticmethod
    def picture(name, width, height):
        return f'<picture data-oip-image-id="essays/fixture/{name}"><source type="image/avif" srcset="/images/{name}.avif {width}w"><img src="/images/{name}.webp" srcset="/images/{name}.webp {width}w" data-lightbox-src="/images/{name}.webp" width="{width}" height="{height}" alt="Artwork"></picture>'

    def fetch(self, path, image=False):
        self.calls.append((path, image))
        return "" if image else self.pages[path]

    def verify(self):
        return verifier.verify_release(self.release, self.config, self.receipt, self.fetch, self.source, self.sha, self.generated)

    def test_complete_release_uses_existing_receipt_and_unique_fetches(self):
        self.pages["/essays/fixture/"] = self.pages["/essays/fixture/"].replace("Owner</a>,", "Owner</a>\n,")
        self.pages["/essays/fixture/"] = self.pages["/essays/fixture/"].replace('/images/hero.avif 1600w', '/images/hero-small.avif 400w, /images/hero.avif 1600w').replace('/images/hero.webp 1600w', '/images/hero-small.webp 400w, /images/hero.webp 1600w')
        result = self.verify()
        self.assertEqual(result["article"], "/essays/fixture/")
        self.assertEqual(len(self.calls), len(set(self.calls)))
        self.assertFalse(any("manifest" in path for path, _ in self.calls))
        self.assertEqual(len(result["checkedImageUrls"]), 5)
        self.assertFalse(any("small" in path for path, _ in self.calls))

    def test_wrong_build_or_early_clock_stops_before_network(self):
        for field, value in [("generatedAtUtc", "2026-10-25T13:06:00Z"), ("commitSha", "b" * 40), ("buildClockUtc", "2026-10-25T12:59:59Z"), ("buildClockUtc", "2027-10-25T13:00:00Z")]:
            with self.subTest(field=field, value=value):
                original = copy.deepcopy(self.receipt)
                self.receipt["observed"][field] = value
                with self.assertRaises(ValueError):
                    self.verify()
                self.assertEqual(self.calls, [])
                self.receipt = original

    def test_source_change_stops_before_network(self):
        self.source += "Changed"
        with self.assertRaisesRegex(ValueError, "source changed"):
            self.verify()
        self.assertEqual(self.calls, [])

    def test_missing_content_credit_or_oversized_image_fails(self):
        article = self.pages["/essays/fixture/"]
        for before, after, error in [("Disney’s Story", "Wrong", "title"), ("Robert V. Ussley", "Other", "byline"), ("First paragraph.", "Changed", "opening"), ("Final paragraph.", "Changed", "ending"), ("https://example.org/license", "https://wrong.example/license", "credit"), ('width="1600"', 'width="1700"', "bounds"), ('alt="Artwork"', 'alt="Wrong"', "alt text"), ('content="1200"', 'content="1400"', "Social image dimensions")]:
            with self.subTest(error=error):
                self.pages["/essays/fixture/"] = article.replace(before, after)
                with self.assertRaisesRegex(ValueError, error):
                    self.verify()
        self.pages["/essays/fixture/"] = article

    def test_caption_credit_accepts_hugo_encoded_path_parentheses(self):
        original = "https://commons.wikimedia.org/wiki/File:Cinderella_Castle_%C3%A0_Magic_Kingdom_(f%C3%A9vrier_2022).JPG"
        rendered = original.replace("(", "%28").replace(")", "%29")
        self.source = self.source.replace("https://example.org/photo", original)
        self.release["sourceSha256"] = hashlib.sha256(self.source.encode()).hexdigest()
        self.pages["/essays/fixture/"] = self.pages["/essays/fixture/"].replace("https://example.org/photo", rendered)
        self.verify()

    def test_caption_link_matching_keeps_other_url_parts_exact(self):
        original = "https://example.org/photo_(2022).jpg?source=(archive)#credit"
        rendered = "https://example.org/photo_%282022%29.jpg?source=(archive)#credit"
        self.source = self.source.replace("https://example.org/photo", original)
        self.release["sourceSha256"] = hashlib.sha256(self.source.encode()).hexdigest()
        article = self.pages["/essays/fixture/"]
        for changed in [rendered.replace("example.org", "wrong.example"),
                        rendered.replace("2022", "2023"),
                        rendered.replace("%28", "%2528"),
                        rendered.replace("source=(archive)", "source=%28archive%29"),
                        rendered.replace("#credit", "#different"),
                        rendered.replace("photo_", "photo%2F")]:
            with self.subTest(href=changed):
                self.pages["/essays/fixture/"] = article.replace("https://example.org/photo", changed)
                with self.assertRaisesRegex(ValueError, "credit links differ"):
                    self.verify()
        self.pages["/essays/fixture/"] = article.replace("https://example.org/photo", rendered)
        self.verify()

    def test_missing_collection_gallery_or_series_fails(self):
        for path, html, message in [("/collections/brands-business-consumer-choice/", "", "collection"), ("/gallery/", "", "Gallery"), ("/essays/first/", self.nav([]), "Series")]:
            with self.subTest(path=path):
                saved = self.pages[path]
                self.pages[path] = html
                with self.assertRaisesRegex(ValueError, message):
                    self.verify()
                self.pages[path] = saved

    def test_series_order_is_not_just_link_presence(self):
        self.release["seriesPart"] = 3
        self.config["seriesRoutes"].insert(1, "/essays/second/")
        self.pages["/essays/fixture/"] = self.pages["/essays/fixture/"].replace(self.nav(["/essays/first/"]), self.nav(["/essays/second/", "/essays/first/"]))
        self.pages["/essays/first/"] = self.nav(["/essays/second/", "/essays/fixture/"])
        self.pages["/essays/second/"] = self.nav(["/essays/first/", "/essays/fixture/"])
        with self.assertRaisesRegex(ValueError, "numerical order"):
            self.verify()

    def test_different_latest_requires_a_published_newer_article(self):
        self.pages["/"] = self.pages["/"].replace("/essays/fixture/", "/essays/newer/")
        self.pages["/essays/newer/"] = '<meta property="article:published_time" content="2026-10-25T13:00:20Z">'
        self.verify()
        self.pages["/essays/newer/"] = '<meta property="article:published_time" content="2026-10-24T13:00:00Z">'
        with self.assertRaisesRegex(ValueError, "no newer publication"):
            self.verify()

    def test_image_fetch_failure_blocks_success(self):
        original_fetch = self.fetch
        def missing(path, image=False):
            if image:
                raise ValueError("Image HTTP 404")
            return original_fetch(path, image)
        self.fetch = missing
        with self.assertRaisesRegex(ValueError, "404"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
