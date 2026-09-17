import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync("assets/js/home-featured-image.js", "utf8");

function element(initial = {}) {
  const attributes = new Map(Object.entries(initial));
  const listeners = new Map();
  return {
    hidden: false,
    textContent: "",
    focused: 0,
    attributes,
    listeners,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    addEventListener: (event, handler) => listeners.set(event, handler),
    dispatch(event, detail = {}) { listeners.get(event)?.({ target: this, ...detail }); },
    focus() { this.focused += 1; },
  };
}

function setup({ width = 390, supported = true, missing = "", legacyMedia = false, missingSource = false } = {}) {
  const image = element();
  const title = element();
  const closeButton = element();
  const imageButton = element();
  const parts = {
    "[data-home-featured-image]": image,
    "[data-home-featured-image-title]": title,
    "[data-home-featured-close]": closeButton,
    "[data-home-featured-image-close]": imageButton,
  };
  const dialog = element();
  dialog.open = false;
  dialog.querySelector = (selector) => selector === missing ? null : parts[selector];
  if (supported) dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.dispatch("close"); };
  const cards = ["First piece", "Second piece"].map((name, index) => {
    const trigger = element({
      "data-image": missingSource ? "" : `/images/rendered/piece-${index}/1600.webp`,
      "data-title": name,
      "data-alt": `Artwork for ${name}`,
      "data-width": "1600",
      "data-height": "1200",
    });
    trigger.hidden = true;
    const fallback = element();
    const desktopLink = element();
    const article = {
      querySelector: (selector) => selector === "[data-home-featured-image-fallback]" ? fallback : desktopLink,
    };
    trigger.closest = (selector) => {
      assert.equal(selector, "article");
      return article;
    };
    return { trigger, fallback, desktopLink };
  });
  let mediaChange;
  const media = { matches: width <= 768 };
  if (legacyMedia) media.addListener = (handler) => { mediaChange = handler; };
  else media.addEventListener = (event, handler) => {
    assert.equal(event, "change");
    mediaChange = handler;
  };
  const bodyClasses = new Set();
  const document = {
    body: { classList: { add: (name) => bodyClasses.add(name), remove: (name) => bodyClasses.delete(name) } },
    querySelector(selector) {
      assert.equal(selector, "[data-home-featured-dialog]");
      return missing === "dialog" ? null : dialog;
    },
    querySelectorAll(selector) {
      assert.equal(selector, "[data-home-featured-image-trigger]");
      return cards.map(({ trigger }) => trigger);
    },
  };
  const window = {
    matchMedia(query) {
      assert.equal(query, "(max-width: 768px)");
      return media;
    },
  };
  vm.runInNewContext(script, { document, window });
  return {
    image, title, closeButton, imageButton, dialog, cards, bodyClasses,
    resize(nextWidth) {
      const nextMatches = nextWidth <= 768;
      if (nextMatches !== media.matches) {
        media.matches = nextMatches;
        mediaChange?.();
      }
    },
  };
}

test("featured illustrations enhance native controls without requesting the full image until activation", () => {
  const view = setup();
  for (const { trigger, fallback } of view.cards) {
    assert.equal(trigger.hidden, false);
    assert.equal(fallback.hidden, true);
    assert.equal(trigger.listeners.has("keydown"), false, "native buttons provide Enter and Space activation");
  }
  assert.equal(view.image.getAttribute("src"), null);
  assert.equal(view.dialog.open, false);
  view.cards[0].trigger.dispatch("click");
  assert.equal(view.dialog.open, true);
  assert.equal(view.image.getAttribute("src"), "/images/rendered/piece-0/1600.webp");
  assert.equal(view.image.getAttribute("alt"), "Artwork for First piece");
  assert.equal(view.image.getAttribute("width"), "1600");
  assert.equal(view.image.getAttribute("height"), "1200");
  assert.equal(view.title.textContent, "First piece");
  assert.equal(view.closeButton.focused, 1);
  assert.equal(view.bodyClasses.has("home-featured-image-open"), true);
});

test("image, backdrop, close button, and native Escape close and restore mobile focus", () => {
  for (const action of ["image", "backdrop", "button", "escape"]) {
    const view = setup();
    view.cards[1].trigger.dispatch("click");
    if (action === "image") view.imageButton.dispatch("click");
    if (action === "backdrop") view.dialog.dispatch("click");
    if (action === "button") view.closeButton.dispatch("click");
    if (action === "escape") {
      let prevented = false;
      view.dialog.dispatch("cancel", { preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    }
    assert.equal(view.dialog.open, false, action);
    assert.equal(view.cards[1].trigger.focused, 1, action);
    assert.equal(view.bodyClasses.size, 0, action);
    for (const attribute of ["src", "alt", "width", "height"]) assert.equal(view.image.getAttribute(attribute), null, action);
    assert.equal(view.title.textContent, "");
  }
});

test("dialog contents do not count as backdrop clicks and each activation uses its own artwork", () => {
  const view = setup();
  view.cards[0].trigger.dispatch("click");
  view.dialog.dispatch("click", { target: view.title });
  assert.equal(view.dialog.open, true);
  view.cards[1].trigger.dispatch("click");
  assert.equal(view.title.textContent, "First piece", "an already open dialog is not reopened");
  view.closeButton.dispatch("click");
  view.cards[1].trigger.dispatch("click");
  assert.equal(view.title.textContent, "Second piece");
  assert.equal(view.image.getAttribute("src"), "/images/rendered/piece-1/1600.webp");
});

test("resizing above 768px closes the modal and focuses the visible desktop illustration link", () => {
  for (const legacyMedia of [false, true]) {
    const view = setup({ width: 768, legacyMedia });
    view.cards[0].trigger.dispatch("click");
    view.resize(769);
    assert.equal(view.dialog.open, false);
    assert.equal(view.cards[0].trigger.focused, 0);
    assert.equal(view.cards[0].desktopLink.focused, 1);
    assert.equal(view.bodyClasses.size, 0);
    view.cards[0].trigger.dispatch("click");
    assert.equal(view.dialog.open, false, "hidden mobile controls cannot open the desktop dialog");
    view.resize(390);
    view.cards[0].trigger.dispatch("click");
    assert.equal(view.dialog.open, true);
  }
});

test("unsupported dialogs, incomplete markup, and missing image sources preserve fallback links", () => {
  for (const options of [
    { supported: false },
    { missing: "dialog" },
    { missing: "[data-home-featured-image]" },
    { missing: "[data-home-featured-image-title]" },
    { missing: "[data-home-featured-close]" },
    { missing: "[data-home-featured-image-close]" },
    { missingSource: true },
  ]) {
    const view = setup(options);
    for (const { trigger, fallback } of view.cards) {
      assert.equal(trigger.hidden, true);
      assert.equal(fallback.hidden, false);
    }
    assert.equal(view.image.getAttribute("src"), null);
  }
});
