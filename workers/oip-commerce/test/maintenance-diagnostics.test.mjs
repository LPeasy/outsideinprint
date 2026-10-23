import assert from "node:assert/strict";
import test from "node:test";

import { recordOperationalRunError } from "../src/database.js";
import { expireUnusedPhysicalLinks } from "../src/maintenance.js";
import { SqliteD1 } from "./sqlite-d1.mjs";

const NOW = 1_800_000_000;
const STEPS = [
  ["PHYSICAL_RESERVATION_RECONCILE", /^UPDATE physical_inventory_reservations SET status = 'RELEASED'/u],
  ["PHYSICAL_ORPHAN_CHECK", /^UPDATE physical_inventory_reservations SET status = 'ORPHANED_REVIEW'/u],
  ["PHYSICAL_EXPIRED_LINK_LIST", /^SELECT request_key, square_payment_link_id, square_order_id FROM physical_checkout_bindings/u],
];

function environment(t) {
  const db = new SqliteD1();
  t.after(() => db.close());
  let providerCalls = 0;
  const env = {
    DB: db,
    __testFetch: async () => {
      providerCalls += 1;
      throw new Error("NETWORK_FORBIDDEN_IN_TEST");
    },
  };
  return { db, env, providerCalls: () => providerCalls };
}

for (const [stage, matcher] of STEPS) {
  test(`${stage} preserves its diagnostic and exact exception before healthy recovery`, async (t) => {
    const { db, env, providerCalls } = environment(t);
    const prepare = db.prepare.bind(db);
    const original = new Error("D1_ERROR: synthetic private detail must not be recorded");
    let fail = true;
    db.prepare = (sql) => {
      if (fail && matcher.test(sql.replace(/\s+/gu, " ").trim())) {
        fail = false;
        throw original;
      }
      return prepare(sql);
    };
    const notifications = [];
    const options = {
      async onError(observedStage, error) {
        notifications.push({ stage: observedStage, error });
        await recordOperationalRunError(db, {
          runToken: "synthetic-maintenance-run",
          stage: observedStage,
          errorCode: "D1_OPERATION_FAILED",
          now: NOW,
        });
      },
    };
    await assert.rejects(expireUnusedPhysicalLinks(env, NOW, 25, options), (error) => error === original);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].stage, stage);
    assert.equal(notifications[0].error, original);
    assert.equal(providerCalls(), 0);
    const history = db.rows("SELECT stage, error_code, occurred_at FROM operational_monitor_errors");
    assert.deepEqual(history, [{ stage, error_code: "D1_OPERATION_FAILED", occurred_at: NOW }]);
    assert.doesNotMatch(JSON.stringify(history), /synthetic private detail/u);

    assert.deepEqual(await expireUnusedPhysicalLinks(env, NOW + 300, 25, options), {
      examined: 0, expired: 0, deferred: 0, errors: 0, orphaned: 0,
    });
    assert.equal(notifications.length, 1);
    assert.equal(providerCalls(), 0);
    assert.deepEqual(db.rows("SELECT stage, error_code, occurred_at FROM operational_monitor_errors"), history);
  });
}

test("lease-guard failures before any initial database operation are not physical diagnostics", async (t) => {
  for (const failAt of [1, 2, 3]) {
    const { db, env, providerCalls } = environment(t);
    const guardError = new Error("OPERATIONAL_HEARTBEAT_CLAIM_LOST");
    let guards = 0;
    const notifications = [];
    await assert.rejects(expireUnusedPhysicalLinks(env, NOW, 25, {
      async beforeStep() {
        guards += 1;
        if (guards === failAt) throw guardError;
      },
      async onError(stage) { notifications.push(stage); },
    }), (error) => error === guardError);
    assert.equal(guards, failAt);
    assert.deepEqual(notifications, []);
    assert.deepEqual(db.rows("SELECT * FROM operational_monitor_errors"), []);
    assert.equal(providerCalls(), 0);
  }
});

test("a diagnostic callback failure cannot replace the original database exception", async (t) => {
  const { db, env, providerCalls } = environment(t);
  const original = new Error("D1_ERROR: original synthetic failure");
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (STEPS[0][1].test(sql.replace(/\s+/gu, " ").trim())) throw original;
    return prepare(sql);
  };
  await assert.rejects(expireUnusedPhysicalLinks(env, NOW, 25, {
    async onError() { throw new Error("synthetic diagnostic persistence failure"); },
  }), (error) => error === original);
  assert.equal(providerCalls(), 0);
});
