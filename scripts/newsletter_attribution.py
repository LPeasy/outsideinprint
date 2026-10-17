#!/usr/bin/env python3
"""Offline newsletter campaign links, deduplicated CSV imports, and weekly reports.

Only the campaign register belongs in version control. Keep snapshots/imports in
the ignored output directory or another access-controlled local directory.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import sqlite3
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit

UTC = timezone.utc
EASTERN = "America/New_York"
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGISTER = ROOT / "data/newsletter_campaigns.json"
PLATFORMS = {"facebook", "instagram", "linkedin", "pinterest", "x"}
METRICS = {"meta": {"reach", "impressions", "outbound_clicks"},
           "pinterest": {"reach", "impressions", "outbound_clicks"},
           "goatcounter": {"page_visits"}}
CODE = re.compile(r"^[a-z0-9][a-z0-9-]{0,119}$")
FORBIDDEN_KEYS = {"email", "email_address", "email_hash", "ip", "ip_address",
                  "raw_body", "raw_request_body", "referrer", "referring_url"}


def utc_now():
    return datetime.now(UTC)


def iso(value):
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError("Timestamp must be an ISO 8601 string with an offset")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timestamp must include an explicit UTC offset")
    return result.astimezone(UTC)


def eastern_midnight(day):
    """Eastern midnight, including Windows installs without an IANA tz database.

    US rules from 2007 onward: second Sunday in March, first Sunday in November.
    Midnight on either transition Sunday precedes its 02:00 clock change.
    Restrict the fallback range instead of inventing older historical rules.
    """
    try:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        return datetime.combine(day, time(), ZoneInfo(EASTERN)).astimezone(UTC)
    except ZoneInfoNotFoundError:
        if not 2007 <= day.year <= 2099:
            raise ValueError("Install IANA timezone data for dates outside 2007–2099")
        march = date(day.year, 3, 1)
        november = date(day.year, 11, 1)
        start = march + timedelta(days=(6 - march.weekday()) % 7 + 7)
        end = november + timedelta(days=(6 - november.weekday()) % 7)
        offset = -4 if start < day <= end else -5
        return datetime.combine(day, time(), timezone(timedelta(hours=offset))).astimezone(UTC)


def week_bounds(week_start):
    start = date.fromisoformat(week_start)
    if start.weekday() != 5:
        raise ValueError("--week-start must be a Saturday in America/New_York")
    return eastern_midnight(start), eastern_midnight(start + timedelta(days=7))


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def load_register(path=DEFAULT_REGISTER):
    data = load_json(path)
    if data.get("schema_version") != 1 or not isinstance(data.get("campaigns"), list):
        raise ValueError("Unsupported campaign register")
    result, tuples = {}, set()
    for item in data["campaigns"]:
        code = item.get("code", "")
        fields = ("utm_campaign", "utm_source", "utm_medium", "utm_content")
        values = tuple(item.get(field, "") for field in fields)
        if not CODE.fullmatch(code) or code in result or values in tuples:
            raise ValueError("Invalid or duplicate campaign code/tracking tuple")
        if item.get("platform") not in PLATFORMS or item["utm_source"] != item["platform"]:
            raise ValueError("Campaign source must match the registered platform")
        if item.get("utm_medium") != "organic_social" or not all(re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,119}", v) for v in values):
            raise ValueError("Campaign tracking values are outside the allowlist")
        target = urlsplit(item.get("destination", ""))
        if (target.scheme != "https" or target.netloc != "outsideinprint.org" or
                target.query or target.fragment or target.path != item.get("landing_path") or
                not re.fullmatch(r"/[a-z0-9/_-]*", target.path)):
            raise ValueError("Destination must be a clean canonical OIP path")
        if item.get("attribution_scope") not in {"post", "channel_link"}:
            raise ValueError("Campaign attribution scope is required")
        if item["utm_content"].endswith("-bio") and item["attribution_scope"] != "channel_link":
            raise ValueError("Shared bio links cannot claim post attribution")
        if not item.get("legacy") and item["utm_campaign"] != code:
            raise ValueError("New campaigns require their own unique utm_campaign")
        for field in ("format", "title", "scheduled_at", "published_permalink", "batch"):
            if field not in item:
                raise ValueError("Campaign register metadata is incomplete")
        result[code] = item
        tuples.add(values)
    return result


def campaign_link(register, code):
    item = register[code]
    return item["destination"] + "?" + urlencode({name: item[name] for name in (
        "utm_source", "utm_medium", "utm_campaign", "utm_content")})


def open_store(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS imports (
          id INTEGER PRIMARY KEY, source TEXT NOT NULL, file_sha256 TEXT NOT NULL,
          date_start TEXT NOT NULL, date_end TEXT NOT NULL, timezone TEXT NOT NULL,
          definitions_json TEXT NOT NULL, imported_at TEXT NOT NULL,
          UNIQUE(source, file_sha256));
        CREATE TABLE IF NOT EXISTS metrics (
          import_id INTEGER NOT NULL REFERENCES imports(id), campaign_code TEXT NOT NULL,
          source TEXT NOT NULL, metric TEXT NOT NULL, value INTEGER NOT NULL CHECK(value>=0),
          period_start TEXT NOT NULL, period_end TEXT NOT NULL, bucket_kind TEXT NOT NULL,
          timezone TEXT NOT NULL, definition TEXT NOT NULL,
          UNIQUE(source,campaign_code,metric,period_start,period_end,timezone));
    """)
    return db


