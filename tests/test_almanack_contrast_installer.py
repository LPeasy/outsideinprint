"""Offline tests of the bounded local contrast installation; no provider calls."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent / "scripts"
if not (SCRIPTS / "install_almanack_contrast_fix.py").is_file():
    SCRIPTS = HERE
SPEC = importlib.util.spec_from_file_location("contrast_installer", SCRIPTS / "install_almanack_contrast_fix.py")
INSTALLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALLER)

# Independent local-wrapper fixture retains the real numbering and footer contracts.
RENDERER = r'''import hashlib
import json
import re
import runpy
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
EXPORTER = ROOT / "config/almanack-email/exporter/scripts/render_almanack_email.py"
CONTRACT = "classic-shared-v1"
MEDIUM = "https://medium.com/the-balanced-sheet"

def render(issue, output_dir, hugo=None):
    module = runpy.run_path(str(EXPORTER))
    metadata = module["render"](issue, output_dir, str(hugo))
    number = metadata.get("issue_number")
    content = metadata.get("content", {})
    masthead = content.get("email_masthead")
    if (type(number) is not int or number <= 0
            or content.get("issue_number") != number
            or not re.search(r"\bIssue " + str(number) + r"$", metadata.get("subject", ""))
            or (masthead is not None and masthead.get("issue_number") != number)):
        raise ValueError("Canonical issue number, subject and masthead must agree before Buttondown handoff.")
    metadata["secondary_id"] = number
    directory = Path(output_dir)
    html_path = directory / "email.html"
    text_path = directory / "email.txt"
    body = html_path.read_text(encoding="utf-8")
    footer = '<a style="color:#346782;" href="https://outsideinprint.org/">Outside In Print</a>'
    if body.count(footer) != 1:
        raise ValueError("Expected one footer")
    body = body.replace(footer, footer + f' <a style="color:#346782;" href="{MEDIUM}">The Balanced Sheet</a>')
    html_path.write_text(body, encoding="utf-8", newline="\n")
    text = text_path.read_text(encoding="utf-8")
    text = text.replace("https://outsideinprint.org/\nColor over the lines.",
                        f"https://outsideinprint.org/\nThe Balanced Sheet: {MEDIUM}\nColor over the lines.")
    text_path.write_text(text, encoding="utf-8", newline="\n")
    metadata.update(distribution_contract=CONTRACT, buttondown_template="classic",
                    html_sha256=hashlib.sha256(html_path.read_bytes()).hexdigest(),
                    text_sha256=hashlib.sha256(text_path.read_bytes()).hexdigest())
    (directory / "email.json").write_text(json.dumps(metadata), encoding="utf-8")
    return metadata
'''
EXPORTER = r'''import json
from pathlib import Path
def render(issue, output_dir, hugo=None):
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    metadata = json.loads(Path(issue).read_text(encoding="utf-8"))
    (directory / "email.html").write_text('<table><tr><td><p>Protected quote.</p><a style="color:#346782;" href="https://outsideinprint.org/">Outside In Print</a></td></tr></table>', encoding="utf-8")
    (directory / "email.txt").write_text("Protected quote.\nhttps://outsideinprint.org/\nColor over the lines.\n", encoding="utf-8")
    return metadata
'''
HELPER = '''CONTRAST_CONTRACT = "parchment-paired-v1"
def apply_contrast(html):
    # A sentinel tests insertion and final hashing without duplicating helper tests.
    return html + "<!-- contrast applied -->"
'''
VALIDATOR = '''def validate_contract(metadata, module):
    errors = []
    issue = output = None
    if True:
        if True:
            fresh = module["render"](issue, output)
    return errors

def compared_keys():
    for key in ("issue_date", "issue_number", "secondary_id", "subject", "preheader", "content"):
        yield key
'''


class ContrastInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="oip-contrast-installer-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "workspace"
        self.scripts = self.root / "scripts"
        self.config = self.root / "config/almanack-email"
        self.snapshot = self.config / "exporter/scripts/render_almanack_email.py"
        self.scripts.mkdir(parents=True)
        self.snapshot.parent.mkdir(parents=True)
        self.renderer = self.scripts / "render_almanack_distribution.py"
        self.renderer.write_bytes(RENDERER.replace("\n", "\r\n").encode())
        (self.scripts / "validate_almanack_distribution.py").write_text(VALIDATOR, encoding="utf-8")
        self.snapshot.write_text(EXPORTER, encoding="utf-8")
        self.standard = self.config / "standard.json"
        self.standard.write_text(json.dumps({
            "standard": "classic-shared-v1", "template": "classic",
            "style": {"paper": "#EADBC1", "ink": "#1A1712"},
            "provider_numbering": "Require canonical secondary_id and leave sent emails unchanged."
        }, indent=2) + "\n", encoding="utf-8")
        (self.config / "approved-buttondown-standard.md").write_text(
            "# Existing approved standard\n" + INSTALLER.OLD_STANDARD + "\n", encoding="utf-8")
        self.skill = self.base / "SKILL.md"
        self.skill.write_text(INSTALLER.OLD_SKILL + "\n", encoding="utf-8")
        self.helper = self.base / "candidate-helper.py"
        self.helper.write_text(HELPER, encoding="utf-8")
        self.backups = self.base / "backups"
        self.sent = self.root / "output/sent-issue/buttondown-response.json"
        self.sent.parent.mkdir(parents=True)
        self.sent.write_text('{"id":"sent","status":"sent","secondary_id":18}', encoding="utf-8")
        self.issue = self.base / "issue.json"
        self.metadata = {"issue_number": 23, "subject": "Bob's Almanack ~ Issue 23",
                         "provider_preview_verified": False,
                         "content": {"issue_number": 23, "email_masthead": {"issue_number": 23}}}
        self.issue.write_text(json.dumps(self.metadata), encoding="utf-8")

    def install(self):
        return INSTALLER.install(self.root, self.skill, self.backups, self.helper)

    def all_bytes(self):
        return {path.relative_to(self.base): path.read_bytes() for path in self.base.rglob("*") if path.is_file()}

    def test_install_is_idempotent_and_preserves_snapshot_sent_and_numbering(self):
        snapshot, sent = self.snapshot.read_bytes(), self.sent.read_bytes()
        old_standard = json.loads(self.standard.read_text())
        self.assertEqual(len(self.install()), 6)
        installed = self.all_bytes()
        self.assertEqual(self.install(), [])
        self.assertEqual(self.all_bytes(), installed)
        self.assertEqual(self.snapshot.read_bytes(), snapshot)
        self.assertEqual(self.sent.read_bytes(), sent)
        new_standard = json.loads(self.standard.read_text())
        self.assertEqual(new_standard["provider_numbering"], old_standard["provider_numbering"])
        self.assertEqual(new_standard["style"], old_standard["style"])
        self.assertEqual(new_standard["email_contrast_contract"], "parchment-paired-v1")
        text = self.renderer.read_text()
        before_guard = RENDERER.split('    number = metadata.get("issue_number")')[1].split('    directory = Path(output_dir)')[0]
        self.assertIn(before_guard, text)
        self.assertEqual(text.count('body = CONTRAST["apply_contrast"](body)'), 1)
        keys = tuple(runpy.run_path(str(self.scripts / "validate_almanack_distribution.py"))["compared_keys"]())
        self.assertIn("secondary_id", keys)
        self.assertNotIn("email_contrast_contract", keys)
        validator = runpy.run_path(str(self.scripts / "validate_almanack_distribution.py"))["validate_contract"]
        fresh = {"render": lambda *_: {"email_contrast_contract": "parchment-paired-v1"}}
        self.assertEqual(validator({"email_contrast_contract": "parchment-paired-v1"}, fresh), [])
        self.assertEqual(validator({}, fresh), ["email.json email_contrast_contract is stale."])

    def test_original_backups_are_byte_exact_and_hashed(self):
        originals = self.all_bytes()
        manifest = self.install()
        backup = next(self.backups.iterdir())
        self.assertEqual(json.loads((backup / "manifest.json").read_text()), manifest)
        for row in manifest:
            path = Path(row["path"])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), row["after_sha256"])
            if row["backup"]:
                original = originals[path.relative_to(self.base)]
                self.assertEqual((backup / row["backup"]).read_bytes(), original)
                self.assertEqual(row["before_sha256"], hashlib.sha256(original).hexdigest())
        self.assertIn(b"\r\n", self.renderer.read_bytes())

    def test_late_preflight_failure_changes_nothing(self):
        self.skill.write_text("Unknown skill revision", encoding="utf-8")
        before = self.all_bytes()
        with self.assertRaises(ValueError):
            self.install()
        self.assertEqual(self.all_bytes(), before)
        self.assertFalse(self.backups.exists())

    def test_existing_different_helper_changes_nothing(self):
        (self.scripts / "almanack_email_contrast.py").write_text("unexpected helper", encoding="utf-8")
        before = self.all_bytes()
        with self.assertRaises(ValueError):
            self.install()
        self.assertEqual(self.all_bytes(), before)
        self.assertFalse(self.backups.exists())

    def test_unknown_ambiguous_or_partial_install_is_rejected(self):
        for value in ("unknown", "old old", "new new", "old new"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                INSTALLER.replace_once(value, "old", "new", "fixture")
        with self.assertRaises(ValueError):
            INSTALLER.patch_renderer(RENDERER.replace('metadata["secondary_id"] = number', 'metadata["other"] = number'))
        text = self.standard.read_text()
        for mutation in (
            text.replace('  "provider_numbering": ', '  "email_contrast_contract": "parchment-paired-v1",\n  "provider_numbering": '),
            text.replace('  "provider_numbering": ', '  "body_contrast": "unreviewed policy",\n  "provider_numbering": '),
        ):
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                INSTALLER.patch_standard(mutation)

    def test_installed_render_preserves_content_numbering_and_hashes_final_html(self):
        self.install()
        output = self.base / "rendered"
        rendered = runpy.run_path(str(self.renderer))["render"](self.issue, output)
        html = (output / "email.html").read_text()
        self.assertTrue(html.endswith("<!-- contrast applied -->"))
        self.assertIn("Protected quote.", html)
        for url in ("https://outsideinprint.org/", "https://medium.com/the-balanced-sheet"):
            self.assertIn(url, html)
            self.assertIn(url, (output / "email.txt").read_text())
        self.assertEqual(rendered["content"], self.metadata["content"])
        self.assertEqual(rendered["secondary_id"], 23)
        self.assertEqual(rendered["subject"], self.metadata["subject"])
        self.assertFalse(rendered["provider_preview_verified"])
        self.assertEqual(rendered["email_contrast_contract"], "parchment-paired-v1")
        self.assertEqual(rendered["html_sha256"], hashlib.sha256((output / "email.html").read_bytes()).hexdigest())
        self.assertEqual(json.loads((output / "email.json").read_text()), rendered)
        self.assertNotIn("contrast applied", (output / "email.txt").read_text())
        self.metadata["content"]["issue_number"] = 22
        self.issue.write_text(json.dumps(self.metadata))
        with self.assertRaisesRegex(ValueError, "Canonical issue number"):
            runpy.run_path(str(self.renderer))["render"](self.issue, self.base / "mismatch")

    def test_helper_loads_from_unrelated_directory_in_isolated_python(self):
        self.install()
        code = "import runpy,sys; m=runpy.run_path(sys.argv[1]); r=m['render'](sys.argv[2],sys.argv[3]); print(r['secondary_id'],r['email_contrast_contract'])"
        result = subprocess.run([sys.executable, "-I", "-c", code, str(self.renderer), str(self.issue), str(self.base / "subprocess-output")],
                                cwd=self.base, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("23 parchment-paired-v1", result.stdout)


if __name__ == "__main__":
    unittest.main()
