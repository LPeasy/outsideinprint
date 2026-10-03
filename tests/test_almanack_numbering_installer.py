"""Offline installation regression tests using copies of the real local handoff.

Set OIP_NUMBERING_WORKSPACE and OIP_NUMBERING_SKILL to existing read-only
source fixtures. No original files or provider state are changed by these tests.
"""
import importlib.util
import copy
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SCRIPT_ROOT = HERE.parent / "scripts"
if not (SCRIPT_ROOT / "install_almanack_numbering_fix.py").is_file():
    SCRIPT_ROOT = HERE
INSTALLER = SCRIPT_ROOT / "install_almanack_numbering_fix.py"
HELPER = SCRIPT_ROOT / "almanack_buttondown_numbering.ps1"
SOURCE_WORKSPACE = os.environ.get("OIP_NUMBERING_WORKSPACE")
SOURCE_SKILL = os.environ.get("OIP_NUMBERING_SKILL")
HANDOFF_FILES = (
    "scripts/almanack_buttondown_body.ps1",
    "scripts/send_almanack_to_buttondown.ps1",
    "scripts/run_almanack_buttondown_preview.ps1",
    "scripts/manage_buttondown_almanack_email.ps1",
    "scripts/render_almanack_distribution.py",
    "scripts/validate_almanack_distribution.py",
    "config/almanack-email/standard.json",
    "config/almanack-email/approved-buttondown-standard.md",
)