def import_csv(db, csv_path, source, date_start, date_end, source_timezone, definitions,
               register, now=None):
    """Import a normalized provider export transactionally; never add overlapping rows."""
    if source not in METRICS:
        raise ValueError("Unsupported import source")
    if date.fromisoformat(date_start) >= date.fromisoformat(date_end):
        raise ValueError("Import date_end must be exclusive and after date_start")
    if not re.fullmatch(r"[A-Za-z_]+(?:/[A-Za-z_+-]+)*|UTC[+-]\d{2}:\d{2}", source_timezone):
        raise ValueError("Record an IANA timezone name or explicit UTC offset")
    if not definitions or any(k not in METRICS[source] or not isinstance(v, str) or not v.strip()
                              for k, v in definitions.items()):
        raise ValueError("Every imported metric needs its provider definition")
    raw = Path(csv_path).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    definitions_json = json.dumps(definitions, sort_keys=True)
    old = db.execute("SELECT * FROM imports WHERE source=? AND file_sha256=?", (source, digest)).fetchone()
    provenance = (date_start, date_end, source_timezone, definitions_json)
    if old:
        if tuple(old[k] for k in ("date_start", "date_end", "timezone", "definitions_json")) != provenance:
            raise ValueError("The same file already has different provenance; review the original import")
        return {"status": "already_imported", "rows_added": 0, "file_sha256": digest}
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    expected = {"campaign_code", "metric", "value", "period_start", "period_end", "bucket_kind"}
    if set(reader.fieldnames or []) != expected:
        raise ValueError("CSV must contain exactly: " + ",".join(sorted(expected)))
    rows = []
    for row in reader:
        if row["campaign_code"] not in register or row["metric"] not in definitions:
            raise ValueError("CSV contains an unknown campaign or undefined metric")
        platform = register[row["campaign_code"]]["platform"]
        if (source == "meta" and platform not in {"facebook", "instagram"}) or (source == "pinterest" and platform != "pinterest"):
            raise ValueError("Provider metrics do not match the campaign's platform")
        if not re.fullmatch(r"\d+", row["value"] or "") or row["bucket_kind"] not in {"daily", "interval"}:
            raise ValueError("CSV needs non-negative integer counts and daily/interval bucket_kind")
        start, end = timestamp(row["period_start"]), timestamp(row["period_end"])
        if start >= end:
            raise ValueError("Metric interval must have an exclusive ending boundary")
        # The supplied local dates are provenance, not reconstructed UTC dates.
        local_start = datetime.fromisoformat(row["period_start"].replace("Z", "+00:00")).replace(tzinfo=None)
        local_end = datetime.fromisoformat(row["period_end"].replace("Z", "+00:00")).replace(tzinfo=None)
        if not (datetime.fromisoformat(date_start) <= local_start < local_end <= datetime.fromisoformat(date_end)):
            raise ValueError("CSV interval falls outside its declared local date range")
        if row["bucket_kind"] == "daily":
            if local_start.time() != time() or local_end != local_start + timedelta(days=1):
                raise ValueError("Daily rows must span exactly one source-calendar day")
            if source_timezone == EASTERN and (start != eastern_midnight(local_start.date()) or end != eastern_midnight(local_end.date())):
                raise ValueError("Daily Eastern bucket offsets disagree with the timezone")
            if source_timezone == "UTC" and (start.hour or end.hour or start.minute or end.minute):
                raise ValueError("Daily UTC buckets must begin and end at UTC midnight")
        rows.append((row["campaign_code"], source, row["metric"], int(row["value"]),
                     iso(start), iso(end), row["bucket_kind"], source_timezone, definitions[row["metric"]]))
    if not rows:
        raise ValueError("Empty import does not establish zero activity")
    added = 0
    with db:
        cursor = db.execute("INSERT INTO imports(source,file_sha256,date_start,date_end,timezone,definitions_json,imported_at) VALUES(?,?,?,?,?,?,?)",
                            (source, digest, *provenance, iso(now or utc_now())))
        for row in rows:
            code, provider, metric, value, start, end, kind, tz, definition = row
            overlaps = db.execute("SELECT * FROM metrics WHERE source=? AND campaign_code=? AND metric=? AND period_start<? AND period_end>?",
                                  (provider, code, metric, end, start)).fetchall()
            if overlaps:
                if len(overlaps) == 1 and tuple(overlaps[0][k] for k in (
                        "campaign_code", "source", "metric", "value", "period_start", "period_end", "bucket_kind", "timezone", "definition")) == row:
                    continue
                raise ValueError("Overlapping or revised metrics require review; no rows imported")
            db.execute("INSERT INTO metrics VALUES(?,?,?,?,?,?,?,?,?,?)", (cursor.lastrowid, *row))
            added += 1
    return {"status": "imported", "rows_added": added, "file_sha256": digest}


