"""Bounded, registry-driven live checks using the existing deployment receipt.

The classifier verifies queued source/artwork bindings before the build. This
verifier consumes that build's exact canonical receipt and never polls, rebuilds,
or fetches the manifest again. Fetching is injectable for offline fixtures.
"""
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree

# The older verifier owns these standard-library HTML/HTTP helpers. Its release
# policy stays unchanged; no author, collection, or series rules are imported.
_SPEC = importlib.util.spec_from_file_location(
    "_oip_release_html", Path(__file__).with_name("verify_disney_release.py"))
_HTML = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_HTML)
BASE, Document = _HTML.BASE, _HTML.Document
instant, normalized, require, route = _HTML.instant, _HTML.normalized, _HTML.require, _HTML.route

MAX_RELEASES = 64
MAX_CHECKS = 32
MAX_IMAGES = 64
MAX_REQUESTS = 256


class Fetcher(_HTML.Fetcher):
    """Add bounded XML reads without changing the older HTML/image verifier."""
    def __call__(self, value, image=False, format="html"):
        require(format in {"html", "xml"}, "Unsupported verification document format")
        if format == "html":
            return super().__call__(value, image=image)
        require(not image, "XML checks cannot fetch images")
        url = urljoin(BASE, value)
        route(url)
        key = (url, "xml")
        if key not in self.cache:
            request = Request(url, headers={"User-Agent": "OIP-scheduled-release-verification",
                                            "Cache-Control": "no-cache"})
            with urlopen(request, timeout=20) as response:
                require(response.status == 200, "Unexpected HTTP status: " + url)
                route(response.url)
                require(response.headers.get_content_type() in
                        {"application/xml", "text/xml", "application/rss+xml", "application/atom+xml"},
                        "Unexpected XML content type: " + url)
                content = response.read(5_000_001)
                require(len(content) <= 5_000_000, "XML response exceeds verification limit: " + url)
                self.cache[key] = content.decode("utf-8")
        return self.cache[key]


def timestamp(value):
    parsed = instant(value)
    require(parsed.tzinfo is not None and parsed.utcoffset() is not None,
            "Release and build timestamps must include an offset")
    return parsed


def page_route(value):
    require(isinstance(value, str) and value, "Check route is missing")
    parsed = urlsplit(value)
    require(not parsed.query and not parsed.fragment, "Check routes cannot contain a query or fragment")
    return route(value)


class VerificationSession:
    """Cache successes and failures across entries, with a fixed request budget."""
    def __init__(self, fetch):
        self.fetch, self.cache, self.pages = fetch, {}, {}

    def read(self, value, report, image=False, format="html"):
        url = urljoin(BASE + "/", value)
        route(url)
        require(not urlsplit(url).fragment, "Fetched URL cannot contain a fragment: " + url)
        key = (url, image, format)
        if url not in report["attemptedUrls"]:
            report["attemptedUrls"].append(url)
        if key not in self.cache:
            require(len(self.cache) < MAX_REQUESTS, "Scheduled verification request budget exceeded")
            try:
                value = self.fetch(url, format="xml") if format == "xml" else self.fetch(url, image=image)
                self.cache[key] = (True, value)
            except Exception as error:
                self.cache[key] = (False, str(error))
        success, value = self.cache[key]
        require(success, "Fetch failed for " + url + ": " + str(value))
        if url not in report["verifiedUrls"]:
            report["verifiedUrls"].append(url)
        if image and url not in report["checkedImageUrls"]:
            report["checkedImageUrls"].append(url)
        return value

    def page(self, value, report, format="html"):
        path = page_route(value)
        content = self.read(path, report, format=format)
        key = (path, format)
        if key not in self.pages:
            self.pages[key] = ElementTree.fromstring(content) if format == "xml" else Document(content).root
        if path not in report["checkedPages"]:
            report["checkedPages"].append(path)
        return self.pages[key]


