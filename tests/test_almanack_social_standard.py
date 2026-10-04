"""Offline safety checks for the manual Almanack social-standard installer."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import uuid


ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "scripts/install_almanack_social_standard.py"
STANDARD = ROOT / "config/almanack-social/standard.json"
ANCHOR = (
    "Keep BUTTONDOWN_API_KEY only in the process environment if an already authorized API handoff uses it. "
    "Never log, save or expose it; do not create credentials as part of template work. "
    "Prefer the signed-in supported browser when the user requests it.\n\n"
    "## Automation and authorization\n"
)
PREFIX = "# Bob's Almanack\n\nPreserve canonical issue_number and Buttondown secondary_id.\n\n"
SUFFIX = (
    "\nThe Saturday automation prepares and validates the package, then creates or updates a draft "
    "and sends one owner preview only. It does not publish, schedule, broadcast, collect analytics, "
    "delete emails, change settings or billing, commit, push or open PRs. "
    "The approved template is not standing subscriber-send authorization.\n"
)


class SocialStandardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("social_standard_installer", INSTALLER)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def setUp(self):
        # Windows embedded Python's mode-0700 mkdtemp directories can exclude
        # the sandbox token. Keep inherited ACLs for these disposable fixtures.
        self.temporary_root = Path(tempfile.gettempdir()).resolve()
        self.base = self.temporary_root / ("almanack-social-standard-test-" + uuid.uuid4().hex)
        self.base.mkdir()
        self.addCleanup(self.cleanup_fixture)
        self.workspace = self.base / "workspace"
        self.workspace.mkdir()
        self.skill = self.base / "skill/SKILL.md"
        self.skill.parent.mkdir()
        self.original_skill = PREFIX + ANCHOR + SUFFIX
        self.skill.write_bytes(self.original_skill.encode("utf-8"))
        self.backup = self.base / "backups"
        self.destination = self.workspace / "config/almanack-social/standard.json"
        self.source = self.base / "candidate.json"
        self.source.write_bytes(STANDARD.read_bytes())
        self.sentinels = {
            "scripts/render_almanack_distribution.py": b"# Existing email renderer: preserve it.\r\n",
            "automations/weekly_bobs_almanack_package.md": b"Owner email preview only; no social scheduling.\r\n",
            "output/almanack-package-2026-10-03/buttondown-response.json": b'{"id":"em_sent_fixture","status":"sent","secondary_id":18}\n',
        }
        for name, content in self.sentinels.items():
            path = self.workspace / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)

    def cleanup_fixture(self):
        resolved = self.base.resolve()
        if resolved.parent != self.temporary_root or not resolved.name.startswith("almanack-social-standard-test-"):
            raise RuntimeError("Refusing fixture cleanup outside its checked temporary root.")
        shutil.rmtree(resolved)

    def snapshot(self):
        return {path.relative_to(self.base).as_posix(): path.read_bytes()
                for path in self.base.rglob("*") if path.is_file()}

    def install(self):
        return self.module.install(self.workspace, self.skill, self.backup, self.source)

    def assert_rejected_without_writes(self):
        before = self.snapshot()
        with self.assertRaises((ValueError, RuntimeError)):
            self.install()
        self.assertEqual(before, self.snapshot())
        self.assertFalse(self.backup.exists())

    def test_real_standard_loads_and_empty_standard_is_rejected(self):
        standard = self.module.load_standard(self.source)
        self.assertEqual(standard, json.loads(self.source.read_text(encoding="utf-8")))
        self.assertEqual([reference["library_file_id"] for reference in standard["references"]], [
            "libfile_d57c65df3b4481918a8d0cbc2f04139a", "libfile_23228fcc3ed08191ba899ec0988f3ce1",
        ])
        self.source.write_text("{}\n", encoding="utf-8")
        self.assert_rejected_without_writes()

    def test_changed_dimensions_destinations_scope_art_or_references_are_rejected(self):
        approved = json.loads(self.source.read_text(encoding="utf-8"))
        changes = (
            (("platforms", "facebook", "width"), 1200),
            (("platforms", "pinterest", "height"), 1350),
            (("platforms", "facebook", "destination"), "selected_article_url"),
            (("platforms", "instagram", "destination"), "direct_canonical_issue_url"),
            (("scope", "changes_weekly_automation"), True),
            (("scope", "authorizes_posting_or_scheduling"), True),
            (("scope", "changes_other_campaigns"), True),
            (("scope", "changes_email_controls"), True),
            (("artwork", "allow_crop"), True),
            (("artwork", "allow_stretch"), True),
            (("artwork", "allow_substitution_or_regeneration"), True),
            (("artwork", "preserve_whole_artwork"), False),
            (("references", 0, "library_file_id"), "file_unapproved_reference"),
            (("references", 0, "pixel_inspection"), "assumed"),
            (("review", "required_before_handoff"), []),
        )
        for keys, value in changes:
            with self.subTest(field=keys, value=value):
                candidate = copy.deepcopy(approved)
                target = candidate
                for key in keys[:-1]:
                    target = target[key]
                target[keys[-1]] = value
                self.source.write_text(json.dumps(candidate), encoding="utf-8")
                self.assert_rejected_without_writes()

    def test_skill_patch_is_narrow_and_idempotent(self):
        self.assertEqual(self.module.SKILL_ANCHOR, ANCHOR)
        patched = self.module.patch_skill(self.original_skill)
        self.assertTrue(patched.startswith(PREFIX))
        self.assertTrue(patched.endswith(SUFFIX))
        self.assertIn(self.module.SKILL_SECTION, patched)
        self.assertEqual(patched.count(self.module.SKILL_SECTION), 1)
        self.assertEqual(patched, self.module.patch_skill(patched))

    def test_unknown_duplicate_or_mixed_skill_sections_fail_closed(self):
        patched = self.module.patch_skill(self.original_skill)
        for candidate in (
            "# Unknown skill version\n",
            self.original_skill + ANCHOR,
            patched + ANCHOR,
            patched + self.module.SKILL_SECTION,
        ):
            with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                self.module.patch_skill(candidate)

    def test_plan_is_read_only_and_names_only_intended_targets(self):
        before = self.snapshot()
        plan = self.module.plan_changes(self.workspace, self.skill, self.source)
        self.assertEqual(before, self.snapshot())
        self.assertEqual({path.resolve() for path, _, _ in plan}, {self.skill.resolve(), self.destination.resolve()})
        for path, original, changed in plan:
            self.assertEqual(original, path.read_bytes() if path.exists() else None)
            self.assertIsInstance(changed, bytes)
        self.assertFalse(self.backup.exists())

    def test_install_records_original_backups_hashes_and_preserves_email_lane(self):
        original_skill = self.skill.read_bytes()
        manifest = self.install()
        self.assertEqual(json.loads(self.destination.read_text(encoding="utf-8")),
                         json.loads(self.source.read_text(encoding="utf-8")))
        self.assertIn(SUFFIX, self.skill.read_text(encoding="utf-8"))
        for name, expected in self.sentinels.items():
            self.assertEqual((self.workspace / name).read_bytes(), expected, name)
        files = list(self.backup.rglob("manifest.json"))
        self.assertEqual(len(files), 1)
        stored = json.loads(files[0].read_text(encoding="utf-8"))
        self.assertEqual(stored, manifest)
        for entry in manifest:
            path = Path(entry["path"])
            self.assertEqual(entry["after_sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
            if path.resolve() == self.skill.resolve():
                self.assertEqual(entry["before_sha256"], hashlib.sha256(original_skill).hexdigest())
                self.assertEqual((files[0].parent / entry["backup"]).read_bytes(), original_skill)
            else:
                self.assertIsNone(entry["before_sha256"])
                self.assertIsNone(entry["backup"])

    def test_second_install_is_a_no_op_including_backups(self):
        self.install()
        before = self.snapshot()
        self.assertEqual(self.module.plan_changes(self.workspace, self.skill, self.source), [])
        self.assertEqual(self.install(), [])
        self.assertEqual(before, self.snapshot())

    def test_existing_config_conflict_stops_before_skill_edit(self):
        self.destination.parent.mkdir(parents=True)
        self.destination.write_text('{"unrecognized":"existing local standard"}\n', encoding="utf-8")
        self.assert_rejected_without_writes()

    def test_modified_installed_skill_section_stops_before_config_write(self):
        patched = self.module.patch_skill(self.original_skill)
        section = self.module.SKILL_SECTION
        heading_end = section.index("\n")
        modified = section[:heading_end + 1] + "Unrecognized local instructions.\n" + section[heading_end + 1:]
        self.skill.write_text(patched.replace(section, modified, 1), encoding="utf-8")
        self.assert_rejected_without_writes()
        self.assertFalse(self.destination.exists())

    def test_crlf_skill_preserves_line_endings_and_exact_prior_content(self):
        self.skill.write_bytes(self.original_skill.replace("\n", "\r\n").encode("utf-8"))
        original = self.skill.read_bytes()
        self.install()
        changed = self.skill.read_bytes()
        self.assertNotIn(b"\n", changed.replace(b"\r\n", b""))
        self.assertTrue(changed.startswith(PREFIX.replace("\n", "\r\n").encode("utf-8")))
        self.assertTrue(changed.endswith(SUFFIX.replace("\n", "\r\n").encode("utf-8")))
        self.assertIn(original, [path.read_bytes() for path in self.backup.rglob("*") if path.is_file()])


if __name__ == "__main__":
    unittest.main()
