"""Verify the two authorized Disney releases using the existing deployment receipt."""
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

BASE = "https://outsideinprint.org"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
BLOCK = {"article", "aside", "blockquote", "div", "figure", "figcaption", "footer", "h1", "h2", "h3", "header", "li", "main", "nav", "ol", "p", "section", "ul"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def normalized(value):
    value = re.sub(r"\s+", " ", unescape(value).replace("\u2019", "'").replace("\u00a0", " ")).strip()
    return re.sub(r"\s+([,.;:!?])", r"\1", value)


class Element:
    def __init__(self, tag="root", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []
        self.parent = None

    def find(self, tag=None, cls=None, **attrs):
        result = []
        for child in self.children:
            if isinstance(child, Element):
                if ((tag is None or child.tag == tag)
                    and (cls is None or cls in child.attrs.get("class", "").split())
                    and all(child.attrs.get(key) == value for key, value in attrs.items())):
                    result.append(child)
                result.extend(child.find(tag, cls, **attrs))
        return result

    def text(self):
        return "".join(child if isinstance(child, str) else
                       (" " + child.text() + " " if child.tag in BLOCK else child.text())
                       for child in self.children if not isinstance(child, Element) or child.tag not in {"script", "style"})


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        # Hugo's minifier omits optional paragraph/list-item end tags.
        if tag in BLOCK and any(item.tag == "p" for item in self.stack):
            self.handle_endtag("p")
        if tag == "li" and any(item.tag == "li" for item in self.stack):
            self.handle_endtag("li")
        node = Element(tag, attrs)
        node.parent = self.stack[-1]
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def route(value):
    parsed = urlsplit(urljoin(BASE, value))
    require(parsed.scheme == "https" and parsed.netloc == "outsideinprint.org", "Expected a canonical-host URL: " + value)
    return parsed.path


def links(node):
    return [item.attrs.get("href", "") for item in node.find("a")]


def caption_link_key(value):
    # Hugo escapes path parentheses; preserve every other encoded path byte,
    # the credit's host, query and fragment instead of broadly unquoting URLs.
    parts = urlsplit(value)
    return parts._replace(path=parts.path.replace("(", "%28").replace(")", "%29")).geturl()


def internal_links(node):
    return [urlsplit(urljoin(BASE, value)).path for value in links(node)
            if urlsplit(urljoin(BASE, value)).netloc == "outsideinprint.org"]


def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class Fetcher:
    """Read each canonical URL once; no retries or publication side effects."""
    def __init__(self):
        self.cache = {}

    def __call__(self, value, image=False):
        url = urljoin(BASE, value)
        route(url)
        key = (url, image)
        if key not in self.cache:
            request = Request(url, method="HEAD" if image else "GET", headers={"User-Agent": "OIP-scheduled-release-verification", "Cache-Control": "no-cache"})
            with urlopen(request, timeout=20) as response:
                require(response.status == 200, "Unexpected HTTP status: " + url)
                route(response.url)
                mime = response.headers.get_content_type()
                require(mime.startswith("image/") if image else mime == "text/html", "Unexpected content type: " + url)
                content = b"" if image else response.read(5_000_001)
                require(len(content) <= 5_000_000, "HTML response exceeds verification limit: " + url)
                self.cache[key] = content.decode("utf-8")
        return self.cache[key]


LINK = re.compile(r"\[([^\]]+)\]\((https?://(?:[^()\s]|\([^()\s]*\))+)\)")


def source_captions(source):
    captions = {}
    for image_id, markdown in re.findall(r"!\[[^\n]*\]\(oip-image:([^)]+)\)\s*\n\s*\n\*([^\n]+)\*", source):
        hrefs = [match[1] for match in LINK.findall(markdown)]
        plain = LINK.sub(lambda match: match[1], markdown).replace("*", "").replace("`", "")
        captions[image_id] = (normalized(plain), hrefs)
    return captions


def verify_release(release, config, receipt, fetch, source, expected_sha, expected_generated_at):
    require(receipt.get("expectedSha") == expected_sha and receipt.get("expectedGeneratedAt") == expected_generated_at,
            "Existing deployment receipt has a different expected identity")
    observed = receipt.get("observed", {})
    require(not receipt.get("error") and observed.get("commitSha") == expected_sha and observed.get("generatedAtUtc") == expected_generated_at,
            "Existing deployment receipt does not verify this exact build")
    build_clock = instant(observed["buildClockUtc"])
    require(instant(release["releaseAt"]) <= build_clock < instant(release["endsAt"]), "Build is outside this release window")
    require(hashlib.sha256(source.encode("utf-8")).hexdigest() == release["sourceSha256"], "Release source changed after scheduling")

    pages = {}
    def page(path):
        path = route(path)
        if path not in pages:
            pages[path] = Document(fetch(path)).root
        return pages[path]

    article_route = "/essays/" + release["slug"] + "/"
    article = page(article_route)
    titles = article.find("h1")
    require(len(titles) == 1 and normalized(titles[0].text()) == normalized(release["title"]), "Article title differs")
    bylines = article.find(cls="piece-byline")
    require(len(bylines) == 1 and "Robert V. Ussley" in normalized(bylines[0].text()), "Article byline differs")
    bodies = article.find(cls="piece-body")
    require(len(bodies) == 1, "Article body is missing")
    body = bodies[0]
    require(normalized(release["opening"]) in normalized(body.text()), "Article opening is missing")
    require(normalized(body.text()).endswith(normalized(release["ending"])), "Article ending differs")

    expected_images = release["images"]
    pictures = article.find("picture", **{"data-oip-image-id": expected_images[0]["id"]})
    body_pictures = body.find("picture")
    require(len(pictures) == 1 and [item.attrs.get("data-oip-image-id") for item in body_pictures] == [item["id"] for item in expected_images[1:]], "Article managed images differ or are out of order")
    figures = article.find("figure")
    captions = source_captions(source)
    alt_text = {image_id: text for text, image_id in re.findall(r"!\[([^\n]*)\]\(oip-image:([^)]+)\)", source)}
    hero_alt = re.search(r'^featured_image_alt:\s*(".*")\s*$', source, re.MULTILINE)
    require(hero_alt is not None, "Source hero alt text missing")
    alt_text[expected_images[0]["id"]] = json.loads(hero_alt[1])
    checked_images = set()
    for expected, picture in zip(expected_images, pictures + body_pictures):
        imgs = picture.find("img")
        require(len(imgs) == 1, "Managed picture must contain one image")
        img = imgs[0]
        width, height = int(img.attrs.get("width", "0")), int(img.attrs.get("height", "0"))
        require(0 < width <= min(1600, expected["width"]) and 0 < height <= expected["height"], "Derivative exceeds source or rendering bounds: " + expected["id"])
        require(abs(height - width * expected["height"] / expected["width"]) <= 1.1, "Derivative aspect ratio differs: " + expected["id"])
        require(bool(img.attrs.get("alt", "").strip()) and normalized(img.attrs["alt"]) == normalized(alt_text.get(expected["id"], "")), "Image alt text differs")
        urls = {img.attrs.get("src", ""), img.attrs.get("data-lightbox-src", "")}
        avif_candidates = []
        for source_node in picture.find("source") + [img]:
            for candidate in source_node.attrs.get("srcset", "").split(","):
                if candidate.strip():
                    parts = candidate.strip().split()
                    require(len(parts) == 2 and parts[1].endswith("w") and 0 < int(parts[1][:-1]) <= min(1600, expected["width"]), "Invalid or oversized responsive derivative")
                    if source_node.attrs.get("type") == "image/avif":
                        avif_candidates.append((int(parts[1][:-1]), parts[0]))
        if avif_candidates:
            urls.add(max(avif_candidates)[1])
        require(img.attrs.get("src") and img.attrs.get("data-lightbox-src"), "Image display or lightbox URL missing")
        for url in sorted(urls - {""}):
            if url not in checked_images:
                fetch(url, image=True)
                checked_images.add(url)
        if expected is expected_images[0]:
            containing = [figure for figure in figures if picture in figure.find("picture")]
            require(len(containing) == 1, "Hero figure is missing or ambiguous")
            figcaptions = containing[0].find("figcaption")
            require(len(figcaptions) == 1, "Hero caption is missing")
            actual_caption = normalized(figcaptions[0].text())
            require(normalized(release["heroCaption"]) in actual_caption, "Hero caption differs")
        else:
            # Native Markdown retains the credit in the paragraph immediately
            # following the image paragraph (legacy Medium imports use figures).
            image_paragraph = picture.parent
            require(image_paragraph.tag == "p", "Body image paragraph missing")
            siblings = [child for child in image_paragraph.parent.children if isinstance(child, Element)]
            index = siblings.index(image_paragraph) + 1
            require(index < len(siblings) and siblings[index].tag == "p" and siblings[index].find("em"), "Body image credit paragraph missing")
            caption_node = siblings[index]
            actual_caption = normalized(caption_node.text())
            require(expected["id"] in captions, "Source caption missing: " + expected["id"])
            text, hrefs = captions[expected["id"]]
            actual_hrefs = {caption_link_key(href) for href in links(caption_node)}
            require(text == actual_caption and all(caption_link_key(href) in actual_hrefs for href in hrefs), "Body caption or credit links differ: " + expected["id"])

    for name, attribute in [("og:image", "property"), ("twitter:image", "name")]:
        meta = article.find("meta", **{attribute: name})
        require(len(meta) == 1 and meta[0].attrs.get("content"), "Social image is missing: " + name)
        url = meta[0].attrs["content"]
        if url not in checked_images:
            fetch(url, image=True)
            checked_images.add(url)
    social_width = article.find("meta", property="og:image:width")
    social_height = article.find("meta", property="og:image:height")
    require(len(social_width) == 1 and len(social_height) == 1, "Social image dimensions missing")
    width, height = int(social_width[0].attrs["content"]), int(social_height[0].attrs["content"])
    hero = expected_images[0]
    require(0 < width <= min(1200, hero["width"]) and 0 < height <= hero["height"] and abs(height - width * hero["height"] / hero["width"]) <= 1.1, "Social image dimensions exceed bounds or change aspect ratio")

    collection_route = config.get("collection", "/collections/brands-business-consumer-choice/")
    require(article_route in internal_links(page(collection_route)), "Article missing from collection")
    gallery = page("/gallery/")
    entries = gallery.find(cls="cartoon-gallery-spotlight") + gallery.find(cls="cartoon-gallery__item")
    matching = [entry for entry in entries if article_route in internal_links(entry)]
    require(len(matching) == 1 and normalized(release["heroTitle"]) in normalized(matching[0].text()), "Gallery article/title association differs")
    require(bool(matching[0].find("picture", **{"data-oip-image-id": expected_images[0]["id"]})), "Gallery hero differs")

    home = page("/")
    leads = home.find(cls="home-v2-featured__lead")
    require(len(leads) == 1 and config["flagship"] in internal_links(leads[0]), "Homepage flagship differs")
    latest = home.find(cls="home-v2-featured__item--latest")
    require(len(latest) == 1, "Homepage newest supporting item missing")
    if article_route not in internal_links(latest[0]):
        # A separately authorized newer publication may legitimately take this slot.
        candidate = latest[0].find("a", cls="reading-card__link")
        require(len(candidate) == 1, "Homepage newest article link missing")
        newer = page(candidate[0].attrs["href"])
        published = newer.find("meta", property="article:published_time")
        require(len(published) == 1 and instant(release["releaseAt"]) < instant(published[0].attrs["content"]) <= build_clock,
                "Homepage failed to promote release and has no newer publication")

    eligible = config["seriesRoutes"][:release["seriesPart"]]
    for member in eligible:
        navs = page(member).find("nav", **{"data-article-series": "disney-world-development"})
        require(len(navs) == 1 and internal_links(navs[0]) == [path for path in eligible if path != member], "Series links differ or are out of numerical order: " + member)
    return {"article": article_route, "checkedPages": list(pages), "checkedImageUrls": sorted(checked_images), "buildClockUtc": observed["buildClockUtc"]}


def main():
    report = {"schemaVersion": 1, "slug": os.environ.get("OIP_RELEASE_SLUG"),
              "checkedAtUtc": datetime.now(timezone.utc).isoformat(),
              "runUrl": "https://github.com/" + os.environ.get("GITHUB_REPOSITORY", "") + "/actions/runs/" + os.environ.get("GITHUB_RUN_ID", ""),
              "commitSha": os.environ.get("OIP_EXPECTED_SHA"), "generatedAtUtc": os.environ.get("OIP_EXPECTED_GENERATED_AT"), "status": "failed"}
    path = Path(".deploy-reports/scheduled-release.json")
    try:
        config = json.loads(Path("scripts/ci/disney-releases.json").read_text(encoding="utf-8"))
        release = next(item for item in config["releases"] if item["slug"] == report["slug"])
        source = Path(release["sourcePath"]).read_bytes().decode("utf-8")
        receipt = json.loads(Path(".deploy-reports/live-manifest.json").read_text(encoding="utf-8"))
        report.update(verify_release(release, config, receipt, Fetcher(), source, report["commitSha"], report["generatedAtUtc"]))
        report["status"] = "passed"
    except Exception as error:
        report["error"] = str(error)
    finally:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