def verify_receipt(receipt, expected_sha, expected_generated_at):
    require(bool(expected_sha) and bool(expected_generated_at), "Expected build identity is missing")
    require(receipt.get("expectedSha") == expected_sha
            and receipt.get("expectedGeneratedAt") == expected_generated_at,
            "Existing deployment receipt has a different expected identity")
    observed = receipt.get("observed", {})
    require(not receipt.get("error") and observed.get("commitSha") == expected_sha
            and observed.get("generatedAtUtc") == expected_generated_at,
            "Existing deployment receipt does not verify this exact build")
    return timestamp(observed["buildClockUtc"])


def verify_picture(picture, expected, page_path, session, report):
    image_id = expected["id"]
    imgs = picture.find("img")
    require(len(imgs) == 1, "Managed picture must contain one image: " + image_id)
    img = imgs[0]
    width, height = int(img.attrs.get("width", "0")), int(img.attrs.get("height", "0"))
    require(0 < width <= min(1600, expected["width"]) and 0 < height <= expected["height"],
            "Derivative exceeds source or rendering bounds: " + image_id)
    require(abs(height - width * expected["height"] / expected["width"]) <= 1.1,
            "Derivative aspect ratio differs: " + image_id)
    require(bool(img.attrs.get("alt", "").strip()), "Image alt text is empty: " + image_id)
    require(bool(img.attrs.get("src")), "Image fallback URL missing: " + image_id)
    urls = {img.attrs["src"]}
    # Cards intentionally have no lightbox. If supplied, its URL and dimensions
    # belong to the same bounded managed-image contract as the display image.
    if "data-lightbox-src" in img.attrs:
        require(bool(img.attrs["data-lightbox-src"]), "Image lightbox URL is empty: " + image_id)
        urls.add(img.attrs["data-lightbox-src"])
        if "data-lightbox-width" in img.attrs or "data-lightbox-height" in img.attrs:
            light_width = int(img.attrs.get("data-lightbox-width", "0"))
            light_height = int(img.attrs.get("data-lightbox-height", "0"))
            require(0 < light_width <= min(1600, expected["width"])
                    and 0 < light_height <= expected["height"]
                    and abs(light_height - light_width * expected["height"] / expected["width"]) <= 1.1,
                    "Lightbox dimensions exceed source or rendering bounds: " + image_id)
    avif = []
    for node in picture.find("source") + [img]:
        candidates = node.attrs.get("srcset", "").split(",")
        require(len(candidates) <= MAX_IMAGES, "Too many responsive candidates: " + image_id)
        for candidate in candidates:
            if not candidate.strip():
                continue
            parts = candidate.strip().split()
            require(len(parts) == 2 and re.fullmatch(r"[1-9][0-9]*w", parts[1]),
                    "Invalid responsive derivative: " + image_id)
            candidate_width = int(parts[1][:-1])
            require(candidate_width <= min(1600, expected["width"]),
                    "Responsive derivative exceeds source or rendering bounds: " + image_id)
            route(urljoin(BASE + page_path, parts[0]))
            if node.attrs.get("type") == "image/avif":
                avif.append((candidate_width, parts[0]))
    require(bool(avif), "Managed image AVIF source missing: " + image_id)
    urls.add(max(avif)[1])
    for url in sorted(urls):
        session.read(urljoin(BASE + page_path, url), report, image=True)


def verify_optional_social(page, page_path, session, report):
    reading_page = (page.find(cls="piece-body")
                    or page.find("meta", property="og:type", content="article")
                    or page.find("meta", property="article:published_time"))
    og = page.find("meta", property="og:image")
    if not reading_page or not og:
        return
    require(len(og) == 1 and og[0].attrs.get("content"), "Social image URL missing or ambiguous")
    widths = page.find("meta", property="og:image:width")
    heights = page.find("meta", property="og:image:height")
    require(len(widths) == 1 and len(heights) == 1, "Social image dimensions missing")
    require(0 < int(widths[0].attrs.get("content", "0")) <= 1200
            and int(heights[0].attrs.get("content", "0")) > 0,
            "Social image dimensions exceed rendering bounds")
    session.read(urljoin(BASE + page_path, og[0].attrs["content"]), report, image=True)
    twitter = page.find("meta", name="twitter:image")
    if twitter:
        require(len(twitter) == 1 and twitter[0].attrs.get("content"), "Twitter image URL missing or ambiguous")
        session.read(urljoin(BASE + page_path, twitter[0].attrs["content"]), report, image=True)


