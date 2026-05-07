import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const source = fs.readFileSync(path.resolve("assets/js/paper-route-rules.js"), "utf8");

function createRules(highScore = 0) {
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(source, sandbox);
  return sandbox.window.OipPaperRouteRules.create({ highScore });
}

test("Paper-Bob V2 starts with 30 papers and ends after 75 seconds", () => {
  const rules = createRules();
  rules.start();
  assert.equal(rules.state.papers, 30);
  assert.equal(rules.state.timeRemaining, 75);
  const effects = rules.tick(75.1, 0);
  assert.equal(rules.state.running, false);
  assert.equal(rules.state.finishReason, "time");
  assert.equal(effects.some((effect) => effect.type === "finish"), true);
});

test("left and right throws consume papers and preserve airborne throw state", () => {
  const rules = createRules();
  rules.start();
  assert.equal(rules.throwLeft().ok, true);
  assert.equal(rules.state.papers, 29);
  rules.startHop();
  const result = rules.throwRight();
  assert.equal(result.ok, true);
  assert.equal(result.airborne, true);
  assert.equal(rules.state.papers, 28);
});

test("delivery scoring covers mailbox, doorstep, window, airborne bonus, and streak bonus", () => {
  const rules = createRules();
  rules.start();
  rules.hitMailbox(false);
  assert.equal(rules.state.score, 100);
  rules.hitDoorstep(true);
  assert.equal(rules.state.score, 325);
  const [windowEffect] = rules.hitWindow(false);
  assert.equal(windowEffect.points, 275);
  assert.equal(windowEffect.streakBonus, 25);
  assert.equal(rules.state.score, 600);
});

test("puddles slow grounded Bob and remove one paper, but airborne clears score points", () => {
  const rules = createRules();
  rules.start();
  rules.hitPuddle();
  assert.equal(rules.state.papers, 29);
  assert.equal(rules.state.puddleHits, 1);
  assert.equal(rules.isSlowed(), true);
  rules.startHop();
  rules.hitPuddle();
  assert.equal(rules.state.puddlesCleared, 1);
  assert.equal(rules.state.score, 75);
});

test("ramps score and put Bob airborne", () => {
  const rules = createRules();
  rules.start();
  const effects = rules.takeRamp();
  assert.equal(rules.state.score, 100);
  assert.equal(rules.state.rampsTaken, 1);
  assert.equal(rules.state.airborne, true);
  assert.equal(effects.some((effect) => effect.type === "ramp"), true);
});

test("wheelie trick scores five points per tick and caps at forty per wheelie", () => {
  const rules = createRules();
  rules.start();
  rules.startWheelie();
  rules.tick(3, 0);
  assert.equal(rules.state.score, 40);
  assert.equal(rules.state.wheelieScore, 40);
  rules.stopWheelie();
  rules.startWheelie();
  rules.tick(.25, 0);
  assert.equal(rules.state.score, 45);
});
