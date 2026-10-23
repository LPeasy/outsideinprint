import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// Exercise the deployed SQL, including transaction boundaries and conditional
// claims. Unlike FakeD1 this adapter does not interpret or reproduce queries.
export class SqliteD1 {
  constructor({ filename = ":memory:", migrate = true } = {}) {
    this.sqlite = new DatabaseSync(filename);
    this.sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (migrate) this.migrate();
  }

  migrate({ through } = {}) {
    const directory = new URL("../migrations/", import.meta.url);
    const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
    for (const file of files) {
      if (through && file > through) break;
      this.sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
    }
  }

  prepare(sql) {
    const database = this;
    const makeStatement = (args) => ({
      sql,
      args,
      bind(...bound) { return makeStatement(bound); },
      execute(method) {
        const statement = database.sqlite.prepare(sql);
        // D1 reports total_changes() deltas, which include trigger writes.
        // Statement.run().changes would hide production-only claim failures.
        const before = Number(database.sqlite.prepare("SELECT total_changes() AS count").get().count);
        if (method === "run") {
          statement.run(...args);
          const after = Number(database.sqlite.prepare("SELECT total_changes() AS count").get().count);
          return { success: true, meta: { changes: after - before } };
        }
        if (method === "first") return statement.get(...args) || null;
        const results = statement.all(...args);
        const after = Number(database.sqlite.prepare("SELECT total_changes() AS count").get().count);
        return { success: true, results, meta: { changes: after - before } };
      },
      async run() { return this.execute("run"); },
      async first(column) {
        const row = this.execute("first");
        return column === undefined ? row : row?.[column] ?? null;
      },
      async all() { return this.execute("all"); },
    });
    return makeStatement([]);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute("all"));
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  rows(sql, ...args) {
    return this.sqlite.prepare(sql).all(...args).map((row) => ({ ...row }));
  }

  row(sql, ...args) {
    const row = this.sqlite.prepare(sql).get(...args);
    return row ? { ...row } : null;
  }

  close() { this.sqlite.close(); }
}