def _verify_release(release, receipt, session, expected_sha, expected_generated_at, report, source_reader):
    build_clock = verify_receipt(receipt, expected_sha, expected_generated_at)
    require(timestamp(release["releaseAt"]) <= build_clock < timestamp(release["endsAt"]),
            "Build is outside this release window")
    primary = page_route(release["route"])
    checks, images = release.get("checks", []), release.get("images", [])
    require(isinstance(checks, list) and 0 < len(checks) <= MAX_CHECKS, "Release checks are missing or exceed the limit")
    require(isinstance(images, list) and len(images) <= MAX_IMAGES, "Release images exceed the limit")
    primary_checks = [check for check in checks if page_route(check["route"]) == primary]
    require(any(check.get("title") or check.get("containsText") for check in primary_checks),
            "Primary route needs a check with identifying title or text")
    image_map = {}
    for image in images:
        require(image["id"] not in image_map, "Duplicate managed image ID: " + image["id"])
        require(type(image["width"]) is int and type(image["height"]) is int
                and image["width"] > 0 and image["height"] > 0, "Invalid native image dimensions")
        image_map[image["id"]] = image
    for binding in report["bindings"]:
        binding["verification"] = "classifier-before-build"
        if binding["kind"] == "file" and source_reader is not None:
            source = source_reader(binding["path"])
            require(hashlib.sha256(source).hexdigest() == binding["sha256"],
                    "Release source changed after scheduling: " + binding["path"])
            binding["verification"] = "git-HEAD-sha256"
    for check in checks:
        path = page_route(check["route"])
        format = check.get("format", "html")
        require(format in {"html", "xml"}, "Unsupported verification document format: " + str(format))
        if format == "xml":
            require(bool(check.get("containsText")) and not check.get("title")
                    and not check.get("links") and not check.get("imageIds") and not check.get("imageUrls"),
                    "XML checks require containsText and cannot declare title, links, or images")
            xml = session.page(path, report, format="xml")
            text = normalized(" ".join(xml.itertext()))
            for expected in check["containsText"]:
                require(bool(normalized(expected)) and normalized(expected) in text,
                        "Required text is missing on " + path + ": " + expected)
            continue
        page = session.page(path, report)
        if check.get("title"):
            titles = page.find("h1")
            require(len(titles) == 1 and normalized(titles[0].text()) == normalized(check["title"]),
                    "Page title differs: " + path)
        text = normalized(page.text())
        for expected in check.get("containsText", []):
            require(bool(normalized(expected)) and normalized(expected) in text,
                    "Required text is missing on " + path + ": " + expected)
        hrefs = {urljoin(BASE + path, node.attrs.get("href", "")) for node in page.find("a")}
        for expected in check.get("links", []):
            require(urljoin(BASE + path, expected) in hrefs,
                    "Required link is missing on " + path + ": " + expected)
        for image_id in check.get("imageIds", []):
            require(image_id in image_map, "Check references an undeclared image: " + image_id)
            pictures = page.find("picture", **{"data-oip-image-id": image_id})
            require(bool(pictures), "Managed image is missing on " + path + ": " + image_id)
            for picture in pictures:
                verify_picture(picture, image_map[image_id], path, session, report)
        image_sources = {urljoin(BASE + path, node.attrs["src"])
                         for node in page.find("img") if node.attrs.get("src")}
        for expected in check.get("imageUrls", []):
            url = urljoin(BASE + path, expected)
            route(url)
            require(url in image_sources, "Declared image URL is missing on " + path + ": " + expected)
            session.read(url, report, image=True)
        if path == primary:
            verify_optional_social(page, path, session, report)


