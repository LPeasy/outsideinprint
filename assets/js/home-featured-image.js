(() => {
  "use strict";

  const dialog = document.querySelector("[data-home-featured-dialog]");
  if (!dialog || typeof dialog.showModal !== "function" || typeof dialog.close !== "function" || typeof window.matchMedia !== "function") return;

  const image = dialog.querySelector("[data-home-featured-image]");
  const title = dialog.querySelector("[data-home-featured-image-title]");
  const closeButton = dialog.querySelector("[data-home-featured-close]");
  const imageButton = dialog.querySelector("[data-home-featured-image-close]");
  if (!image || !title || !closeButton || !imageButton) return;

  const mobile = window.matchMedia("(max-width: 768px)");
  let opener = null;
  const clearImage = () => {
    for (const attribute of ["src", "alt", "width", "height"]) image.removeAttribute(attribute);
    title.textContent = "";
  };
  const close = () => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener("close", () => {
    document.body.classList.remove("home-featured-image-open");
    clearImage();
    const target = mobile.matches ? opener : opener?.closest("article")?.querySelector(".home-v2-featured__item-media");
    opener = null;
    if (target) target.focus();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  closeButton.addEventListener("click", close);
  imageButton.addEventListener("click", close);

  for (const trigger of document.querySelectorAll("[data-home-featured-image-trigger]")) {
    const source = trigger.getAttribute("data-image");
    if (!source) continue;
    trigger.addEventListener("click", () => {
      if (!mobile.matches || dialog.open) return;
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

  const syncBreakpoint = () => {
    if (!mobile.matches) close();
  };
  if (typeof mobile.addEventListener === "function") {
    mobile.addEventListener("change", syncBreakpoint);
  } else {
    mobile.addListener(syncBreakpoint);
  }
})();
