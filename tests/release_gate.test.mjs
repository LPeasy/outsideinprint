import test from "node:test";
import assert from "node:assert/strict";
import { assertReleaseReady } from "../scripts/ci/release_gate.mjs";

test("all required prerequisites must succeed", () => {
  assert.doesNotThrow(() => assertReleaseReady({ contracts: { result: "success" }, build: { result: "success" } }));
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    assert.throws(() => assertReleaseReady({ build: { result } }), /Release blocked/);
  }
});
test("only explicitly unselected jobs may be skipped", () => {
  assert.doesNotThrow(() => assertReleaseReady({ build: { result: "success" }, windows: { result: "skipped" } },
    { build: true, windows: false }));
  assert.throws(() => assertReleaseReady({ windows: { result: "cancelled" } }, { windows: false }), /Release blocked/);
  assert.throws(() => assertReleaseReady({ windows: { result: "failure" } }, { windows: false }), /Release blocked/);
});
test("missing, incomplete, and string-valued selection fails closed", () => {
  for (const needs of [undefined, {}, []]) assert.throws(() => assertReleaseReady(needs));
  assert.throws(() => assertReleaseReady({ build: { result: "success" } }, {}), /differ/);
  assert.throws(() => assertReleaseReady({ build: { result: "success" } }, { build: "false" }), /boolean/);
  assert.throws(() => assertReleaseReady({ build: { result: "success" } }, { other: true }), /differ/);
});
