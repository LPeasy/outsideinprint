"""Selected-pose layout, optional crane trail, source limits and historical parity."""
from pathlib import Path
from html.parser import HTMLParser
import copy, json, re, runpy, tempfile, unittest

ROOT = Path(__file__).resolve().parents[1]
RENDER = runpy.run_path(str(ROOT / 'scripts/render_almanack_distribution.py'))
SOURCE = runpy.run_path(str(ROOT / 'config/almanack-email/exporter/scripts/render_almanack_email.py'))
WEB = runpy.run_path(str(ROOT / 'tests/test_almanack_guest_feature.py'))
SLOTS = {'masthead', 'note', 'lead', 'guest', 'divider', 'bookshelf', 'stories', 'signoff'}
SELECTED = SLOTS - {'note', 'bookshelf'}
STEAM = 'https://store.steampowered.com/app/4978200/Idle_Times/'

class OrnamentParser(HTMLParser):
    def __init__(self, body):
        super().__init__(); self.poses = []; self.trails = []; self.active = None; self.feed(body)
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and ('data-bob' in attrs or 'data-bob-trail' in attrs):
            self.active = attrs
            (self.poses if 'data-bob' in attrs else self.trails).append(attrs)
        if tag == 'img' and self.active is not None:
            self.active['image'] = attrs
    def handle_endtag(self, tag):
        if tag == 'a': self.active = None

def source_with_poses(source, poses):
    block = 'bob_ornaments: ' + json.dumps(poses) + '\n\n'
    return re.sub(r'bob_ornaments:\n.*?(?=essays:\n)', lambda match: block, source, flags=re.S)

class ScatteredBobTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='almanack-scattered-')
        cls.folder = Path(cls.temp.name)
        cls.issue = ROOT / 'content/almanack/2026-10-17.md'
        cls.meta = RENDER['render'](cls.issue, cls.folder / 'email')
        cls.web = WEB['build_web_fixture'](cls.folder / 'web', cls.issue.read_text(encoding='utf-8'))
    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()
    def test_six_selected_accessible_sized_links_in_both_editions(self):
        for path in (self.folder / 'email/email.html', self.web):
            with self.subTest(path=path.name):
                body = path.read_text(encoding='utf-8')
                parser = OrnamentParser(body)
                self.assertEqual(len(parser.poses), 6)
                self.assertEqual({pose['data-bob'] for pose in parser.poses}, SELECTED)
                self.assertNotIn('bob-flight', body)
                for pose in parser.poses:
                    expected = self.meta['content']['bob_ornaments'][pose['data-bob']]
                    self.assertEqual(pose['href'], STEAM)
                    self.assertTrue(pose['aria-label'])
                    self.assertEqual(pose['image']['width'], str(expected['width']))
                    self.assertEqual(pose['image']['height'], str(expected['height']))
    def test_requested_position_and_crane_trail_structure(self):
        for path in (self.folder / 'email/email.html', self.web):
            with self.subTest(path=path.name):
                body = path.read_text(encoding='utf-8')
                masthead = re.search(r'<table[^>]*bob-edge--masthead.*?</table>', body, re.S)[0]
                self.assertRegex(masthead, r'<td[^>]*width="33%"')
                self.assertLess(masthead.index('width="33%"'), masthead.index('data-bob="masthead"'))
                heading = re.search(r'<h[23][^>]*bob-heading--inline.*?</h[23]>', body, re.S)[0]
                self.assertLess(heading.index(self.meta['content']['essays'][0]['title']), heading.index('data-bob="lead"'))
                self.assertNotIn('<td', heading)
                self.assertIn('margin-left:12px', heading)
                trails = OrnamentParser(body).trails
                self.assertEqual(len(trails), 1)
                trail = self.meta['content']['bob_ornaments']['divider']['trail']
                self.assertEqual(trails[0]['href'], STEAM)
                self.assertEqual(trails[0]['image']['src'], trail['image_url'])
                self.assertEqual(trails[0]['image']['alt'], trail['image_alt'])
                self.assertIn('width:100%', trails[0]['image']['style'])
    def test_plaintext_contains_editorial_copy_and_no_decoration(self):
        plain = (self.folder / 'email/email.txt').read_text(encoding='utf-8')
        self.assertIn(self.meta['content']['guest_feature']['title'], plain)
        self.assertIn(self.meta['content']['essays'][0]['title'], plain)
        self.assertNotIn('scattered-v1', plain)
        for pose in self.meta['content']['bob_ornaments'].values():
            self.assertNotIn(pose['image_url'], plain)
        self.assertNotIn(self.meta['content']['bob_ornaments']['divider']['trail']['image_url'], plain)
        self.assertIn('almanack-scattered-bob-v1', self.meta['exporter_extension'])
    def test_all_eight_slots_and_optional_heading_poses(self):
        content = copy.deepcopy(self.meta['content'])
        for slot in ('note', 'bookshelf'):
            content['bob_ornaments'][slot] = copy.deepcopy(content['bob_ornaments']['guest'])
        SOURCE['check_optional_components'](content)
        for slot in ('lead', 'guest'):
            content['bob_ornaments'].pop(slot)
        source = source_with_poses(self.issue.read_text(encoding='utf-8'), content['bob_ornaments'])
        issue = self.folder / 'optional-headings.md'; issue.write_text(source, encoding='utf-8')
        RENDER['render'](issue, self.folder / 'optional-email')
        web = WEB['build_web_fixture'](self.folder / 'optional-web', source)
        for path in (self.folder / 'optional-email/email.html', web):
            body = path.read_text(encoding='utf-8')
            actual = {pose['data-bob'] for pose in OrnamentParser(body).poses}
            self.assertEqual(actual, SLOTS - {'lead', 'guest'})
            for title in (content['essays'][0]['title'], content['guest_feature']['title']):
                self.assertIn(title, body)
        content['bob_ornaments'] = {'masthead': content['bob_ornaments']['masthead']}
        for section in ('bob_note', 'guest_feature', 'bookshelf', 'closing_quote'):
            content.pop(section, None)
        content['essays'] = []
        SOURCE['check_optional_components'](content)
    def test_schema_rejects_unscoped_slots_options_and_invalid_dimensions(self):
        original = self.meta['content']
        variants = []
        candidate = copy.deepcopy(original); candidate.pop('bob_layout'); variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments'] = {}; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['unknown'] = copy.deepcopy(candidate['bob_ornaments']['guest']); variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['guest']['align'] = 'unsafe'; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['lead']['width'] = 200; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['lead'].pop('height'); variants.append(candidate)
        candidate = copy.deepcopy(original); candidate.pop('guest_feature'); variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['masthead']['offset_pct'] = 81; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['guest']['offset_pct'] = 33; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['guest']['placement'] = 'after-title'; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['divider']['trail']['image_url'] = 'https://example.com/cranes.png'; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['divider']['trail']['width'] = 601; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['divider']['trail']['height'] = True; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['divider']['trail']['image_alt'] = ''; variants.append(candidate)
        candidate = copy.deepcopy(original); candidate['bob_ornaments']['guest']['trail'] = candidate['bob_ornaments']['divider']['trail']; variants.append(candidate)
        for candidate in variants:
            with self.assertRaises(ValueError): SOURCE['check_optional_components'](candidate)

if __name__ == '__main__': unittest.main()
