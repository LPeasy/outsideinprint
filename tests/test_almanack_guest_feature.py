"""Check guest placement, canonical source identity, and historical render parity."""
import importlib.util
import json
import os
import runpy
import shutil
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISTRIBUTION = runpy.run_path(str(ROOT / 'scripts/render_almanack_distribution.py'))
HUGO = str(DISTRIBUTION['HUGO'])
GUEST = {'label': 'Our First Guest Essay', 'title': 'A Public Record Must Outlast the Feed',
         'author': 'Douglas B. Vandergraph',
         'url': 'https://outsideinprint.org/essays/a-public-record-must-outlast-the-feed/',
         'capsule': 'Our first guest essay follows a public notice after its post slips out of view.'}


class VisibleText(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.parts = []
        self.feed(source)

    def handle_data(self, value):
        self.parts.append(value)


def build_web_fixture(folder, issue_source, guest_source=None):
    """Real page/CSS, isolated from the image library; supplied public raster URLs."""
    folder = Path(folder)
    for name in ('content/almanack', 'content/essays', 'layouts/almanack',
                 'layouts/_default', 'layouts/partials/images', 'layouts/partials/article', 'static'):
        (folder / name).mkdir(parents=True, exist_ok=True)
    (folder / 'hugo.toml').write_text('baseURL = "https://outsideinprint.org/"\ntimeZone = "America/New_York"\ndisableKinds = ["home", "section", "taxonomy", "term", "rss", "sitemap"]\n', encoding='utf-8')
    (folder / 'content/almanack/issue.md').write_text(issue_source, encoding='utf-8')
    guest_source = guest_source if guest_source is not None else (ROOT / 'content/essays/a-public-record-must-outlast-the-feed.md').read_text(encoding='utf-8')
    (folder / 'content/essays/a-public-record-must-outlast-the-feed.md').write_text(guest_source, encoding='utf-8')
    shutil.copyfile(ROOT / 'layouts/almanack/single.html', folder / 'layouts/almanack/single.html')
    shutil.copytree(ROOT / 'layouts/partials/almanack', folder / 'layouts/partials/almanack', dirs_exist_ok=True)
    shutil.copyfile(ROOT / 'assets/css/main.css', folder / 'static/main.css')
    (folder / 'layouts/_default/baseof.html').write_text('<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"><title>{{ .Title }}</title></head><body class="section-almanack"><div class="wrap" id="site-page"><main id="main-content">{{ block "main" . }}{{ end }}</main></div></body></html>', encoding='utf-8')
    (folder / 'layouts/_default/single.html').write_text('{{ define "main" }}{{ .Content }}{{ end }}', encoding='utf-8')
    for name in ('article/share.html', 'newsletter_signup.html'):
        (folder / 'layouts/partials' / name).write_text('', encoding='utf-8')
    (folder / 'layouts/partials/images/model.html').write_text('''{{- $url := "" -}}
{{- $ref := .ref -}}{{- range .page.Params.essays -}}{{- if eq .image $ref -}}{{- $url = .email_image -}}{{- end -}}{{- end -}}
{{- with .page.Params.bookshelf -}}{{- if eq .image $ref -}}{{- $url = .email_image -}}{{- end -}}{{- end -}}
{{- return (dict "url" $url) -}}''', encoding='utf-8')
    (folder / 'layouts/partials/images/picture.html').write_text('<img src="{{ .model.url }}" alt="{{ .alt }}" loading="{{ .loading }}" style="max-width:100%;height:auto;">', encoding='utf-8')
    subprocess.run([HUGO, '--source', str(folder), '--buildDrafts', '--buildFuture', '--panicOnWarning'], check=True, capture_output=True, text=True)
    return next((folder / 'public/almanack').rglob('index.html'))


class GuestFeatureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='almanack-guest-')
        self.folder = Path(self.temp.name)
        self.source = (ROOT / 'content/almanack/2026-10-10.md').read_text(encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def source_with_guest(self, guest=GUEST):
        source = self.source.replace('2026-10-10', '2026-10-17')
        return source.replace('---\n', '---\nguest_feature: ' + json.dumps(guest) + '\n', 1)

    def render(self, source, name='output'):
        issue = self.folder / (name + '.md')
        issue.write_text(source, encoding='utf-8')
        output = self.folder / name
        metadata = DISTRIBUTION['render'](issue, output)
        return metadata, (output / 'email.html').read_text(encoding='utf-8'), (output / 'email.txt').read_text(encoding='utf-8')

    def test_guest_is_between_lead_and_supporting_cards_in_email_and_web(self):
        meta, html, plain = self.render(self.source_with_guest())
        visible = ' '.join(VisibleText(html).parts)
        web_path = build_web_fixture(self.folder / 'web', self.source_with_guest())
        web = ' '.join(VisibleText(web_path.read_text(encoding='utf-8')).parts)
        lead, support = meta['content']['essays'][:2]
        for value in (visible, plain, web):
            self.assertLess(value.index(lead['title']), value.index(GUEST['label']))
            self.assertLess(value.index(GUEST['label']), value.index(support['title']))
            for key in ('label', 'title', 'author', 'capsule'):
                self.assertEqual(value.count(GUEST[key]), 1)
        self.assertIn('almanack-guest-feature-v1', meta['exporter_extension'])
        self.assertEqual(meta['exporter_extension_sha256'], DISTRIBUTION['exporter_signature']())

    def test_absent_guest_preserves_prior_html_and_plaintext(self):
        baseline = self.folder / 'baseline'
        shutil.copytree(ROOT / 'config/almanack-email/exporter', baseline)
        for name in ('layouts/almanack/single.email.html', 'layouts/almanack/single.emailtext.txt', 'layouts/partials/almanack/email-model.html'):
            blob = subprocess.run(['git', '-C', str(ROOT), 'show', 'HEAD:config/almanack-email/exporter/' + name], check=True, capture_output=True).stdout
            (baseline / name).write_bytes(blob)
        issue = self.folder / 'historical.md'
        issue.write_text(self.source, encoding='utf-8')
        for label, path in (('before', baseline), ('after', ROOT / 'config/almanack-email/exporter')):
            module = runpy.run_path(str(path / 'scripts/render_almanack_email.py'))
            module['render'](issue, self.folder / label, HUGO)
        for name in ('email.html', 'email.txt'):
            self.assertEqual((self.folder / 'before' / name).read_bytes(), (self.folder / 'after' / name).read_bytes())

    def test_invalid_schema_and_duplicate_card_fail_without_exports(self):
        cases = [None, {}, dict(GUEST, extra='unexpected'), dict(GUEST, author=''),
                 dict(GUEST, capsule='word ' * 61), dict(GUEST, title='t' * 241),
                 dict(GUEST, url='https://outsideinprint.org.evil.test/essays/guest/'),
                 dict(GUEST, url='javascript:alert(1)')]
        for index, guest in enumerate(cases):
            with self.subTest(guest=guest), self.assertRaises(subprocess.CalledProcessError):
                self.render(self.source_with_guest(guest), str(index))
            self.assertFalse((self.folder / str(index) / 'email.html').exists())
        duplicate = self.source_with_guest().replace('essays:\n', 'essays:\n  - title: "Duplicate"\n    url: "' + GUEST['url'] + '"\n')
        with self.assertRaises(subprocess.CalledProcessError):
            self.render(duplicate, 'duplicate')

    def test_source_title_author_designation_and_availability_must_agree(self):
        original = (ROOT / 'content/essays/a-public-record-must-outlast-the-feed.md').read_text(encoding='utf-8')
        cases = [original.replace(GUEST['title'], 'Different title', 1),
                 original.replace(GUEST['author'], 'Different author', 1),
                 original.replace('contributor_role: "guest"', 'contributor_role: "contributing"'),
                 original.replace('draft: false', 'draft: true'),
                 original.replace('2026-10-12T09:00:00-04:00', '2026-10-18T09:00:00-04:00')]
        for index, guest_source in enumerate(cases):
            with self.subTest(index=index), self.assertRaises(subprocess.CalledProcessError):
                build_web_fixture(self.folder / str(index), self.source_with_guest(), guest_source)

    def test_dialogue_labels_override_essay_defaults_in_all_formats(self):
        source = self.source_with_guest(dict(GUEST, url='/essays/a-public-record-must-outlast-the-feed/'))
        position = source.index('  - ', source.index('essays:\n'))
        insertion = source.index('\n', position) + 1
        source = source[:insertion] + '    excerpt_label: "From the dialogue"\n    read_label: "Read the full dialogue"\n' + source[insertion:]
        meta, html, plain = self.render(source)
        web_path = build_web_fixture(self.folder / 'web', source)
        for body in (html, plain, web_path.read_text(encoding='utf-8')):
            self.assertIn('From the dialogue', body)
            self.assertIn('Read the full dialogue', body)
            self.assertNotIn('From the essay', body)
            self.assertNotIn('Read the full essay', body)
        self.assertIn('almanack-lead-labels-v1', meta['exporter_extension'])


if __name__ == '__main__':
    unittest.main()
