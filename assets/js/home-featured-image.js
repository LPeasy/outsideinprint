(function () {
  function mount(scope) {
  "use strict";

  const dialog = document.querySelector("[data-home-featured-dialog]");
  if (!dialog || typeof dialog.showModal !== "function" || typeof dialog.close !== "function") return;

  const image = dialog.querySelector("[data-home-featured-image]");
  const title = dialog.querySelector("[data-home-featured-image-title]");
  const closeButton = dialog.querySelector("[data-home-featured-close]");
  const imageButton = dialog.querySelector("[data-home-featured-image-close]");
  if (!image || !title || !closeButton || !imageButton) return;

  let opener = null;
  const clearImage = () => {
    for (const attribute of ["src", "alt", "width", "height"]) image.removeAttribute(attribute);
    title.textContent = "";
  };
  const close = () => {
    if (dialog.open) dialog.close();
  };

  scope.on(dialog, "close", () => {
    document.body.classList.remove("home-featured-image-open");
    clearImage();
    const target = opener;
    opener = null;
    if (target) target.focus();
  });
  scope.on(dialog, "cancel", (event) => {
    event.preventDefault();
    close();
  });
  scope.on(dialog, "click", (event) => {
    if (event.target === dialog) close();
  });
  scope.on(closeButton, "click", close);
  scope.on(imageButton, "click", close);

  for (const trigger of document.querySelectorAll("[data-home-featured-image-trigger]")) {
    const source = trigger.getAttribute("data-image");
    if (!source) continue;
    scope.on(trigger, "click", () => {
      if (dialog.open) return;
      image.setAttribute("src", source);
      image.setAttribute("alt", trigger.getAttribute("data-alt") || "");
      for (const dimension of ["width", "height"]) {
        const value = trigger.getAttribute(`data-${dimension}`);
        if (/^[1-9]\d*$/.test(value || "")) image.setAttribute(dimension, value);
      }
      title.textContent = trigger.getAttribute("data-title") || "Featured illustration";
      opener = trigger;
      dialog.showModal();
      document.body.classList.add("home-featured-image-open");
      closeButton.focus();
    });
    trigger.hidden = false;
    const fallback = trigger.closest("article")?.querySelector("[data-home-featured-image-fallback]");
    if (fallback) fallback.hidden = true;
  }


  scope.cleanup(function () { opener = null; close(); document.body.classList.remove("home-featured-image-open"); });
  }
  if (window.oipRegisterRouteWidget) {
    window.oipRegisterRouteWidget("home-featured-image", mount);
  } else {
    mount({ on: function (target, type, callback, options) { target.addEventListener(type, callback, options); }, cleanup: function () {}, active: function () { return true; } });
  }
}());
