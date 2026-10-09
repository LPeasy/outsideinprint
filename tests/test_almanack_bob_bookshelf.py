from pathlib import Path
import hashlib, json, re, runpy, tempfile, unittest

ROOT = Path(__file__).resolve().parents[1]
renderer = runpy.run_path(str(ROOT / 'scripts/render_almanack_distribution.py'))
validator = runpy.run_path(str(ROOT / 'scripts/validate_almanack_distribution.py'))

class OptionalClassicComponentsTests(unittest.TestCase):
    def render_issue(self, folder):
        return renderer['render'](ROOT / 'content/almanack/2026-10-10.md', folder)

    def test_actual_issue_components_and_distribution_contract(self):
        with tempfile.TemporaryDirectory(prefix='almanack-optional-') as directory:
            meta = self.render_issue(directory)
            folder = Path(directory)
            body = (folder / 'email.html').read_text(encoding='utf-8')
            plain = (folder / 'email.txt').read_text(encoding='utf-8')
            self.assertEqual(meta['secondary_id'], 23)
            self.assertEqual(meta['distribution_contract'], 'classic-shared-v1')
            self.assertEqual(meta['exporter_extension_sha256'], renderer['exporter_signature']())
            self.assertEqual(len(re.findall(r'<a\b[^>]*data-bob=', body)), 4)
            self.assertIn('class="bob-ornament bob-flight"', body)
            self.assertIn('class="almanack-bookshelf"', body)
            for paragraph in meta['content']['bob_feature']['paragraphs']:
                self.assertIn(paragraph, plain)
            self.assertLess(plain.index('From the Bookshelf'), plain.index("This Week's Virtue"))
            self.assertEqual(meta['html_sha256'], hashlib.sha256((folder / 'email.html').read_bytes()).hexdigest())
            self.assertEqual(meta['text_sha256'], hashlib.sha256((folder / 'email.txt').read_bytes()).hexdigest())
            self.assertNotIn('PENDING', plain)

    def test_real_parity_rejects_body_tampering(self):
        with tempfile.TemporaryDirectory(prefix='almanack-optional-') as directory:
            self.render_issue(directory)
            folder = Path(directory)
            (folder / 'web-archive.md').write_bytes((ROOT / 'content/almanack/2026-10-10.md').read_bytes())
            self.assertEqual(validator['validate'](folder), [])
            with (folder / 'email.html').open('ab') as f:
                f.write(b'<!-- altered after export -->')
            self.assertTrue(validator['validate'](folder))

    def test_real_parity_rejects_false_provider_number(self):
        with tempfile.TemporaryDirectory(prefix='almanack-optional-') as directory:
            meta = self.render_issue(directory)
            folder = Path(directory)
            (folder / 'web-archive.md').write_bytes((ROOT / 'content/almanack/2026-10-10.md').read_bytes())
            meta['secondary_id'] = 17
            (folder / 'email.json').write_text(json.dumps(meta), encoding='utf-8')
            self.assertTrue(any('secondary_id' in e for e in validator['validate'](folder)))

if __name__ == '__main__':
    unittest.main()