def verify_releases(config, release_ids, receipt, fetch, expected_sha, expected_generated_at,
                    source_reader=None, now=None, run_url=""):
    """Return aggregate evidence; one failed entry never skips other entries."""
    clock = now if callable(now) else lambda: now or datetime.now(timezone.utc)
    def checked_at():
        return clock().astimezone(timezone.utc).isoformat()

    observed = receipt.get("observed") or {}
    identity = {key: observed.get(key) for key in ("commitSha", "generatedAtUtc", "buildClockUtc")}
    report = {"schemaVersion": 1, "checkedAtUtc": checked_at(), "runUrl": run_url,
              "commitSha": expected_sha, "generatedAtUtc": expected_generated_at,
              "observedBuildIdentity": identity, "status": "failed", "releases": []}
    try:
        require(config.get("schemaVersion") == 1 and isinstance(config.get("releases"), list),
                "Unsupported scheduled-release registry")
        require(isinstance(release_ids, list) and 0 < len(release_ids) <= MAX_RELEASES
                and all(isinstance(value, str) and value for value in release_ids),
                "OIP_RELEASE_IDS must be a nonempty bounded JSON array of IDs")
        require(len(set(release_ids)) == len(release_ids), "Duplicate requested release IDs")
        releases = {release["id"]: release for release in config["releases"]}
        require(len(releases) == len(config["releases"]), "Duplicate registry release IDs")
        session = VerificationSession(fetch)
        for release_id in release_ids:
            release = releases.get(release_id)
            result = {"id": release_id, "checkedAtUtc": checked_at(), "runUrl": run_url,
                      "commitSha": expected_sha, "generatedAtUtc": expected_generated_at,
                      "buildClockUtc": identity["buildClockUtc"], "status": "failed",
                      "bindings": [], "checkedPages": [], "checkedImageUrls": [],
                      "attemptedUrls": [], "verifiedUrls": []}
            report["releases"].append(result)
            try:
                require(release is not None, "Requested release ID is absent from the registry")
                result.update({key: release.get(key) for key in ("route", "releaseAt", "endsAt", "queuedCommit")})
                result["bindings"] = [dict(binding) for binding in release.get("bindings", [])]
                result["images"] = release.get("images", [])
                _verify_release(release, receipt, session, expected_sha, expected_generated_at, result, source_reader)
                result["status"] = "passed"
            except Exception as error:
                result["error"] = str(error)
        if all(entry["status"] == "passed" for entry in report["releases"]):
            report["status"] = "passed"
    except Exception as error:
        report["error"] = str(error)
    return report


@lru_cache(maxsize=MAX_RELEASES * MAX_CHECKS)
def read_head_source(path):
    require(isinstance(path, str) and path and not path.startswith(("/", "\\"))
            and ".." not in path.split("/") and "\\" not in path and ":" not in path,
            "Source binding must use a repository-relative path")
    return subprocess.run(["git", "show", "HEAD:" + path], check=True, capture_output=True).stdout


def main():
    run_url = ("https://github.com/" + os.environ.get("GITHUB_REPOSITORY", "")
               + "/actions/runs/" + os.environ.get("GITHUB_RUN_ID", ""))
    expected_sha = os.environ.get("OIP_EXPECTED_SHA")
    expected_generated_at = os.environ.get("OIP_EXPECTED_GENERATED_AT")
    try:
        config = json.loads(Path("scripts/ci/scheduled-releases.json").read_text(encoding="utf-8"))
        receipt = json.loads(Path(".deploy-reports/live-manifest.json").read_text(encoding="utf-8"))
        release_ids = json.loads(os.environ.get("OIP_RELEASE_IDS", "null"))
        report = verify_releases(config, release_ids, receipt, Fetcher(), expected_sha,
                                 expected_generated_at, source_reader=read_head_source, run_url=run_url)
    except Exception as error:
        report = {"schemaVersion": 1, "status": "failed", "error": str(error), "releases": [],
                  "checkedAtUtc": datetime.now(timezone.utc).isoformat(), "runUrl": run_url,
                  "commitSha": expected_sha, "generatedAtUtc": expected_generated_at}
    path = Path(".deploy-reports/scheduled-releases.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