def validate_snapshot(snapshot):
    def private_keys(value):
        if isinstance(value, dict):
            if FORBIDDEN_KEYS.intersection(value):
                raise ValueError("Snapshot contains prohibited private fields")
            for child in value.values():
                private_keys(child)
        elif isinstance(value, list):
            for child in value:
                private_keys(child)
    private_keys(snapshot)
    if snapshot.get("schema_version") != 1:
        raise ValueError("Unsupported ledger snapshot")
    timestamp(snapshot.get("exported_at"))
    for name in ("signups", "subscribers", "events"):
        if not isinstance(snapshot.get(name), list):
            raise ValueError("Incomplete snapshot; absent ledger data cannot become zero counts")
    if not isinstance(snapshot.get("health"), dict) or not isinstance(snapshot.get("baseline"), dict):
        raise ValueError("Snapshot health and baseline are required")
    unique = {}
    for name, key in (("subscribers", "subscriber_id"), ("signups", "signup_ref"), ("events", "event_id")):
        unique[name] = {}
        for item in snapshot[name]:
            if not item.get(key):
                raise ValueError("Ledger row is missing its private identity")
            if item[key] in unique[name] and unique[name][item[key]] != item:
                raise ValueError("Conflicting duplicate ledger identity")
            unique[name][item[key]] = item
    for item in unique["subscribers"].values():
        for flag in ("is_baseline", "confirmation_time_known"):
            if type(item.get(flag)) is not bool:
                raise ValueError("Subscriber flags must be explicit booleans")
        if "is_test" not in item or (item["is_test"] is not None and type(item["is_test"]) is not bool):
            raise ValueError("Test classification must be true, false, or explicitly unreviewed null")
        if item["confirmation_time_known"] and not item.get("first_confirmed_at"):
            raise ValueError("Known confirmation time needs timestamp evidence")
    for item in unique["signups"].values():
        if type(item.get("is_new")) is not bool or "is_test" not in item or (item["is_test"] is not None and type(item["is_test"]) is not bool):
            raise ValueError("Signup flags must be explicit booleans")
        if item.get("accepted_at") is not None:
            timestamp(item["accepted_at"])
        elif item["is_new"]:
            raise ValueError("Accepted new signup requires a provider acceptance timestamp")
    aggregates = snapshot.get("aggregates")
    if aggregates is not None:
        if aggregates.get("schema_version") != 1 or not isinstance(aggregates.get("subscriber_weeks"), list) or not isinstance(aggregates.get("historical"), list):
            raise ValueError("Unsupported retention aggregate contract")
        aggregate_keys = set()
        for row in aggregates["historical"]:
            key = (row.get("week_start"), row.get("campaign_code"), row.get("metric"))
            if key in aggregate_keys or type(row.get("value")) is not int or row["value"] < 0:
                raise ValueError("Invalid or duplicate historical aggregate")
            week_bounds(row["week_start"])
            aggregate_keys.add(key)
    return {name: list(items.values()) for name, items in unique.items()}


