"""On-demand aggregate reporting from a manual Buttondown subscriber CSV.

No API, credentials, scheduler, email output, or confirmation-time inference.
"""

import argparse
import ast
import csv
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

PLATFORMS = {"facebook", "instagram", "linkedin", "pinterest", "x"}
SEGMENTS = {"weekend", "everyday-history", "dialogue"}
REQUIRED_COLUMNS = {
    "id", "email", "subscriber_type", "creation_date", "subscription_date",
    "utm_source", "utm_medium", "utm_campaign", "metadata", "tags",
}


class ReportError(ValueError):
    """A safe error message containing no subscriber data."""


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError
        return parsed.astimezone(timezone.utc)
    except (ValueError, AttributeError):
        raise ReportError("Timestamps must include an explicit timezone.") from None


def iso(value):
    return value.isoformat().replace("+00:00", "Z")


def metadata(value):
    # Buttondown documents a Python dictionary literal; accept JSON as well.
    try:
        result = json.loads(value)
    except (ValueError, TypeError):
        try:
            result = ast.literal_eval(value)
        except (ValueError, SyntaxError, TypeError, RecursionError):
            return {}
    return result if isinstance(result, dict) else {}


def codes(row):
    details = metadata(row.get("metadata", ""))
    platform = row.get("utm_source")
    segment = details.get("oip_segment")
    post = details.get("oip_post")
    if (row.get("utm_campaign") != "almanack-organic"
            or row.get("utm_medium") != "organic_social"
            or platform not in PLATFORMS
            or not isinstance(segment, str) or segment not in SEGMENTS
            or not isinstance(post, str)
            or post not in {f"{segment}-{suffix}" for suffix in ("01", "02", "03", "04", "bio")}):
        return None
    return platform, segment, post


def read_export(path):
    try:
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if not REQUIRED_COLUMNS.issubset(reader.fieldnames or []):
                raise ReportError("CSV is missing required Buttondown subscriber-export columns.")
            if len(reader.fieldnames) != len(set(reader.fieldnames)):
                raise ReportError("CSV contains duplicate column names.")
            rows = list(reader)
            if any(None in row or any(value is None for value in row.values()) for row in rows):
                raise ReportError("CSV contains malformed rows.")
            return rows
    except (OSError, UnicodeError, csv.Error):
        raise ReportError("Unable to read the subscriber CSV.") from None


def distinct_rows(rows):
    result = {}
    duplicates = 0
    missing_ids = 0
    for row in rows:
        identity = row.get("id", "").strip()
        if not identity:
            missing_ids += 1
            continue
        if identity in result:
            # Ignore unrelated export columns, including email, IP and notes.
            relevant = REQUIRED_COLUMNS - {"email", "id"}
            if any(row.get(key) != result[identity].get(key) for key in relevant):
                raise ReportError("Conflicting duplicate IDs: provide one consistent export snapshot.")
            duplicates += 1
        else:
            result[identity] = row
    return result, duplicates, missing_ids


