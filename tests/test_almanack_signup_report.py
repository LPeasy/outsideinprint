"""Synthetic manual-export checks. No real subscribers or provider calls."""

import csv
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("almanack_signup_report", REPO / "scripts/report_almanack_signups.py")
reporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reporter)
FIXTURE = REPO / "tests/fixtures/almanack-signups-synthetic.csv"
START = reporter.timestamp("2026-09-01T00:00:00Z")
END = reporter.timestamp("2026-09-08T00:00:00Z")
SNAPSHOT = reporter.timestamp("2026-09-08T12:00:00Z")


class SignupReportTests(unittest.TestCase):
    def setUp(self):
        self.rows = reporter.read_export(FIXTURE)

    def run_report(self, rows=None):
        return reporter.make_report(self.rows if rows is None else rows, START, END, SNAPSHOT,
                                    {"synthetic-test"}, {"synthetic-baseline"}, {"synthetic-test-tag"})

    def test_primary_distinct_ids_and_separate_exclusions(self):
        report, cohort = self.run_report()
        self.assertEqual(report["label"], "New signup cohort, confirmed active as of 2026-09-08T12:00:00Z")
        self.assertEqual(report["distinct_active_new_signups"], 3)
        self.assertEqual(cohort["ids"], ["synthetic-dialogue", "synthetic-history", "synthetic-weekend"])
        self.assertEqual(report["deduplication"]["duplicate_rows_ignored"], 1)
        self.assertEqual(report["separate_counts"], dict(
            unknown_attribution_active=2, pending=1, unsubscribed=1, tests=2, preexisting=2,
            outside_window=1, other_status=1, invalid_creation_date=1))
        self.assertEqual(report["deduplication"]["rows_without_id"], 1)
        self.assertEqual(sum(row["count"] for row in report["groups"]), 3)
        self.assertEqual(report["groups"][1], dict(platform="pinterest", segment="everyday-history",
                                                  placement="everyday-history-bio", count=1))
        self.assertNotIn("email", json.dumps(cohort))

    def test_all_platforms_routes_and_numbered_or_bio_codes(self):
        row = self.rows[0]
        for platform in reporter.PLATFORMS:
            for segment in reporter.SEGMENTS:
                for suffix in ("01", "02", "03", "04", "bio"):
                    code = f"{segment}-{suffix}"
                    valid = {**row, "utm_source": platform,
                             "metadata": json.dumps(dict(oip_segment=segment, oip_post=code))}
                    self.assertEqual(reporter.codes(valid), (platform, segment, code))
        for update in (
            {"utm_source": "twitter"}, {"utm_medium": "social"}, {"utm_campaign": "other"},
            {"metadata": "{'oip_segment': 'weekend', 'oip_post': 'dialogue-01'}"},
            {"metadata": "{'oip_segment': 'weekend', 'oip_post': 'weekend-05'}"},
            {"metadata": "{'oip_segment': [], 'oip_post': 'weekend-01'}"},
            {"metadata": "[1, 2]"}, {"metadata": "corrupt"},
        ):
            self.assertIsNone(reporter.codes({**row, **update}))

    def test_window_boundaries_and_subscription_date_are_not_confirmation_time(self):
        row = self.rows[0]
        at_start = {**row, "creation_date": "2026-09-01 00:00:00+00:00",
                    "subscription_date": "2020-01-01 00:00:00+00:00"}
        self.assertEqual(self.run_report([at_start])[0]["distinct_active_new_signups"], 1)
        at_end = {**at_start, "creation_date": "2026-09-08 00:00:00+00:00"}
        self.assertEqual(self.run_report([at_end])[0]["distinct_active_new_signups"], 0)
        self.assertEqual(self.run_report([at_end])[0]["separate_counts"]["outside_window"], 1)
        future = {**row, "creation_date": "2026-09-09T00:00:00Z"}
        with self.assertRaises(reporter.ReportError):
            self.run_report([future])
        with self.assertRaises(reporter.ReportError):
            reporter.make_report([row], END, START, SNAPSHOT)
        with self.assertRaises(reporter.ReportError):
            reporter.timestamp("2026-09-01T00:00:00")

    def test_conflicting_duplicate_ids_are_rejected(self):
        row = self.rows[0]
        with self.assertRaises(reporter.ReportError):
            self.run_report([row, {**row, "subscriber_type": "unsubscribed"}])
        report = self.run_report([row, {**row, "email": "different@example.invalid"}])[0]
        self.assertEqual(report["distinct_active_new_signups"], 1)

    def test_retention_requires_two_actual_sends_and_measures_subscription_only(self):
        _, cohort = self.run_report()
        snapshot = reporter.timestamp("2026-09-23T12:00:00Z")
        editions = ["2026-09-12T12:00:00Z", "2026-09-19T12:00:00Z"]
        rows = [dict(row) for row in self.rows if row["id"] != "synthetic-history"]
        for row in rows:
            if row["id"] == "synthetic-dialogue":
                row["subscriber_type"] = "unsubscribed"
        result = reporter.retention_report(rows, cohort, snapshot, editions)
        self.assertEqual(result["cohort_size"], 3)
        self.assertEqual(result["status_counts"], dict(continued_subscription=1, pending=0,
                                                      unsubscribed=1, other_status=0, missing_from_export=1))
        self.assertIn("separate from engagement", result["limit"])
        for invalid in ([], editions[:1], [editions[0], editions[0]],
                        ["2026-09-01T12:00:00Z", editions[1]]):
            with self.assertRaises(reporter.ReportError):
                reporter.retention_report(rows, cohort, snapshot, invalid)

    def test_cli_keeps_private_data_out_of_logs_and_aggregate_report(self):
        with tempfile.TemporaryDirectory(prefix="almanack-report-synthetic-") as directory:
            root = Path(directory)
            source = root / "manual.csv"
            source.write_bytes(FIXTURE.read_bytes())
            tests = root / "known-tests.txt"
            tests.write_text("synthetic-test\n", encoding="utf-8")
            baseline = root / "known-baseline.txt"
            baseline.write_text("synthetic-baseline\n", encoding="utf-8")
            output = root / "report.md"
            cohort = root / "private-cohort.json"
            command = [sys.executable, str(REPO / "scripts/report_almanack_signups.py"),
                       "--input", str(source), "--start", reporter.iso(START), "--end", reporter.iso(END),
                       "--snapshot", reporter.iso(SNAPSHOT), "--output", str(output), "--test-ids", str(tests),
                       "--preexisting-ids", str(baseline), "--test-tag", "synthetic-test-tag", "--cohort-output", str(cohort)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("synthetic-weekend", result.stdout + result.stderr + output.read_text(encoding="utf-8"))
            self.assertNotIn("@example.invalid", result.stdout + result.stderr + output.read_text(encoding="utf-8"))
            self.assertEqual(len(json.loads(cohort.read_text(encoding="utf-8"))["ids"]), 3)
            source.write_text("email\nPRIVATE_PII_SENTINEL@example.invalid\n", encoding="utf-8")
            failed = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(failed.returncode, 2)
            self.assertNotIn("PRIVATE_PII_SENTINEL", failed.stdout + failed.stderr)

    def test_private_paths_reject_git_worktrees_and_schema_rejects_missing_columns(self):
        with tempfile.TemporaryDirectory(prefix="almanack-report-paths-") as directory:
            root = Path(directory)
            (root / ".git").write_text("gitdir: elsewhere", encoding="utf-8")
            with self.assertRaises(reporter.ReportError):
                reporter.private_path(str(root / "private.csv"))
            source = root / "bad.csv"
            source.write_text("id,email\nsynthetic,one@example.invalid\n", encoding="utf-8")
            with self.assertRaises(reporter.ReportError):
                reporter.read_export(source)


if __name__ == "__main__":
    unittest.main()