def health_report(snapshot, now):
    health = snapshot["health"]
    last = health.get("last_reconciliation_success_at")
    stale = last is None or now - timestamp(last) >= timedelta(hours=36)
    webhook = health.get("webhook") or {}
    checked = webhook.get("checked_at")
    webhook_stale = checked is None or now - timestamp(checked) >= timedelta(hours=2)
    # Select only operational fields; never copy provider error bodies or IDs.
    return {"last_reconciliation_success_at": last, "reconciliation_stale": stale,
            "last_reconciliation_attempt_at": health.get("last_reconciliation_attempt_at"),
            "last_reconciliation_failed": bool(health.get("last_reconciliation_error")),
            "webhook_status": webhook.get("status", "unknown"),
            "webhook_checked_at": checked, "webhook_health_stale": webhook_stale,
            "webhook_last_delivery_at": webhook.get("last_delivery_at"),
            "webhook_recent_failed_attempts": webhook.get("recent_failed_attempts"),
            "webhook_last_successful_delivery_at": webhook.get("last_successful_delivery_at")}


def baseline_report(snapshot, now=None):
    rows = validate_snapshot(snapshot)
    subscribers = rows["subscribers"]
    baseline = [s for s in subscribers if s["is_baseline"]]
    gaps = list(snapshot["baseline"].get("gaps", []))
    if not snapshot["baseline"].get("completed_at"):
        gaps.append("Baseline import has not been verified complete; rollout remains gated.")
    return {"schema_version": 1, "generated_at": iso(now or utc_now()),
            "snapshot_exported_at": snapshot["exported_at"],
            "baseline_completed_at": snapshot["baseline"].get("completed_at"),
            "baseline_records": len(baseline), "known_test_records": sum(s["is_test"] is True for s in subscribers),
            "test_classification_unknown_records": sum(s["is_test"] is None for s in subscribers),
            "baseline_historical_source_unknown": sum(not s.get("campaign_code") for s in baseline),
            "baseline_signup_date_unknown": sum(not s.get("signup_at") for s in baseline),
            "gaps": gaps, "health": health_report(snapshot, now or utc_now())}


