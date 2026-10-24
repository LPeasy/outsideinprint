"""Offline contract and failure fixtures for registry-driven live verification."""
import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

SPEC = importlib.util.spec_from_file_location(
    "verify_scheduled_releases", Path(__file__).resolve().parents[1] / "scripts/ci/verify_scheduled_releases.py")
verifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verifier)


class ScheduledReleaseVerification(unittest.TestCase):
    def setUp(self):
        self.source = b"---\ntitle: A Guest's Musing\n---\nKeep a little room.\n"
        self.sha = "a" * 40
        self.generated = "2026-10-25T13:05:00.1234567Z"
        self.receipt = {"expectedSha": self.sha, "expectedGeneratedAt": self.generated,
                        "observed": {"commitSha": self.sha, "generatedAtUtc": self.generated,
                                     "buildClockUtc": "2026-10-25T13:00:30Z"}}
        self.primary = "/musings/a-guests-musing/"
        self.image = {"id": "essays/musings/a-guests-musing/hero", "width": 1800,
                      "height": 1200, "sha256": "b" * 64}
        self.release = {
            "id": "guest-musing", "route": self.primary, "releaseAt": "2026-10-25T09:00:00-04:00",
            "endsAt": "2026-10-26T00:00:00-04:00", "queuedCommit": "c" * 40,
            "bindings": [{"kind": "file", "path": "content/essays/musings/guest.md",
                          "sha256": hashlib.sha256(self.source).hexdigest()}],
            "images": [self.image],
            "checks": [
                {"route": self.primary, "title": "A Guest's Musing",
                 "containsText": ["By Jane Doe", "Keep a little room."],
                 "links": ["https://example.org/guest#about"], "imageIds": [self.image["id"]]},
                {"route": "/collections/musings/", "links": [self.primary]},
                {"route": "/gallery/", "containsText": ["Room for Wonder"],
                 "links": [self.primary], "imageIds": [self.image["id"]]},
            ],
        }
        self.pages = {
            self.primary: '<h1>A Guest’s Musing</h1><p class="piece-byline">By <a>Jane Doe</a></p>'
                          '<div class="piece-body"><p>Keep a little room.</div>'
                          '<a href="https://example.org/guest#about">About Jane</a>' + self.picture(),
            "/collections/musings/": '<a href="https://outsideinprint.org' + self.primary + '">Musing</a>',
            "/gallery/": '<h1>Gallery</h1><h2>Room for Wonder</h2><a href="' + self.primary + '">Read</a>' + self.picture(),
        }
        self.calls = []
        self.source_calls = []

    def picture(self, lightbox=True):
        attributes = 'data-lightbox-src="/images/room-large.webp" data-lightbox-width="1500" data-lightbox-height="1000"' if lightbox else ""
        return ('<picture data-oip-image-id="' + self.image["id"] + '">'
                '<source type="image/avif" srcset="/images/room-small.avif 400w, /images/room-large.avif 1500w">'
                '<source type="image/webp" srcset="/images/room-small.webp 400w, /images/room-large.webp 1500w">'
                '<img src="/images/room.webp" srcset="/images/room-small.webp 400w, /images/room.webp 1200w" '
                'width="1200" height="800" alt="A quiet open doorway" ' + attributes + '></picture>')

    def fetch(self, url, image=False, format="html"):
        self.calls.append((url, image))
        return "" if image else self.pages[urlsplit(url).path]

    def source_reader(self, path):
        self.source_calls.append(path)
        return self.source

    def verify(self, releases=None, ids=None, fetch=None):
        releases = releases if releases is not None else [self.release]
        return verifier.verify_releases(
            {"schemaVersion": 1, "releases": releases}, ids if ids is not None else [item["id"] for item in releases],
            self.receipt, fetch or self.fetch, self.sha, self.generated, source_reader=self.source_reader,
            now=datetime(2026, 10, 25, 13, 8, tzinfo=timezone.utc), run_url="https://github.com/owner/repo/actions/runs/123")

    def test_guest_musing_uses_declared_text_and_existing_receipt(self):
        result = self.verify()
        self.assertEqual(result["status"], "passed", result)
        entry = result["releases"][0]
        self.assertEqual(entry["route"], self.primary)
        self.assertEqual(entry["checkedAtUtc"], "2026-10-25T13:08:00+00:00")
        self.assertEqual(entry["runUrl"], "https://github.com/owner/repo/actions/runs/123")
        self.assertEqual(entry["commitSha"], self.sha)
        self.assertEqual(entry["generatedAtUtc"], self.generated)
        self.assertEqual(entry["buildClockUtc"], "2026-10-25T13:00:30Z")
        self.assertEqual(entry["queuedCommit"], "c" * 40)
        self.assertEqual(entry["bindings"][0]["verification"], "git-HEAD-sha256")
        self.assertEqual(len(self.calls), len(set(self.calls)))
        self.assertEqual(len(entry["checkedImageUrls"]), 3)
        self.assertFalse(any("small" in url or "manifest" in url for url, _ in self.calls))
        self.assertEqual(set(entry["checkedPages"]), {self.primary, "/collections/musings/", "/gallery/"})

    def test_dialogue_route_and_byline_are_not_inferred(self):
        old_primary = self.primary
        self.primary = "/syd-and-oliver/a-doorway/"
        self.release["route"] = self.primary
        self.release["checks"] = [{"route": self.primary, "title": "A Guest's Musing", "containsText": ["Keep a little room."]}]
        self.pages[self.primary] = self.pages[old_primary].replace("Jane Doe", "Someone Else")
        self.assertEqual(self.verify()["status"], "passed")

    def test_gallery_only_release_needs_no_article_or_social_metadata(self):
        self.release.update({"id": "standalone-art", "route": "/gallery/",
                             "bindings": [{"kind": "gallery", "path": "data/editorial_cartoons.yaml",
                                           "slug": "room-for-wonder", "sha256": "d" * 64}],
                             "checks": [{"route": "/gallery/", "containsText": ["Room for Wonder"],
                                         "imageIds": [self.image["id"]]}]})
        result = self.verify()
        self.assertEqual(result["status"], "passed", result)
        self.assertEqual(result["releases"][0]["checkedPages"], ["/gallery/"])
        self.assertEqual(result["releases"][0]["bindings"][0]["verification"], "classifier-before-build")
        self.assertEqual(self.source_calls, [])

    def test_identity_and_release_window_fail_before_network(self):
        cases = [("generatedAtUtc", "2026-10-25T13:05:00.123456Z"), ("commitSha", "d" * 40),
                 ("buildClockUtc", "2026-10-25T12:59:59Z"), ("buildClockUtc", "2026-10-26T04:00:00Z"),
                 ("buildClockUtc", "2027-10-25T13:00:30Z"), ("buildClockUtc", "2026-10-25T13:00:30")]
        original = copy.deepcopy(self.receipt)
        for field, value in cases:
            with self.subTest(field=field, value=value):
                self.receipt = copy.deepcopy(original)
                self.receipt["observed"][field] = value
                self.assertEqual(self.verify()["status"], "failed")
                self.assertEqual(self.calls, [])
        self.receipt = original
        self.receipt["expectedGeneratedAt"] = "2026-10-25T13:05:00Z"
        self.assertIn("expected identity", self.verify()["releases"][0]["error"])
        self.assertEqual(self.calls, [])

    def test_failed_receipt_stops_even_when_identity_matches(self):
        self.receipt["error"] = "Canonical verification failed"
        self.assertEqual(self.verify()["status"], "failed")
        self.assertEqual(self.calls, [])

    def test_missing_text_links_images_and_exact_title_fail(self):
        original = self.pages[self.primary]
        for before, after, error in [
            ("Jane Doe", "Other Guest", "Required text"),
            ("guest#about", "guest#wrong", "Required link"),
            (self.image["id"], "other/image", "Managed image is missing"),
            ("A Guest’s Musing", "A Different Title", "Page title differs"),
        ]:
            with self.subTest(error=error):
                self.pages[self.primary] = original.replace(before, after)
                self.assertIn(error, self.verify()["releases"][0]["error"])

    def test_missing_primary_identification_fails_before_network(self):
        self.release["checks"] = [{"route": "/gallery/", "containsText": ["Room for Wonder"]}]
        self.assertIn("Primary route", self.verify()["releases"][0]["error"])
        self.assertEqual(self.calls, [])

    def test_source_binding_change_fails_before_network(self):
        self.source += b"Unapproved change."
        self.assertIn("source changed", self.verify()["releases"][0]["error"])
        self.assertEqual(self.calls, [])

    def test_failed_entry_does_not_skip_an_independent_entry(self):
        second = copy.deepcopy(self.release)
        second.update({"id": "other-release", "route": "/another-route/",
                       "checks": [{"route": "/another-route/", "containsText": ["Another release"]}]})
        self.pages["/another-route/"] = "<p>Another release</p>"
        self.pages[self.primary] = "<h1>Wrong title</h1>"
        result = self.verify([self.release, second])
        self.assertEqual(result["status"], "failed")
        self.assertEqual([entry["status"] for entry in result["releases"]], ["failed", "passed"])
        self.assertIn("https://outsideinprint.org/another-route/", result["releases"][1]["verifiedUrls"])

    def test_unknown_id_is_reported_without_suppressing_known_ids(self):
        result = self.verify(ids=["absent", self.release["id"]])
        self.assertEqual([entry["status"] for entry in result["releases"]], ["failed", "passed"])
        self.assertIn("absent from the registry", result["releases"][0]["error"])

    def test_image_bounds_alt_and_avif_are_checked(self):
        original = self.pages[self.primary]
        for before, after, error in [
            ('width="1200"', 'width="1700"', "bounds"),
            ('height="800"', 'height="900"', "aspect ratio"),
            ('alt="A quiet open doorway"', 'alt=" "', "alt text"),
            ('room-large.avif 1500w', 'room-large.avif 1800w', "bounds"),
            ('type="image/avif"', 'type="image/png"', "AVIF source"),
            ('data-lightbox-width="1500"', 'data-lightbox-width="1800"', "Lightbox dimensions"),
        ]:
            with self.subTest(error=error):
                self.pages[self.primary] = original.replace(before, after)
                self.assertIn(error, self.verify()["releases"][0]["error"])

    def test_collection_card_can_omit_lightbox(self):
        self.pages["/gallery/"] = self.pages["/gallery/"].replace(self.picture(), self.picture(lightbox=False))
        self.assertEqual(self.verify()["status"], "passed")

    def test_declared_static_artwork_requires_img_presence_and_successful_fetch(self):
        image_path = "/images/almanack/2026-10-25.webp"
        image_url = "https://outsideinprint.org" + image_path
        self.release["checks"][0]["imageUrls"] = [image_path]
        self.release["checks"][2]["imageUrls"] = [image_url]
        self.pages[self.primary] += '<img src="../../images/almanack/2026-10-25.webp" alt="Weekly illustration">'
        self.pages["/gallery/"] += '<img src="' + image_path + '" alt="Weekly illustration">'
        result = self.verify()
        self.assertEqual(result["status"], "passed", result)
        self.assertIn(image_url, result["releases"][0]["checkedImageUrls"])
        self.assertEqual(self.calls.count((image_url, True)), 1)
        original = self.pages[self.primary]
        self.pages[self.primary] = original.replace('src="../../images/almanack/2026-10-25.webp"',
                                                   'src="/images/other.webp"')
        missing = self.verify()
        self.assertIn("Declared image URL is missing", missing["releases"][0]["error"])
        self.pages[self.primary] = original
        def failed_image(url, image=False):
            if url == image_url and image:
                raise ValueError("Static artwork HTTP 404")
            return self.fetch(url, image=image)
        failed = self.verify(fetch=failed_image)
        self.assertIn("Static artwork HTTP 404", failed["releases"][0]["error"])
        self.assertIn(image_url, failed["releases"][0]["attemptedUrls"])
        self.assertNotIn(image_url, failed["releases"][0]["checkedImageUrls"])

    def test_cached_failure_does_not_refetch_for_other_entries(self):
        second = copy.deepcopy(self.release)
        second["id"] = "second-release"
        def missing(url, image=False):
            self.calls.append((url, image))
            if image:
                raise ValueError("Image HTTP 404")
            return self.pages[urlsplit(url).path]
        result = self.verify([self.release, second], fetch=missing)
        self.assertEqual([entry["status"] for entry in result["releases"]], ["failed", "failed"])
        self.assertTrue(all("404" in entry["error"] for entry in result["releases"]))
        self.assertEqual(len(self.calls), len(set(self.calls)))
        self.assertTrue(result["releases"][1]["attemptedUrls"])

    def test_optional_social_image_is_checked_once(self):
        self.pages[self.primary] += ('<meta property="og:image" content="/images/social.jpg">'
                                     '<meta property="og:image:width" content="1200">'
                                     '<meta property="og:image:height" content="800">'
                                     '<meta name="twitter:image" content="/images/social.jpg">')
        self.assertEqual(self.verify()["status"], "passed")
        self.assertEqual(self.calls.count(("https://outsideinprint.org/images/social.jpg", True)), 1)
        self.pages[self.primary] = self.pages[self.primary].replace('content="1200"', 'content="1600"')
        self.assertIn("Social image dimensions", self.verify()["releases"][0]["error"])

    def test_request_budget_fails_without_additional_network_calls(self):
        with patch.object(verifier, "MAX_REQUESTS", 1):
            result = self.verify()
        self.assertIn("request budget", result["releases"][0]["error"])
        self.assertEqual(len(self.calls), 1)

    def test_xml_rss_and_sitemap_use_declared_canonical_url_text(self):
        canonical = "https://outsideinprint.org" + self.primary
        self.release["checks"] += [
            {"route": "/index.xml", "format": "xml", "containsText": [canonical]},
            {"route": "/sitemap.xml", "format": "xml", "containsText": [canonical], "links": [], "imageIds": []},
        ]
        self.pages["/index.xml"] = '<rss><channel><item><title>Guest musing</title><link>' + canonical + '</link></item></channel></rss>'
        self.pages["/sitemap.xml"] = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + canonical + '</loc></url></urlset>'
        result = self.verify()
        self.assertEqual(result["status"], "passed", result)
        self.assertTrue({"/index.xml", "/sitemap.xml"}.issubset(result["releases"][0]["checkedPages"]))
        self.assertEqual(len(self.calls), len(set(self.calls)))
        for mime in ("application/rss+xml", "application/atom+xml", "application/xml", "text/xml"):
            with self.subTest(mime=mime), patch.object(verifier, "urlopen") as opening:
                response = opening.return_value.__enter__.return_value
                response.status, response.url = 200, "https://outsideinprint.org/index.xml"
                response.headers.get_content_type.return_value = mime
                response.read.return_value = self.pages["/index.xml"].encode()
                fetch = verifier.Fetcher()
                self.assertEqual(fetch("/index.xml", format="xml"), self.pages["/index.xml"])
                fetch("/index.xml", format="xml")
                self.assertEqual(opening.call_count, 1)

    def test_xml_missing_url_malformed_document_and_wrong_content_type_fail(self):
        self.release["checks"].append({"route": "/index.xml", "format": "xml",
                                      "containsText": ["https://outsideinprint.org" + self.primary]})
        self.pages["/index.xml"] = '<rss><channel><item><link>https://outsideinprint.org/old/</link></item></channel></rss>'
        self.assertIn("Required text is missing on /index.xml", self.verify()["releases"][0]["error"])
        self.pages["/index.xml"] = '<rss><channel><item>'
        self.assertEqual(self.verify()["status"], "failed")
        with patch.object(verifier, "urlopen") as opening:
            response = opening.return_value.__enter__.return_value
            response.status, response.url = 200, "https://outsideinprint.org/index.xml"
            response.headers.get_content_type.return_value = "text/html"
            with self.assertRaisesRegex(ValueError, "Unexpected XML content type"):
                verifier.Fetcher()("/index.xml", format="xml")

    def test_cli_uses_shared_env_names_and_writes_plural_receipt(self):
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts/ci").mkdir(parents=True)
            (root / ".deploy-reports").mkdir()
            (root / "scripts/ci/scheduled-releases.json").write_text(
                json.dumps({"schemaVersion": 1, "releases": [self.release]}), encoding="utf-8")
            (root / ".deploy-reports/live-manifest.json").write_text(json.dumps(self.receipt), encoding="utf-8")
            try:
                os.chdir(root)
                with patch.dict(os.environ, {"OIP_RELEASE_IDS": json.dumps([self.release["id"]]),
                                             "OIP_EXPECTED_SHA": self.sha,
                                             "OIP_EXPECTED_GENERATED_AT": self.generated}), \
                     patch.object(verifier, "Fetcher", return_value=self.fetch), \
                     patch.object(verifier, "read_head_source", self.source_reader), \
                     patch("builtins.print"):
                    self.assertEqual(verifier.main(), 0)
                report = json.loads((root / ".deploy-reports/scheduled-releases.json").read_text(encoding="utf-8"))
                self.assertEqual(report["status"], "passed")
                self.assertEqual(report["releases"][0]["id"], self.release["id"])
            finally:
                os.chdir(previous)


if __name__ == "__main__":
    unittest.main()
