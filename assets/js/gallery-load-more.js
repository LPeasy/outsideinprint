(() => {
  "use strict";
  const items = Array.from(document.querySelectorAll("[data-gallery-item]"));
  const button = document.querySelector("[data-gallery-load-more]");
  if (!button || items.length <= 24) return;

  const requested = (() => {
    try { return new URLSearchParams(location.search).get("cartoon") || location.hash.replace(/^#cartoon-/, ""); }
    catch (_) { return ""; }
  })();
  const requestedIndex = requested ? items.findIndex((item) => item.querySelector("[data-cartoon-slug]")?.getAttribute("data-cartoon-slug") === requested) : -1;
  let visible = Math.max(24, requestedIndex + 1);
  visible = Math.ceil(visible / 24) * 24;

  function render() {
    items.forEach((item, index) => { item.hidden = index >= visible; });
    button.hidden = visible >= items.length;
  }
  button.addEventListener("click", () => {
    const previous = visible;
    visible += 24;
    render();
    const next = items[Math.min(previous, items.length - 1)];
    next?.querySelector("a, button")?.focus({ preventScroll: true });
  });
  render();
})();