def weekly_report(snapshot, register, week_start, db=None, now=None):
    now = now or utc_now()
    data = validate_snapshot(snapshot)
    start, end = week_bounds(week_start)
    in_week = lambda value: bool(value) and start <= timestamp(value) < end
    subscribers = {s["subscriber_id"]: s for s in data["subscribers"]}
    aggregates = snapshot.get("aggregates") or {"subscriber_weeks": [], "historical": []}
    campaigns = {}
    def group(code):
        key = code if code in register else "unknown"
        if key not in campaigns:
            item = register.get(key, {})
            campaigns[key] = {"campaign_code": key, "platform": item.get("platform"),
                              "attribution_scope": item.get("attribution_scope", "unknown"),
                              "accepted_new_signups": 0, "confirmed_this_week": 0,
                              "confirmations_observed_this_week_time_unknown": 0,
                              "eventual_confirmations_from_week_signups": 0,
                              "pending_from_week_signups": 0,
                              "pending_at_snapshot": 0,
                              "deleted_unconfirmed_from_week_signups": 0,
                              "cohort_confirmation_rate": None, "metrics": []}
        return campaigns[key]
    cohort = set()
    attempts = [s for s in data["signups"] if s.get("accepted_at")]
    accepted_refs = {s["signup_ref"] for s in attempts if s["is_new"]}
    for sub in subscribers.values():
        if sub.get("acquisition_accepted_at") and sub.get("acquisition_signup_ref") not in accepted_refs:
            attempts.append({"signup_ref": sub.get("acquisition_signup_ref") or sub["subscriber_id"],
                             "subscriber_id": sub["subscriber_id"], "campaign_code": sub.get("campaign_code"),
                             "accepted_at": sub["acquisition_accepted_at"], "is_new": True, "is_test": sub["is_test"]})
    for signup in sorted(attempts, key=lambda s: timestamp(s["accepted_at"])):
        sub = subscribers.get(signup.get("subscriber_id"))
        if sub and sub.get("acquisition_accepted_at") and sub.get("acquisition_signup_ref") == signup["signup_ref"]:
            signup = {**signup, "accepted_at": sub["acquisition_accepted_at"]}
        identity = signup.get("subscriber_id") or signup["signup_ref"]
        if (not signup["is_new"] or signup["is_test"] is not False or (sub and (sub["is_test"] is not False or sub["is_baseline"])) or
                not in_week(signup["accepted_at"]) or identity in cohort):
            continue
        # A later retry must not invent a different signup cohort or campaign.
        if sub and sub.get("acquisition_signup_ref") and sub["acquisition_signup_ref"] != signup["signup_ref"]:
            continue
        cohort.add(identity)
        item = group(sub.get("campaign_code") if sub else signup.get("campaign_code"))
        item["accepted_new_signups"] += 1
        confirmed = sub and (sub.get("first_confirmed_at") or sub.get("first_confirmation_observed_at"))
        if confirmed:
            item["eventual_confirmations_from_week_signups"] += 1
        elif sub and sub.get("status") in {"unactivated", "pending", "pending_confirmation"}:
            item["pending_from_week_signups"] += 1
    for sub in subscribers.values():
        if sub["is_test"] is not False or sub["is_baseline"]:
            continue
        item = group(sub.get("campaign_code"))
        if sub.get("status") in {"unactivated", "pending", "pending_confirmation"}:
            item["pending_at_snapshot"] += 1
        if sub["confirmation_time_known"] and in_week(sub.get("first_confirmed_at")):
            item["confirmed_this_week"] += 1
        elif not sub["confirmation_time_known"] and in_week(sub.get("first_confirmation_observed_at")):
            item["confirmations_observed_this_week_time_unknown"] += 1
    warnings = []
    provenance = []
    if db is not None:
        metrics = db.execute("SELECT * FROM metrics WHERE period_start<? AND period_end>? ORDER BY source,metric,period_start",
                             (iso(end), iso(start))).fetchall()
        groups = {}
        import_ids = set()
        for metric in metrics:
            import_ids.add(metric["import_id"])
            key = (metric["campaign_code"], metric["source"], metric["metric"])
            groups.setdefault(key, []).append(metric)
        for (code, source, metric), observations in groups.items():
            value, reasons = None, []
            if any(o["bucket_kind"] == "daily" and o["timezone"] != EASTERN for o in observations):
                reasons.append("Daily provider timezone differs from America/New_York; buckets cannot be precisely converted.")
            if any(timestamp(o["period_start"]) < start or timestamp(o["period_end"]) > end for o in observations):
                reasons.append("Provider interval crosses a report boundary; no proportional estimate applied.")
            if metric == "reach" and not (len(observations) == 1 and timestamp(observations[0]["period_start"]) == start and timestamp(observations[0]["period_end"]) == end):
                reasons.append("Reach is non-additive; a provider total for the exact week is required.")
            if len({o["definition"] for o in observations}) > 1:
                reasons.append("Metric definitions changed within this report window.")
            covered = sum((timestamp(o["period_end"]) - timestamp(o["period_start"])).total_seconds() for o in observations)
            complete = covered == (end - start).total_seconds() and not reasons
            if not reasons:
                value = sum(o["value"] for o in observations)
            group(code)["metrics"].append({"source": source, "metric": metric, "value": value,
                "coverage": "complete" if complete else "partial_or_incompatible", "warnings": reasons,
                "observations": [{k: o[k] for k in ("value", "period_start", "period_end", "bucket_kind", "timezone", "definition")} for o in observations]})
        for import_id in sorted(import_ids):
            item = db.execute("SELECT * FROM imports WHERE id=?", (import_id,)).fetchone()
            provenance.append({k: item[k] for k in ("source", "file_sha256", "date_start", "date_end", "timezone", "imported_at")})
    else:
        warnings.append("No provider CSV store supplied; traffic metrics are unavailable, not zero.")
    historical_audience = {"unsubscribers_this_week": 0, "unsubscribers_observed_time_unknown": 0}
    historical_metrics = {"accepted_new_signups", "confirmed_this_week", "confirmations_observed_this_week_time_unknown",
                          "eventual_confirmations_from_week_signups", "deleted_unconfirmed_from_week_signups"}
    for row in aggregates["historical"]:
        if row["week_start"] != week_start:
            continue
        if row["metric"] in historical_audience:
            historical_audience[row["metric"]] += row["value"]
        elif row["metric"] in historical_metrics:
            group(row["campaign_code"])[row["metric"]] += row["value"]
    for item in campaigns.values():
        count = item["accepted_new_signups"]
        if count:
            item["cohort_confirmation_rate"] = item["eventual_confirmations_from_week_signups"] / count
    eligible_events = [e for e in data["events"] if e.get("type") == "unsubscribed" and
                       e.get("subscriber_id") in subscribers and subscribers[e["subscriber_id"]]["is_test"] is False]
    unsubs = {e["subscriber_id"] for e in eligible_events if e.get("event_time_known") is True and in_week(e.get("occurred_at"))}
    eligible_facts = [row for row in aggregates["subscriber_weeks"] if
                      row.get("subscriber_id") in subscribers and subscribers[row["subscriber_id"]]["is_test"] is False]
    for fact in eligible_facts:
        if fact["week_start"] == week_start and fact.get("unsubscribed"):
            unsubs.add(fact["subscriber_id"])
    unknown_unsubs = {e["subscriber_id"] for e in eligible_events if e.get("event_time_known") is False and in_week(e.get("observed_at"))}
    for fact in eligible_facts:
        if fact["week_start"] == week_start and fact.get("unsubscribe_unknown"):
            unknown_unsubs.add(fact["subscriber_id"])
    health = health_report(snapshot, now)
    if any(s["is_test"] is None for s in subscribers.values()):
        warnings.append("Unreviewed test classifications are excluded from non-test acquisition and audience counts; those totals are incomplete.")
    if health["reconciliation_stale"] or health["last_reconciliation_failed"]:
        warnings.append("Ledger reconciliation is stale or failed; counts are a dated snapshot, not current provider totals.")
    if health["webhook_health_stale"] or health["webhook_status"] not in {"healthy", "enabled"}:
        warnings.append("Webhook health is unverified or unhealthy; silence does not establish healthy delivery.")
    if timestamp(snapshot["exported_at"]) < end:
        warnings.append("Snapshot predates the week ending boundary; this week is incomplete.")
    return {"schema_version": 1, "generated_at": iso(now), "snapshot_exported_at": snapshot["exported_at"],
            "week_start": week_start, "timezone": EASTERN, "start_inclusive_utc": iso(start),
            "end_exclusive_utc": iso(end), "health": health,
            "unresolved_signup_outcomes_at_snapshot": sum(s.get("accepted_at") is None and s.get("outcome") != "rejected" for s in data["signups"]),
            "rejected_signup_attempts_at_snapshot": sum(s.get("outcome") == "rejected" for s in data["signups"]),
            "audience": {"active_non_test_at_snapshot": sum(s["is_test"] is False and s.get("status") in {"regular", "active", "premium", "gifted", "trialed", "churning", "churned", "paused", "past_due"} for s in subscribers.values()),
                         "test_classification_unknown_at_snapshot": sum(s["is_test"] is None for s in subscribers.values()),
                         "unsubscribed_non_test_at_snapshot": sum(s["is_test"] is False and s.get("status") == "unsubscribed" for s in subscribers.values()),
                         "unsubscribers_this_week": len(unsubs) + historical_audience["unsubscribers_this_week"],
                         "unsubscribers_observed_time_unknown": len(unknown_unsubs) + historical_audience["unsubscribers_observed_time_unknown"]},
            "campaigns": [campaigns[k] for k in sorted(campaigns)], "imports": provenance,
            "warnings": warnings, "definitions": {
                "confirmed_this_week": "First confirmed non-test, non-baseline acquisitions with a known confirmation timestamp in the week.",
                "cohort_confirmation_rate": "Eventual confirmed acquisitions from this week's accepted new signups divided by accepted new signups, as of the snapshot.",
                "unknown": "No verified campaign mapping; historical sources are not guessed.",
                "page_visits": "Provider campaign page visits; not unique people. Never add to platform clicks.",
                "unsubscribe_groups": "Known-time unsubscribe and unknown-time observation groups can overlap. A later dated event does not prove the same cycle. Do not add these groups.",
                "missing_metrics": "An absent provider/metric is unavailable, not zero."}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--register", type=Path, default=DEFAULT_REGISTER)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("validate-register")
    link = commands.add_parser("link")
    link.add_argument("code")
    imp = commands.add_parser("import-csv")
    imp.add_argument("--csv", required=True, type=Path)
    imp.add_argument("--db", required=True, type=Path)
    imp.add_argument("--source", required=True, choices=sorted(METRICS))
    for arg in ("date-start", "date-end", "timezone"):
        imp.add_argument("--" + arg, required=True)
    imp.add_argument("--definitions", required=True, type=Path, help="JSON object mapping metric names to provider definitions")
    for name in ("report", "baseline"):
        cmd = commands.add_parser(name)
        cmd.add_argument("--ledger", required=True, type=Path)
        cmd.add_argument("--output", type=Path)
        if name == "report":
            cmd.add_argument("--db", type=Path)
            cmd.add_argument("--week-start", required=True)
    args = parser.parse_args(argv)
    try:
        register = load_register(args.register)
        if args.command == "validate-register":
            result = {"status": "valid", "campaigns": len(register)}
        elif args.command == "link":
            print(campaign_link(register, args.code))
            return 0
        elif args.command == "import-csv":
            with open_store(args.db) as db:
                result = import_csv(db, args.csv, args.source, args.date_start, args.date_end,
                                    args.timezone, load_json(args.definitions), register)
        elif args.command == "baseline":
            result = baseline_report(load_json(args.ledger))
        else:
            db = None
            if args.db:
                if not args.db.is_file():
                    raise ValueError("CSV store does not exist; do not replace missing data with an empty store")
                db = sqlite3.connect(f"file:{args.db.resolve().as_posix()}?mode=ro", uri=True)
                db.row_factory = sqlite3.Row
            try:
                result = weekly_report(load_json(args.ledger), register, args.week_start, db)
            finally:
                if db is not None:
                    db.close()
        output = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
        if getattr(args, "output", None):
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output, encoding="utf-8")
        else:
            print(output, end="")
        return 0
    except (ValueError, KeyError, OSError, sqlite3.Error) as error:
        # Errors describe validation rules, never echo raw provider content.
        parser.exit(2, f"Error: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
