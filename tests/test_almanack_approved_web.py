"""Source-bound web fragment admission, real Hugo stale gates and legacy parity."""
import base64
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
STAGE=runpy.run_path(str(ROOT/"scripts/stage_almanack_web.py"))
PINNED=Path.home()/"Documents/30_Resources/toolchains/hugo/0.167.0/hugo.exe"
HUGO=Path(os.environ.get("OIP_HUGO_BIN") or (str(PINNED) if PINNED.is_file() else shutil.which("hugo")) or PINNED)
PNG=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=")


def package(path,managed=False):
    path.mkdir()
    url="https://outsideinprint.org/images/almanack/2026-10-31/"
    source=('---\ntitle: Fixture Almanack\ndate: 2026-10-31\ndraft: true\nurl: /almanack/2026-10-31/\nissue_number: 26\neditorial_contract: almanack-v1\nalmanack_layout: alternating-margins-v1\nemail_masthead:\n  image_url: '+url+'paper-masthead.png\n  image_alt: Full approved paper masthead\nbob_ornaments:\n  masthead:\n    image_url: '+url+'bob.png\n---\nProtected source body.\n').encode()
    if managed:
        source=source.replace(b"---\nProtected source body.",b"essays:\n  - title: Fixture article\n    url: https://outsideinprint.org/essays/fixture/\n    image: essays/fixture/hero\n    email_image: https://outsideinprint.org/images/rendered/essays/fixture/hero/test/social-1200w.jpg\n    image_alt: Exact complete fixture frame\n---\nProtected source body.")
    (path/"web-archive.md").write_bytes(source)
    content=STAGE["HELPER"]["parse_with_hugo"](source,HUGO)["params"]
    approved=('<html><head><style>body{color:#332a22}.demo-columns{display:grid}@media(max-width:980px){.demo-columns{display:block}}</style></head><body><header>Private draft controls</header><article id="issue"><header><img src="data:image/png;base64,'+base64.b64encode(PNG).decode()+'" data-source-src="'+url+'paper-masthead.png" data-source-sha256="test" alt="Full approved paper masthead"></header><p>Exact fixture copy.</p><a class="bob-ornament" href="https://example.org/steam"><img src="'+url+'bob.png" alt="Complete fixture pose"></a></article><script type="application/json">private receipt</script></body></html>').encode()
    if managed:approved=approved.replace(b"<p>Exact fixture copy.</p>",b'<a href="https://outsideinprint.org/essays/fixture/"><img src="https://outsideinprint.org/images/rendered/essays/fixture/hero/test/social-1200w.jpg" alt="Exact complete fixture frame" width="632" style="display:block;max-width:100%;height:auto;"></a><p>Exact fixture copy.</p>')
    (path/"full-issue.html").write_bytes(approved);(path/"email.html").write_bytes(b"Approved email.")
    meta={"source_sha256":STAGE["sha"](source),"issue_date":"2026-10-31","issue_number":26,"content":content}
    (path/"email.json").write_bytes(STAGE["dump"](meta))
    record={"source_sha256":STAGE["sha"](source),"html_sha256":STAGE["sha"](approved),"email_html_sha256":STAGE["sha"](b"Approved email."),"layout":"alternating-margins-v1","fidelity":{"status":"PASS"},"template_signature":"0"*64}
    (path/"full-issue.json").write_bytes(STAGE["dump"](record));(path/"paper-masthead.png").write_bytes(PNG)
    (path/"bob-poses").mkdir();(path/"bob-poses/bob.png").write_bytes(PNG)
    return source


def mini(root,template):
    (root/"layouts/_default").mkdir(parents=True);(root/"layouts/almanack").mkdir()
    shutil.copytree(ROOT/"layouts/partials",root/"layouts/partials")
    (root/"layouts/almanack/single.html").write_text(template,encoding="utf-8")
    (root/"layouts/_default/baseof.html").write_text('<html><body>{{ block "main" . }}{{ end }}</body></html>',encoding="utf-8")
    (root/"layouts/partials/article/share.html").write_text("",encoding="utf-8")
    (root/"layouts/partials/newsletter_signup.html").write_text('<div id="{{ .anchorID }}" data-source-slot="{{ .sourceSlot }}">Existing signup fixture</div>',encoding="utf-8")
    (root/"hugo.toml").write_text('baseURL="https://outsideinprint.org/"\ntimeZone="America/New_York"\ndisableKinds=["home","section","taxonomy","term","rss","sitemap"]\n[params.newsletter]\nprovider="disabled"\nbuttondown_username=""\n',encoding="utf-8")


def render(root):
    result=subprocess.run([str(HUGO),"--source",str(root),"--buildFuture","--panicOnWarning"],capture_output=True,text=True)
    if result.returncode:raise RuntimeError(result.stdout+result.stderr)
    return (root/"public/almanack/2026-10-31/index.html").read_bytes()


