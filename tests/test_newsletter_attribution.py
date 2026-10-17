import copy
import csv
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("newsletter_attribution", ROOT / "scripts/newsletter_attribution.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
CODE = "almanack-organic-facebook-weekend-01"
NOW = datetime(2026, 10, 19, 12, tzinfo=timezone.utc)


def subscriber(identity, **updates):
    row = {"subscriber_id": identity, "status": "regular", "is_test": False,
           "is_baseline": False, "campaign_code": CODE, "acquisition_signup_ref": "ref-" + identity,
           "signup_at": "2026-10-10T05:00:00Z", "first_confirmed_at": "2026-10-11T06:00:00Z",
           "first_confirmation_observed_at": "2026-10-11T06:00:01Z", "confirmation_time_known": True}
    row.update(updates)
    return row


def signup(identity, **updates):
    row = {"signup_ref": "ref-" + identity, "subscriber_id": identity, "campaign_code": CODE,
           "accepted_at": "2026-10-10T05:00:00Z", "is_new": True, "is_test": False}
    row.update(updates)
    return row


def snapshot():
    return {"schema_version": 1, "exported_at": "2026-10-19T12:00:00Z", "newsletter_id": "private-newsletter",
            "baseline": {"completed_at": "2026-10-09T12:00:00Z", "gaps": []},
            "health": {"last_reconciliation_success_at": "2026-10-19T10:00:00Z",
                       "last_reconciliation_attempt_at": "2026-10-19T10:00:00Z", "last_reconciliation_error": None,
                       "webhook": {"checked_at": "2026-10-19T11:00:00Z", "status": "healthy", "last_delivery_at": None}},
            "signups": [], "subscribers": [], "events": []}


class ReportingTests(unittest.TestCase):
    def setUp(self):
        self.register = app.load_register()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.db = app.open_store(self.directory / "imports.sqlite")
        self.addCleanup(self.db.close)

    def write_csv(self, rows, name="export.csv"):
        path = self.directory / name
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["campaign_code", "metric", "value", "period_start", "period_end", "bucket_kind"])
            writer.writeheader()
            writer.writerows(rows)
        return path

    def metric(self, **updates):
        row = {"campaign_code": CODE, "metric": "outbound_clicks", "value": 12,
               "period_start": "2026-10-10T00:00:00-04:00", "period_end": "2026-10-17T00:00:00-04:00", "bucket_kind": "interval"}
        row.update(updates)
        return row

    def import_rows(self, rows, tz=app.EASTERN, name="export.csv"):
        return app.import_csv(self.db, self.write_csv(rows, name), "meta", "2026-10-10", "2026-10-17", tz,
                              {r["metric"]: "Provider-defined " + r["metric"] for r in rows}, self.register, NOW)

    def report(self, value=None):
        return app.weekly_report(value or snapshot(), self.register, "2026-10-10", self.db, NOW)

    def test_legacy_register_and_shared_bio_keep_existing_links(self):
        self.assertEqual(75, len(self.register))
        self.assertIn("utm_campaign=almanack-organic", app.campaign_link(self.register, CODE))
        self.assertEqual("channel_link", self.register["almanack-organic-instagram-weekend-bio"]["attribution_scope"])

    def test_dst_weeks_have_correct_utc_lengths_and_saturday_boundary(self):
        spring = app.week_bounds("2026-03-07")
        fall = app.week_bounds("2026-10-31")
        self.assertEqual(167, (spring[1] - spring[0]).total_seconds() / 3600)
        self.assertEqual(169, (fall[1] - fall[0]).total_seconds() / 3600)
        with self.assertRaises(ValueError):
            app.week_bounds("2026-10-11")

    def test_repeated_file_and_identical_rows_do_not_double_count(self):
        first = self.import_rows([self.metric()])
        second = self.import_rows([self.metric()])
        self.assertEqual(1, first["rows_added"])
        self.assertEqual("already_imported", second["status"])
        # Different bytes, same rows: another import receipt, no added metric.
        third = self.import_rows([self.metric(), self.metric()], name="overlapping-export.csv")
        self.assertEqual(0, third["rows_added"])
        self.assertEqual(12, self.report()["campaigns"][0]["metrics"][0]["value"])

    def test_conflicting_overlap_rolls_back_entire_import(self):
        self.import_rows([self.metric()])
        with self.assertRaisesRegex(ValueError, "Overlapping"):
            self.import_rows([self.metric(metric="impressions", value=300), self.metric(value=13)], name="revision.csv")
        self.assertEqual(1, self.db.execute("SELECT COUNT(*) FROM imports").fetchone()[0])
        self.assertEqual(1, self.db.execute("SELECT COUNT(*) FROM metrics").fetchone()[0])

    def test_timezone_mismatched_daily_metrics_stay_visible_but_not_exact_total(self):
        self.import_rows([self.metric(period_start="2026-10-11T00:00:00Z", period_end="2026-10-12T00:00:00Z", bucket_kind="daily")], tz="UTC")
        result = self.report()["campaigns"][0]["metrics"][0]
        self.assertIsNone(result["value"])
        self.assertIn("timezone differs", result["warnings"][0])
        self.assertEqual(12, result["observations"][0]["value"])

    def test_reach_not_summed_across_days(self):
        self.import_rows([self.metric(metric="reach", period_start="2026-10-11T00:00:00-04:00", period_end="2026-10-12T00:00:00-04:00", bucket_kind="daily")])
        metric = self.report()["campaigns"][0]["metrics"][0]
        self.assertIsNone(metric["value"])
        self.assertIn("non-additive", metric["warnings"][0])

    def test_test_baseline_existing_and_unknown_classification_excluded(self):
        value = snapshot()
        value["subscribers"] = [subscriber("new"), subscriber("test", is_test=True), subscriber("old", is_baseline=True), subscriber("unknown", is_test=None)]
        value["signups"] = [signup("new"), signup("test", is_test=True), signup("old"), signup("unknown", is_test=None), signup("existing", is_new=False)]
        row = self.report(value)["campaigns"][0]
        self.assertEqual(1, row["accepted_new_signups"])
        self.assertEqual(1, row["confirmed_this_week"])
        self.assertEqual(1, self.report(value)["audience"]["test_classification_unknown_at_snapshot"])

    def test_known_confirmation_boundary_and_delayed_cohort(self):
        value = snapshot()
        value["subscribers"] = [subscriber("delayed", first_confirmed_at="2026-10-17T04:00:00Z"), subscriber("earlier", signup_at="2026-10-01T12:00:00Z")]
        value["signups"] = [signup("delayed"), signup("earlier", accepted_at="2026-10-01T12:00:00Z")]
        row = self.report(value)["campaigns"][0]
        self.assertEqual(1, row["accepted_new_signups"])
        self.assertEqual(1, row["confirmed_this_week"])
        self.assertEqual(1, row["eventual_confirmations_from_week_signups"])
        self.assertEqual(1.0, row["cohort_confirmation_rate"])

    def test_unknown_confirmation_time_is_observation_not_signup_date(self):
        value = snapshot()
        value["subscribers"] = [subscriber("missed", first_confirmed_at=None, confirmation_time_known=False, first_confirmation_observed_at="2026-10-12T10:00:00Z")]
        value["signups"] = [signup("missed")]
        row = self.report(value)["campaigns"][0]
        self.assertEqual(0, row["confirmed_this_week"])
        self.assertEqual(1, row["confirmations_observed_this_week_time_unknown"])
        self.assertEqual(1, row["eventual_confirmations_from_week_signups"])

    def test_duplicate_records_and_unsubscribe_preserve_acquisition(self):
        value = snapshot()
        value["subscribers"] = [subscriber("once", status="unsubscribed")]
        value["signups"] = [signup("once"), signup("once")]
        event = {"event_id": "private-event", "subscriber_id": "once", "type": "unsubscribed", "occurred_at": "2026-10-15T12:00:00Z", "observed_at": "2026-10-15T12:00:01Z", "event_time_known": True}
        value["events"] = [event, copy.deepcopy(event)]
        result = self.report(value)
        self.assertEqual(1, result["campaigns"][0]["confirmed_this_week"])
        self.assertEqual(1, result["audience"]["unsubscribers_this_week"])
        self.assertEqual(0, result["audience"]["active_non_test_at_snapshot"])

    def test_pending_unknown_attribution_and_private_ids_not_in_report(self):
        value = snapshot()
        value["subscribers"] = [subscriber("PRIVATE-SUB-ID", campaign_code=None, status="unactivated", first_confirmed_at=None, first_confirmation_observed_at=None, confirmation_time_known=False)]
        value["signups"] = [signup("PRIVATE-SUB-ID", campaign_code=None)]
        result = self.report(value)
        self.assertEqual("unknown", result["campaigns"][0]["campaign_code"])
        self.assertEqual(1, result["campaigns"][0]["pending_from_week_signups"])
        self.assertNotIn("PRIVATE-SUB-ID", json.dumps(result))
        self.assertNotIn("private-newsletter", json.dumps(result))

    def test_failed_reconciliation_keeps_snapshot_count_and_flags_stale_health(self):
        value = snapshot()
        value["subscribers"] = [subscriber("old")]
        value["health"]["last_reconciliation_success_at"] = "2026-10-01T10:00:00Z"
        value["health"]["last_reconciliation_error"] = "network-error"
        value["health"]["webhook"] = {"status": "disabled"}
        result = self.report(value)
        self.assertEqual(1, result["audience"]["active_non_test_at_snapshot"])
        self.assertTrue(result["health"]["reconciliation_stale"])
        self.assertTrue(result["health"]["webhook_health_stale"])

    def test_missing_or_private_data_rejected_instead_of_zeroed(self):
        value = snapshot()
        del value["subscribers"]
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            self.report(value)
        value = snapshot()
        value["email"] = "do-not-store@example.invalid"
        with self.assertRaisesRegex(ValueError, "prohibited"):
            self.report(value)

    def test_reserved_outcome_does_not_break_report_or_become_accepted_signup(self):
        value = snapshot()
        value["signups"] = [signup("reserved", accepted_at=None, is_new=False)]
        value["health"]["webhook"]["status"] = "enabled"
        result = self.report(value)
        self.assertEqual(1, result["unresolved_signup_outcomes_at_snapshot"])
        self.assertEqual([], result["campaigns"])
        self.assertFalse(any("Webhook health" in warning for warning in result["warnings"]))

    def test_definitive_rejection_is_separate_from_unknown_outcome(self):
        value = snapshot()
        value["signups"] = [signup("rejected", accepted_at=None, is_new=False, outcome="rejected")]
        result = self.report(value)
        self.assertEqual(0, result["unresolved_signup_outcomes_at_snapshot"])
        self.assertEqual(1, result["rejected_signup_attempts_at_snapshot"])
        self.assertEqual([], result["campaigns"])

    def test_dated_unsubscribe_does_not_erase_unlinked_unknown_observation(self):
        value = snapshot()
        value["subscribers"] = [subscriber("recovered", status="unsubscribed")]
        event = {"event_id": "unknown-evidence", "subscriber_id": "recovered", "type": "unsubscribed",
                 "occurred_at": None, "observed_at": "2026-10-12T10:00:00Z", "event_time_known": False}
        value["events"] = [event, {**event, "event_id": "dated-evidence", "occurred_at": "2026-10-11T12:00:00Z", "event_time_known": True}]
        audience = self.report(value)["audience"]
        self.assertEqual(1, audience["unsubscribers_this_week"])
        self.assertEqual(1, audience["unsubscribers_observed_time_unknown"])

    def test_subscribed_billing_states_are_active_and_unknown_states_are_not(self):
        value = snapshot()
        states = ["regular", "premium", "gifted", "trialed", "churning", "churned", "paused", "past_due", "unpaid", "upcoming"]
        value["subscribers"] = [subscriber(state, status=state) for state in states]
        self.assertEqual(8, self.report(value)["audience"]["active_non_test_at_snapshot"])

    def test_historical_dated_unsubscribe_does_not_hide_later_unknown_observation(self):
        value = snapshot()
        value["subscribers"] = [subscriber("returned", status="unsubscribed")]
        value["events"] = [
            {"event_id": "old-cycle", "subscriber_id": "returned", "type": "unsubscribed",
             "occurred_at": "2026-09-01T12:00:00Z", "observed_at": "2026-09-01T12:00:01Z", "event_time_known": True},
            {"event_id": "later-cycle", "subscriber_id": "returned", "type": "unsubscribed",
             "occurred_at": None, "observed_at": "2026-10-12T12:00:00Z", "event_time_known": False}]
        audience = self.report(value)["audience"]
        self.assertEqual(0, audience["unsubscribers_this_week"])
        self.assertEqual(1, audience["unsubscribers_observed_time_unknown"])

    def test_retention_keeps_signup_cohort_and_unsubscribe_memberships_without_details(self):
        value = snapshot()
        value["subscribers"] = [subscriber("retained", status="unsubscribed", acquisition_accepted_at="2026-10-10T05:00:00Z")]
        value["signups"] = [signup("retained")]
        value["events"] = [{"event_id": "known", "subscriber_id": "retained", "type": "unsubscribed",
                            "occurred_at": "2026-10-11T12:00:00Z", "observed_at": "2026-10-12T12:00:00Z", "event_time_known": True},
                           {"event_id": "later-unknown", "subscriber_id": "retained", "type": "unsubscribed",
                            "occurred_at": None, "observed_at": "2026-10-13T12:00:00Z", "event_time_known": False}]
        before = self.report(value)
        value["signups"], value["events"] = [], []
        value["aggregates"] = {"schema_version": 1, "historical": [], "subscriber_weeks": [{
            "subscriber_id": "retained", "week_start": "2026-10-10", "unsubscribed": 1, "unsubscribe_unknown": 1,
            "last_dated_observed_at": "2026-10-12T12:00:00Z", "last_unknown_observed_at": "2026-10-13T12:00:00Z"}]}
        after = self.report(value)
        self.assertEqual(before["campaigns"], after["campaigns"])
        self.assertEqual(before["audience"], after["audience"])
        self.assertNotIn("retained", json.dumps(after))
        value["events"] = [{"event_id": "repair", "subscriber_id": "retained", "type": "unsubscribed",
                            "occurred_at": "2026-10-13T10:00:00Z", "observed_at": "2026-10-14T12:00:00Z", "event_time_known": True}]
        self.assertEqual(1, self.report(value)["audience"]["unsubscribers_observed_time_unknown"])

    def test_later_dated_cycle_cannot_erase_earlier_unknown_week(self):
        value = snapshot()
        value["subscribers"] = [subscriber("cycled", status="unsubscribed")]
        value["events"] = [
            {"event_id": "first-cycle", "subscriber_id": "cycled", "type": "unsubscribed",
             "occurred_at": None, "observed_at": "2026-06-05T12:00:00Z", "event_time_known": False},
            {"event_id": "second-cycle", "subscriber_id": "cycled", "type": "unsubscribed",
             "occurred_at": "2026-06-20T12:00:00Z", "observed_at": "2026-06-20T12:00:01Z", "event_time_known": True}]
        result = app.weekly_report(value, self.register, "2026-05-30", self.db, NOW)
        self.assertEqual(1, result["audience"]["unsubscribers_observed_time_unknown"])
        self.assertEqual(0, result["audience"]["unsubscribers_this_week"])

    def test_deleted_subscriber_anonymous_aggregates_preserve_historical_conversion(self):
        value = snapshot()
        value["aggregates"] = {"schema_version": 1, "subscriber_weeks": [], "historical": [
            {"week_start": "2026-10-10", "campaign_code": CODE, "metric": "accepted_new_signups", "value": 2},
            {"week_start": "2026-10-10", "campaign_code": CODE, "metric": "eventual_confirmations_from_week_signups", "value": 1},
            {"week_start": "2026-10-10", "campaign_code": CODE, "metric": "deleted_unconfirmed_from_week_signups", "value": 1},
            {"week_start": "2026-10-10", "campaign_code": CODE, "metric": "confirmed_this_week", "value": 1},
            {"week_start": "2026-10-10", "campaign_code": "", "metric": "unsubscribers_this_week", "value": 1}]}
        result = self.report(value)
        campaign = result["campaigns"][0]
        self.assertEqual(2, campaign["accepted_new_signups"])
        self.assertEqual(0.5, campaign["cohort_confirmation_rate"])
        self.assertEqual(1, campaign["deleted_unconfirmed_from_week_signups"])
        self.assertEqual(1, campaign["confirmed_this_week"])
        self.assertEqual(1, result["audience"]["unsubscribers_this_week"])
        self.assertEqual(0, result["audience"]["active_non_test_at_snapshot"])

    def test_retained_acquisition_timestamp_wins_over_a_later_retry_timestamp(self):
        value = snapshot()
        value["subscribers"] = [subscriber("old", acquisition_accepted_at="2026-10-01T05:00:00Z")]
        value["signups"] = [signup("old")]
        row = self.report(value)["campaigns"][0]
        self.assertEqual(0, row["accepted_new_signups"])
        self.assertIsNone(row["cohort_confirmation_rate"])


if __name__ == "__main__":
    unittest.main()