def make_report(rows, start, end, snapshot, test_ids=(), preexisting_ids=(), test_tags=()):
    if not start < end <= snapshot:
        raise ReportError("Require start < end <= snapshot.")
    distinct, duplicates, missing_ids = distinct_rows(rows)
    groups = Counter()
    separate = Counter({name: 0 for name in (
        "unknown_attribution_active", "pending", "unsubscribed", "tests", "preexisting",
        "outside_window", "other_status", "invalid_creation_date",
    )})
    cohort_ids = []
    for identity, row in distinct.items():
        tags = set(filter(None, (tag.strip() for tag in row.get("tags", "").split(";"))))
        if identity in test_ids or tags.intersection(test_tags):
            separate["tests"] += 1
            continue
        if identity in preexisting_ids:
            separate["preexisting"] += 1
            continue
        try:
            created = timestamp(row.get("creation_date", ""))
        except ReportError:
            separate["invalid_creation_date"] += 1
            continue
        if created > snapshot:
            raise ReportError("Export has a creation date after the supplied snapshot timestamp.")
        if created < start:
            separate["preexisting"] += 1
            continue
        if created >= end:
            separate["outside_window"] += 1
            continue
        status = row.get("subscriber_type", "").strip().lower()
        if status in {"unconfirmed", "pending"}:
            separate["pending"] += 1
        elif status == "unsubscribed":
            separate["unsubscribed"] += 1
        elif status != "regular":
            separate["other_status"] += 1
        elif codes(row) is None:
            separate["unknown_attribution_active"] += 1
        else:
            groups[codes(row)] += 1
            cohort_ids.append(identity)
    report = {
        "label": f"New signup cohort, confirmed active as of {iso(snapshot)}",
        "creation_window": {"start_inclusive": iso(start), "end_exclusive": iso(end)},
        "snapshot": iso(snapshot),
        "distinct_active_new_signups": len(cohort_ids),
        "groups": [dict(platform=key[0], segment=key[1], placement=key[2], count=count)
                   for key, count in sorted(groups.items())],
        "separate_counts": dict(separate),
        "deduplication": {"distinct_ids": len(distinct), "duplicate_rows_ignored": duplicates,
                          "rows_without_id": missing_ids},
        "limits": [
            "Regular is status at the manually supplied export snapshot, not a confirmation timestamp.",
            "creation_date and subscription_date do not establish when confirmation occurred.",
            "Attribution is provider snapshot data; pending resubmissions may overwrite metadata.",
            "This report makes no confirmed-during-window claim and no conversion rate from site attempts.",
            "Unknown attribution and pending, unsubscribed, test, and preexisting records are separate.",
        ],
    }
    private_cohort = {
        "schema_version": 1, "creation_window": report["creation_window"],
        "initial_snapshot": iso(snapshot), "ids": sorted(cohort_ids),
    }
    return report, private_cohort


def retention_report(rows, cohort, snapshot, sent_editions, test_ids=()):
    try:
        ids = cohort["ids"]
        initial = timestamp(cohort["initial_snapshot"])
        if (cohort["schema_version"] != 1 or not isinstance(ids, list)
                or any(not isinstance(identity, str) or not identity for identity in ids)
                or len(set(ids)) != len(ids)):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        raise ReportError("Invalid private cohort file.") from None
    editions = sorted(set(timestamp(value) for value in sent_editions))
    if len(editions) < 2 or any(not initial < value <= snapshot for value in editions):
        raise ReportError("Retention needs at least two distinct actual edition-send timestamps after the initial snapshot.")
    distinct, _, _ = distinct_rows(rows)
    eligible_ids = set(ids) - set(test_ids)
    statuses = Counter()
    for identity in eligible_ids:
        row = distinct.get(identity)
        if row is None:
            statuses["missing_from_export"] += 1
            continue
        status = row.get("subscriber_type", "").strip().lower()
        bucket = {"regular": "continued_subscription", "unconfirmed": "pending",
                  "pending": "pending", "unsubscribed": "unsubscribed"}.get(status, "other_status")
        statuses[bucket] += 1
    return {
        "label": f"Cohort continued subscription as of {iso(snapshot)}",
        "initial_snapshot": iso(initial), "snapshot": iso(snapshot),
        "actual_sent_editions_supplied_by_operator": [iso(value) for value in editions],
        "cohort_size": len(eligible_ids),
        "status_counts": {key: statuses[key] for key in (
            "continued_subscription", "pending", "unsubscribed", "other_status", "missing_from_export")},
        "limit": "Continued subscription is separate from engagement; this report does not measure opens, clicks, or reading.",
    }


def private_path(value):
    path = Path(value).expanduser().resolve()
    if any((parent / ".git").exists() for parent in (path.parent, *path.parents)):
        raise ReportError("Private inputs and outputs must be outside Git working directories.")
    return path


def id_file(path):
    try:
        return {line.strip() for line in path.read_text(encoding="utf-8-sig").splitlines() if line.strip()}
    except (OSError, UnicodeError):
        raise ReportError("Unable to read a private ID exclusion file.") from None


