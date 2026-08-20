import json
import sqlite3
import sys
from pathlib import Path


def statements(sql_text: str):
    pending = ""
    for line in sql_text.splitlines(keepends=True):
        pending += line
        if sqlite3.complete_statement(pending):
            statement = pending.strip()
            pending = ""
            if statement:
                yield statement
    if pending.strip():
        raise RuntimeError("SQL statement is incomplete")


def main() -> int:
    if len(sys.argv) != 5:
        raise RuntimeError("Expected migration-1, migration-2, import SQL, and database paths")
    migration_one, migration_two, import_path, database_path = map(Path, sys.argv[1:])
    connection = sqlite3.connect(database_path, isolation_level=None)
    try:
        connection.executescript(migration_one.read_text(encoding="utf-8"))
        connection.executescript(migration_two.read_text(encoding="utf-8"))
        connection.execute("BEGIN IMMEDIATE")
        for statement in statements(import_path.read_text(encoding="utf-8")):
            first_token = statement.split(None, 1)[0].rstrip(";").upper()
            if first_token in {"BEGIN", "COMMIT", "END", "ROLLBACK", "SAVEPOINT", "RELEASE"}:
                raise RuntimeError("Generated import contains transaction control")
            connection.execute(statement)
        counts = {
            "jurisdiction_manifests": connection.execute(
                "SELECT COUNT(*) FROM florida_jurisdiction_datasets"
            ).fetchone()[0],
            "rate_manifests": connection.execute(
                "SELECT COUNT(*) FROM florida_sales_tax_rate_manifests"
            ).fetchone()[0],
            "rate_rows": connection.execute(
                "SELECT COUNT(*) FROM florida_county_sales_tax_rates"
            ).fetchone()[0],
        }
        connection.execute("COMMIT")
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()
    sys.stdout.write(json.dumps(counts, sort_keys=True, separators=(",", ":")) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
