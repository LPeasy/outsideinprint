(() => {
  "use strict";

  const toggle = document.querySelector("[data-reader-note-toggle]");
  if (!toggle || typeof window.matchMedia !== "function") return;
  const rest = document.getElementById(toggle.getAttribute("aria-controls"));
  if (!rest) return;

  const mobile = window.matchMedia("(max-width: 720px)");
  const setExpanded = (expanded) => {
    rest.hidden = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "Show less" : "Read the full note";
  };
  const syncBreakpoint = () => {
    toggle.hidden = !mobile.matches;
    setExpanded(!mobile.matches);
  };

  toggle.addEventListener("click", () => {
    if (mobile.matches) setExpanded(rest.hidden);
  });
  if (typeof mobile.addEventListener === "function") {
    mobile.addEventListener("change", syncBreakpoint);
  } else {
    mobile.addListener(syncBreakpoint);
  }
  syncBreakpoint();
})();