def load_installer():
    spec = importlib.util.spec_from_file_location("numbering_installer", INSTALLER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_installer()

    def test_exact_replacement_and_idempotence(self):
        replacement = self.module.replace_once("before original after", "original", "updated", "fixture")
        self.assertEqual(replacement, "before updated after")
        self.assertEqual(self.module.replace_once(replacement, "original", "updated", "fixture"), replacement)

    def test_unknown_or_ambiguous_input_is_rejected(self):
        for source in ("unrecognized", "original original", "updated updated", "original updated"):
            with self.subTest(source=source), self.assertRaises(ValueError):
                self.module.replace_once(source, "original", "updated", "fixture")

    def renderer(self, metadata):
        # A minimal independently written exporter fixture exercises the installed
        # validation code; no Hugo, web requests, local issues or provider calls.
        original = '''import json
from pathlib import Path
def render(issue, output_dir, hugo):
    metadata = module["render"](issue, output_dir, str(hugo))
    directory = Path(output_dir)
    return metadata
'''
        patched = self.module.patch_script("render_almanack_distribution.py", original)
        self.assertNotIn("\x08", patched, "Regex word boundary must not become a backspace character.")
        namespace = {"module": {"render": lambda *_: copy.deepcopy(metadata)}}
        exec(compile(patched, "offline-renderer-fixture", "exec"), namespace)
        with tempfile.TemporaryDirectory(prefix="oip-export-numbering-test-") as output_dir:
            review = Path(output_dir) / "REVIEW.txt"
            review.write_text("Existing export review.\n", encoding="utf-8")
            result = namespace["render"](None, output_dir, None)
            self.assertIn(f"secondary_id): {metadata['issue_number']}", review.read_text(encoding="utf-8"))
            return result

    @staticmethod
    def metadata(number=23):
        return {"issue_number": number, "subject": f"Bob's Almanack ~ Issue {number}",
                "content": {"issue_number": number, "email_masthead": {"issue_number": number}}}

    def test_distribution_export_sets_provider_number_from_each_issue(self):
        for number in (1, 23, 124):
            with self.subTest(number=number):
                self.assertEqual(self.renderer(self.metadata(number))["secondary_id"], number)

    def test_distribution_export_rejects_conflicting_numbers(self):
        fixtures = []
        for number in (None, 0, -1, True, 23.5, "23"):
            metadata = self.metadata()
            metadata["issue_number"] = number
            fixtures.append(metadata)
        metadata = self.metadata()
        metadata["content"]["issue_number"] = 22
        fixtures.append(metadata)
        metadata = self.metadata()
        metadata["content"]["email_masthead"]["issue_number"] = 22
        fixtures.append(metadata)
        metadata = self.metadata()
        metadata["subject"] = "Bob's Almanack ~ Issue 22"
        fixtures.append(metadata)
        for metadata in fixtures:
            with self.subTest(metadata=metadata), self.assertRaises(ValueError):
                self.renderer(metadata)


@unittest.skipUnless(SOURCE_WORKSPACE and SOURCE_SKILL,
                     "Set OIP_NUMBERING_WORKSPACE and OIP_NUMBERING_SKILL for copied-workflow integration tests.")
class InstallerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_installer()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="oip-numbering-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.workspace = self.base / "workspace"
        self.skill = self.base / "skill/SKILL.md"
        self.backup = self.base / "backup"
        for relative in HANDOFF_FILES:
            destination = self.workspace / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path(SOURCE_WORKSPACE) / relative, destination)
        self.skill.parent.mkdir(parents=True)
        shutil.copyfile(SOURCE_SKILL, self.skill)
        source_helper = Path(SOURCE_WORKSPACE) / "scripts/almanack_buttondown_numbering.ps1"
        if source_helper.is_file():
            shutil.copyfile(source_helper, self.workspace / "scripts/almanack_buttondown_numbering.ps1")
        self.sentinel = self.workspace / "output/sent-issue/buttondown-response.json"
        self.sentinel.parent.mkdir(parents=True)
        self.sentinel.write_text('{"id":"sent-issue","status":"sent","secondary_id":18}', encoding="utf-8")

    def snapshot(self):
        files = {path.relative_to(self.workspace).as_posix(): path.read_bytes()
                 for path in self.workspace.rglob("*") if path.is_file()}
        files["SKILL.md"] = self.skill.read_bytes()
        return files

    def install(self):
        return self.module.install(self.workspace, self.skill, self.backup, HELPER)

    def test_install_is_idempotent_and_preserves_sent_artifact(self):
        original = self.snapshot()
        self.install()
        installed = self.snapshot()
        self.assertEqual(installed["output/sent-issue/buttondown-response.json"],
                         original["output/sent-issue/buttondown-response.json"])
        self.assertEqual(installed["scripts/almanack_buttondown_numbering.ps1"], HELPER.read_bytes())
        self.install()
        self.assertEqual(installed, self.snapshot())
        self.assertFalse(self.module.plan_changes(self.workspace, self.skill, HELPER))

    def test_backup_retains_original_bytes(self):
        original = self.snapshot()
        self.install()
        installed = self.snapshot()
        backup_bytes = [path.read_bytes() for path in self.backup.rglob("*") if path.is_file()]
        for name, value in original.items():
            if installed[name] != value:
                self.assertIn(value, backup_bytes, f"Original bytes were not backed up: {name}")

    def test_missing_workflow_file_fails_before_any_change(self):
        # Use the last workflow file so earlier planned edits exist before failure.
        (self.workspace / "scripts/validate_almanack_distribution.py").unlink()
        original = self.snapshot()
        with self.assertRaises((ValueError, RuntimeError, FileNotFoundError)):
            self.install()
        self.assertEqual(original, self.snapshot())
        self.assertFalse(self.backup.exists(), "Preflight failure must not start writing backups.")

    def test_unrecognized_workflow_fails_before_any_change(self):
        (self.workspace / "scripts/send_almanack_to_buttondown.ps1").write_text(
            "# Another version of the workflow: do not guess how to edit it.\n", encoding="utf-8")
        original = self.snapshot()
        with self.assertRaises((ValueError, RuntimeError)):
            self.install()
        self.assertEqual(original, self.snapshot())

    def test_installed_distribution_wrapper_exports_issue_23(self):
        self.install()
        source = self.workspace / "scripts/render_almanack_distribution.py"
        self.assertNotIn("\x08", source.read_text(encoding="utf-8"))
        spec = importlib.util.spec_from_file_location("offline_distribution", source)
        wrapper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(wrapper)
        output = self.base / "rendered"
        output.mkdir()

        def fake_exporter(issue, output_dir, hugo):
            directory = Path(output_dir)
            (directory / "email.html").write_text(
                '<a style="color:#346782;" href="https://outsideinprint.org/">Outside In Print</a>', encoding="utf-8")
            (directory / "email.txt").write_text("https://outsideinprint.org/\nColor over the lines.", encoding="utf-8")
            (directory / "REVIEW.txt").write_text("Existing review.\n", encoding="utf-8")
            return PatchTests.metadata(23)

        with mock.patch.object(wrapper.runpy, "run_path", return_value={"render": fake_exporter}):
            metadata = wrapper.render(self.base / "source.md", output)
        self.assertEqual(metadata["secondary_id"], 23)
        self.assertIn('"secondary_id": 23', (output / "email.json").read_text(encoding="utf-8"))
        self.assertIn("secondary_id): 23", (output / "REVIEW.txt").read_text(encoding="utf-8"))

    @unittest.skipUnless(shutil.which("powershell.exe") or shutil.which("pwsh"), "PowerShell is required.")
    def test_actual_installed_payload_and_pre_delivery_guard(self):
        self.install()
        shell = shutil.which("powershell.exe") or shutil.which("pwsh")
        result = subprocess.run([
            shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
            str(HERE / "test_almanack_buttondown_numbering.ps1"),
            "-HelperPath", str(self.workspace / "scripts/almanack_buttondown_numbering.ps1"),
            "-WorkspaceRoot", str(self.workspace),
        ], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("offline checks passed", result.stdout)


if __name__ == "__main__":
    unittest.main()
