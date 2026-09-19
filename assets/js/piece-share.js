(function () {
  "use strict";

  function cleanShareUrl(value) {
    var parsed;

    try {
      parsed = new URL(value);
    } catch (error) {
      return "";
    }

    if (parsed.origin !== "https://outsideinprint.org" || parsed.username || parsed.password) {
      return "";
    }

    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  }

  function setupShare(wrapper) {
    var trigger = wrapper.querySelector("[data-share-trigger]");
    var panel = wrapper.querySelector("[data-share-panel]");
    var copyButton = wrapper.querySelector("[data-share-copy]");
    var closeButton = wrapper.querySelector("[data-share-close]");
    var manual = wrapper.querySelector("[data-share-manual]");
    var input = wrapper.querySelector("[data-share-input]");
    var status = wrapper.querySelector("[data-share-status]");
    var title = (wrapper.dataset.shareTitle || "").trim();
    var shareUrl = cleanShareUrl(wrapper.dataset.shareUrl || "");
    var sharing = false;
    var panelGeneration = 0;

    if (!trigger || !panel || !copyButton || !closeButton || !manual || !input || !status ||
        !panel.id || trigger.getAttribute("aria-controls") !== panel.id || !title || !shareUrl) {
      return;
    }

    wrapper.dataset.shareUrl = shareUrl;
    input.value = shareUrl;
    panel.hidden = true;
    manual.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    wrapper.hidden = false;

    function showPanel() {
      panelGeneration += 1;
      status.textContent = "";
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      copyButton.focus();
    }

    function closePanel() {
      panelGeneration += 1;
      panel.hidden = true;
      manual.hidden = true;
      status.textContent = "";
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }

    function showManualCopy() {
      if (panel.hidden) showPanel();
      manual.hidden = false;
      input.value = shareUrl;
      status.textContent = "Copying is unavailable. The link is selected; copy it manually.";
      input.focus();
      input.select();
    }

    trigger.addEventListener("click", async function () {
      if (sharing) {
        return;
      }

      if (typeof navigator.share !== "function") {
        showPanel();
        return;
      }

      sharing = true;
      trigger.disabled = true;
      status.textContent = "";
      try {
        await navigator.share({ title: title, url: shareUrl });
      } catch (error) {
        if (!error || error.name !== "AbortError") {
          showPanel();
        }
      } finally {
        sharing = false;
        trigger.disabled = false;
        if (panel.hidden) {
          trigger.focus();
        }
      }
    });

    copyButton.addEventListener("click", async function () {
      var requestGeneration = ++panelGeneration;

      status.textContent = "";
      manual.hidden = true;

      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        showManualCopy();
        return;
      }

      try {
        await navigator.clipboard.writeText(shareUrl);
        if (requestGeneration !== panelGeneration) {
          return;
        }
        status.textContent = "Link copied.";
      } catch (error) {
        if (requestGeneration !== panelGeneration) {
          return;
        }
        showManualCopy();
      }
    });

    closeButton.addEventListener("click", closePanel);
    wrapper.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) {
        event.preventDefault();
        closePanel();
      }
    });
  }

  function setupAllShares() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-piece-share]"), setupShare);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupAllShares, { once: true });
  } else {
    setupAllShares();
  }
}());