class ApprovedWebTests(unittest.TestCase):
    def test_native_picture_preserves_source_alt_and_original_display_width(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=package(root/"package",managed=True)
            payload,_=STAGE["prepare"](root/"package",STAGE["sha"](source),HUGO)
            site=root/"site";mini(site,(ROOT/"layouts/almanack/single.html").read_text())
            # The actual picture partial is retained. A deterministic model
            # keeps this admission fixture independent of the image library;
            # the real five-asset pipeline is separately rendered for release.
            (site/"layouts/partials/images/model.html").write_text('{{ return (dict "managed" true "id" .ref "signature_enabled" false "image_class" "essay_illustration" "review_state" "approved" "avif_srcset" "/native/1600w.avif 1600w" "webp_srcset" "/native/1600w.webp 1600w" "fallback_url" "/native/1600w.webp" "intrinsic_width" 1600 "intrinsic_height" 900) }}',encoding="utf-8")
            STAGE["HELPER"]["apply_payload"](payload,site)
            output=render(site)
            for expected in (b'<picture',b'type="image/avif"',b'type="image/webp"',b'src="/native/1600w.webp"',b'alt="Exact complete fixture frame"',b'width:632px;',b'loading="eager"',b'fetchpriority="high"'):self.assertIn(expected,output)
            self.assertNotIn(b'ALMANACK-MANAGED-IMAGE',output)
            manifest=site/"assets/almanack/2026-10-31/manifest.json";record=json.loads(manifest.read_text())
            record["managed_images"][0]["alt"]="Unapproved alternate text";manifest.write_text(json.dumps(record),encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError,"approved Almanack image binding"):render(site)

    def test_git_autocrlf_cannot_rewrite_bound_issue_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            subprocess.run(["git","-C",str(root),"init","-q"],check=True)
            subprocess.run(["git","-C",str(root),"config","core.autocrlf","true"],check=True)
            (root/".gitattributes").write_bytes(STAGE["bound_attributes"](b"/unrelated.md text eol=lf\n","2026-10-31"))
            for relative in ("content/almanack/2026-10-31.md","assets/almanack/2026-10-31/body.html","assets/almanack/2026-10-31/manifest.json",STAGE["CSS_PATH"]):
                target=root/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b"Preserved\r\nsource bytes\r\n")
                raw=subprocess.check_output(["git","-C",str(root),"hash-object","--no-filters",relative])
                filtered=subprocess.check_output(["git","-C",str(root),"hash-object",relative])
                self.assertEqual(raw,filtered)
            self.assertEqual(STAGE["bound_attributes"](b"/unrelated.md text eol=lf\n","2026-10-31").splitlines()[0],b"/unrelated.md text eol=lf")
    def test_admission_preserves_source_and_scopes_styles_without_review_leaks(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=package(root/"package")
            payload,receipt=STAGE["prepare"](root/"package",STAGE["sha"](source),HUGO)
            self.assertEqual(payload["content/almanack/2026-10-31.md"],source.replace(b"draft: true",b"draft: false",1))
            self.assertEqual((root/"package/web-archive.md").read_bytes(),source)
            fragment=payload["assets/almanack/2026-10-31/body.html"]
            self.assertIn(b'<h1 id="almanack-title"',fragment)
            self.assertIn(b"https://outsideinprint.org/images/almanack/2026-10-31/paper-masthead.png",fragment)
            for forbidden in (b"Private draft",b"private receipt",b"data:image",b"<script"):self.assertNotIn(forbidden,fragment)
            self.assertIn(b"#almanack-approved{color:",payload[STAGE["CSS_PATH"]])
            # Reused payload preflight must reject changed shared v1 CSS before writes.
            target=root/"target";(target/"assets/css").mkdir(parents=True)
            (target/STAGE["CSS_PATH"]).write_bytes(b"Different versioned CSS")
            with self.assertRaisesRegex(ValueError,"Existing staged file differs"):
                STAGE["HELPER"]["apply_payload"](payload,target)
            self.assertFalse((target/"content/almanack/2026-10-31.md").exists())

    def test_real_hugo_rejects_stale_source_fragment_and_unknown_version(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=package(root/"package")
            payload,_=STAGE["prepare"](root/"package",STAGE["sha"](source),HUGO)
            site=root/"site";mini(site,(ROOT/"layouts/almanack/single.html").read_text())
            STAGE["HELPER"]["apply_payload"](payload,site)
            rendered=render(site)
            self.assertIn(b"Exact fixture copy.",rendered)
            self.assertEqual(rendered.count(b'id="bobs-almanack-signup"'),1)
            self.assertIn(b'data-source-slot="almanack_issue_exit_newsletter"',rendered)
            content=site/"content/almanack/2026-10-31.md";original=content.read_bytes()
            content.write_bytes(original+b"Changed body.\n")
            with self.assertRaisesRegex(RuntimeError,"Stale approved Almanack"):render(site)
            content.write_bytes(original)
            fragment=site/"assets/almanack/2026-10-31/body.html";original_fragment=fragment.read_bytes()
            fragment.write_bytes(original_fragment+b"<p>Unexpected copy</p>")
            with self.assertRaisesRegex(RuntimeError,"Stale approved Almanack"):render(site)
            fragment.write_bytes(original_fragment)
            content.write_bytes(original.replace(b"alternating-margins-v1",b"unknown-version"))
            with self.assertRaisesRegex(RuntimeError,"Unsupported Almanack layout"):render(site)

    def test_no_field_historical_render_is_byte_identical(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            baseline=(ROOT/"tests/fixtures/almanack-legacy-web-single.html").read_text()
            mini(root,baseline)
            (root/"content/almanack").mkdir(parents=True)
            (root/"content/almanack/issue.md").write_text('---\ntitle: Historical fixture\ndate: 2026-10-31\ndraft: false\nurl: /almanack/2026-10-31/\nissue_number: 26\nopening_quote: Protected opening\nopening_quote_attribution: Robert\nmiddle_quote: Protected middle\nmiddle_quote_attribution: Poor Richard\nclosing_quote: Protected closing\nclosing_quote_attribution: Robert\nvirtue:\n  name: Attention\n  reflection: Exact prior reflection.\n---\n',encoding="utf-8")
            previous=render(root)
            (root/"layouts/almanack/single.html").write_text((ROOT/"layouts/almanack/single.html").read_text(),encoding="utf-8")
            self.assertEqual(render(root),previous)


if __name__=="__main__":unittest.main(verbosity=2)