def markdown(report):
    lines = [f"# {report['label']}", "", f"Creation window: [{report['creation_window']['start_inclusive']}, {report['creation_window']['end_exclusive']}).",
             "", f"Distinct active new signups: **{report['distinct_active_new_signups']}**.", "",
             "| Platform | Segment | Placement | Count |", "| --- | --- | --- | ---: |"]
    lines += [f"| {row['platform']} | {row['segment']} | {row['placement']} | {row['count']} |" for row in report["groups"]]
    lines += ["", "Separate counts (each ID belongs to one bucket):", ""]
    lines += [f"- {name}: {count}" for name, count in report["separate_counts"].items()]
    lines += ["", f"Duplicate rows ignored: {report['deduplication']['duplicate_rows_ignored']}.",
              f"Rows without an ID: {report['deduplication']['rows_without_id']}.", ""]
    lines += [f"- {limit}" for limit in report["limits"]]
    if "retention" in report:
        retained = report["retention"]
        lines += ["", f"## {retained['label']}", "", f"Initial cohort size: {retained['cohort_size']}.", ""]
        lines += [f"- {name}: {count}" for name, count in retained["status_counts"].items()]
        lines += ["", retained["limit"]]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Manual subscriber CSV, outside Git.")
    parser.add_argument("--start", required=True, help="Inclusive creation-window timestamp, with timezone.")
    parser.add_argument("--end", required=True, help="Exclusive creation-window timestamp, with timezone.")
    parser.add_argument("--snapshot", required=True, help="Actual export snapshot timestamp, with timezone.")
    parser.add_argument("--output", required=True, help="Aggregate Markdown report, outside Git.")
    parser.add_argument("--test-ids", help="Known test IDs, one per line, outside Git.")
    parser.add_argument("--test-tag", action="append", default=[], help="An explicitly known test tag, repeatable.")
    parser.add_argument("--preexisting-ids", help="Actual earlier baseline IDs, one per line, outside Git.")
    parser.add_argument("--cohort-output", help="Optional private ID cohort JSON for a later requested retention check.")
    parser.add_argument("--retention-cohort", help="Earlier private cohort JSON, outside Git.")
    parser.add_argument("--sent-edition", action="append", default=[], help="Verified actual edition-send timestamp for retention, repeatable.")
    args = parser.parse_args()
    try:
        start, end, snapshot = (timestamp(value) for value in (args.start, args.end, args.snapshot))
        rows = read_export(private_path(args.input))
        output = private_path(args.output)
        cohort_output = private_path(args.cohort_output) if args.cohort_output else None
        test_ids = id_file(private_path(args.test_ids)) if args.test_ids else set()
        preexisting_ids = id_file(private_path(args.preexisting_ids)) if args.preexisting_ids else set()
        report, cohort = make_report(rows, start, end, snapshot, test_ids, preexisting_ids, args.test_tag)
        if args.retention_cohort:
            try:
                prior = json.loads(private_path(args.retention_cohort).read_text(encoding="utf-8"))
            except (OSError, UnicodeError, ValueError):
                raise ReportError("Unable to read the earlier private cohort file.") from None
            report["retention"] = retention_report(rows, prior, snapshot, args.sent_edition, test_ids)
        elif args.sent_edition:
            raise ReportError("Edition-send timestamps require an earlier private cohort file.")
        reserved = {private_path(value) for value in (args.input, args.test_ids, args.preexisting_ids, args.retention_cohort) if value}
        if output in reserved or (cohort_output and (cohort_output in reserved or cohort_output == output)):
            raise ReportError("Output paths must not overwrite an input or each other.")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(markdown(report), encoding="utf-8")
        if cohort_output:
            cohort_output.parent.mkdir(parents=True, exist_ok=True)
            cohort_output.write_text(json.dumps(cohort, indent=2) + "\n", encoding="utf-8")
        # Keep subscriber IDs, emails and paths out of stdout and error logs.
        print("Aggregate report written locally. No subscriber data sent.")
        return 0
    except ReportError as error:
        print(f"Report failed: {error} No subscriber data logged.", file=sys.stderr)
        return 2
    except OSError:
        print("Report failed: unable to write the private local output. No subscriber data logged.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
