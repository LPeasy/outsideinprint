import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync("assets/js/home-reader-note.js", "utf8");
const homepage = fs.readFileSync("layouts/partials/home_v2_front_page.html", "utf8");

function setup({ width = 390, missingButton = false, missingRest = false, mediaSupported = true } = {}) {
  const attributes = new Map([
    ["aria-controls", "home-reader-note-rest"],
    ["aria-expanded", "true"],
  ]);
  const listeners = new Map();
  const button = {
    hidden: true,
    textContent: "Read the full note",
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    addEventListener: (event, handler) => listeners.set(event, handler),
  };
  const rest = { hidden: false };
  let mediaChange;
  const media = {
    matches: width <= 720,
    addEventListener(event, handler) {
      assert.equal(event, "change");
      mediaChange = handler;
    },
  };
  const window = mediaSupported ? {
    matchMedia(query) {
      assert.equal(query, "(max-width: 720px)");
      return media;
    },
  } : {};
  const document = {
    querySelector(selector) {
      assert.equal(selector, "[data-reader-note-toggle]");
      return missingButton ? null : button;
    },
    getElementById(id) {
      assert.equal(id, "home-reader-note-rest");
      return missingRest ? null : rest;
    },
  };
  vm.runInNewContext(script, { window, document });
  return {
    button, rest, attributes, listeners,
    activate() {
      assert.ok(listeners.has("click"), "native button activation must have a click handler");
      listeners.get("click")();
    },
    resize(nextWidth) {
      const nextMatches = nextWidth <= 720;
      if (nextMatches !== media.matches) {
        media.matches = nextMatches;
        assert.ok(mediaChange, "breakpoint changes must be observed");
        mediaChange({ matches: nextMatches });
      }
    },
  };
}

test("reader note is complete without JavaScript and the native control starts hidden", () => {
  const suffix = homepage.match(/<span\b[^>]*\bid="home-reader-note-rest"[^>]*>([\s\S]*?)<\/span>/);
  assert.ok(suffix, "later sentences must have a stable control target");
  assert.doesNotMatch(suffix[0].split(">")[0], /\bhidden\b|aria-hidden/);
  assert.match(suffix[1], /^ Step outside the feed,/);
  assert.match(homepage, /headline to headline\.<span\b[^>]*id="home-reader-note-rest"/);
  const control = homepage.match(/<button\b[^>]*data-reader-note-toggle[^>]*>/)?.[0];
  assert.ok(control, "use a keyboard-accessible native button");
  assert.match(control, /type="button"/);
  assert.match(control, /\bhidden(?:\s|>)/);
  assert.match(control, /aria-controls="home-reader-note-rest"/);
  assert.match(control, /aria-expanded="true"/);
});

test("reader note collapses through 720px and native activation toggles text and accessibility state", () => {
  for (const width of [320, 360, 390, 720]) {
    const note = setup({ width });
    assert.equal(note.button.hidden, false);
    assert.equal(note.rest.hidden, true);
    assert.equal(note.attributes.get("aria-expanded"), "false");
    assert.equal(note.button.textContent, "Read the full note");
    note.activate();
    assert.equal(note.rest.hidden, false);
    assert.equal(note.attributes.get("aria-expanded"), "true");
    assert.equal(note.button.textContent, "Show less");
    note.activate();
    assert.equal(note.rest.hidden, true);
    assert.equal(note.attributes.get("aria-expanded"), "false");
    assert.equal(note.button.textContent, "Read the full note");
    assert.equal(note.listeners.has("keydown"), false, "native button Enter/Space activation needs no custom key handler");
  }
});

test("desktop reveals the full note and returning to mobile resets it to collapsed", () => {
  const note = setup({ width: 390 });
  note.activate();
  note.resize(721);
  assert.equal(note.rest.hidden, false);
  assert.equal(note.button.hidden, true);
  assert.equal(note.attributes.get("aria-expanded"), "true");
  note.resize(720);
  assert.equal(note.rest.hidden, true);
  assert.equal(note.button.hidden, false);
  assert.equal(note.attributes.get("aria-expanded"), "false");
  assert.equal(note.button.textContent, "Read the full note");
});

test("desktop initialization and unavailable enhancement preserve the full note", () => {
  for (const width of [721, 768, 1366]) {
    const note = setup({ width });
    assert.equal(note.rest.hidden, false);
    assert.equal(note.button.hidden, true);
    assert.equal(note.attributes.get("aria-expanded"), "true");
  }
  for (const options of [{ missingButton: true }, { missingRest: true }, { mediaSupported: false }]) {
    const note = setup(options);
    assert.equal(note.rest.hidden, false);
    assert.equal(note.button.hidden, true);
    assert.equal(note.attributes.get("aria-expanded"), "true");
  }
});
