(function () {
  var overlay = document.querySelector("[data-paper-route-overlay]");
  var launcher = document.querySelector("[data-paper-route-launch]");

  if (!overlay || !launcher) {
    return;
  }

  var closeControls = Array.prototype.slice.call(overlay.querySelectorAll("[data-paper-route-close]"));
  var closeButton = overlay.querySelector(".paper-route-dialog__close");
  var loading = overlay.querySelector("[data-paper-route-loading]");
  var status = overlay.querySelector("[data-paper-route-status]");
  var muteButton = overlay.querySelector("[data-paper-route-mute]");
  var pauseButton = overlay.querySelector("[data-paper-route-pause]");
  var restartButton = overlay.querySelector("[data-paper-route-restart]");
  var failureCard = overlay.querySelector("[data-paper-route-failure]");
  var retryButton = overlay.querySelector("[data-paper-route-retry]");
  var phaserSrc = overlay.getAttribute("data-paper-route-phaser-src") || "";
  var rulesSrc = overlay.getAttribute("data-paper-route-rules-src") || "";
  var gameSrc = overlay.getAttribute("data-paper-route-game-src") || "";
  var bobSrc = overlay.getAttribute("data-paper-route-bob-src") || "";
  var bobSheetSrc = overlay.getAttribute("data-paper-route-bob-sheet-src") || "";
  var paperSrc = overlay.getAttribute("data-paper-route-paper-src") || "";
  var puddleSrc = overlay.getAttribute("data-paper-route-puddle-src") || "";
  var puddleSplashSrc = overlay.getAttribute("data-paper-route-puddle-splash-src") || "";
  var mailboxHitSrc = overlay.getAttribute("data-paper-route-mailbox-hit-src") || "";
  var doorstepHitSrc = overlay.getAttribute("data-paper-route-doorstep-hit-src") || "";
  var windowHitSrc = overlay.getAttribute("data-paper-route-window-hit-src") || "";
  var runtimePromise = null;
  var gameInstance = null;
  var activeTrigger = null;

  function setText(node, value) {
    if (node) {
      node.textContent = value;
    }
  }

  function setLoading(active) {
    if (loading) {
      loading.hidden = !active;
    }

    overlay.setAttribute("aria-busy", active ? "true" : "false");
  }

  function setFailure(active) {
    if (failureCard) {
      failureCard.hidden = !active;
    }
  }

  function setGameControls(active) {
    if (pauseButton) {
      pauseButton.disabled = !active;
    }

    if (restartButton) {
      restartButton.disabled = !active;
    }
  }

  function focusableElements() {
    return Array.prototype.slice.call(overlay.querySelectorAll("button:not([disabled]), [tabindex]:not([tabindex='-1'])")).filter(function (element) {
      var style = window.getComputedStyle(element);
      return element.tabIndex >= 0 && !element.hidden && !element.closest("[hidden]") && style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    });
  }

  function loadScript(src, id, ready) {
    var existing;

    if (typeof ready === "function" && ready()) {
      return Promise.resolve();
    }

    existing = document.getElementById(id);
    if (existing) {
      return new Promise(function (resolve, reject) {
        if (existing.getAttribute("data-loaded") === "true") {
          resolve();
          return;
        }

        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      });
    }

    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;

      script.addEventListener("load", function () {
        script.setAttribute("data-loaded", "true");
        resolve();
      });

      script.addEventListener("error", function (error) {
        script.remove();
        reject(error);
      });
      document.head.appendChild(script);
    });
  }

  function loadRuntime() {
    if (runtimePromise) {
      return runtimePromise;
    }

    runtimePromise = loadScript(phaserSrc, "oip-paper-route-phaser", function () {
      return !!window.Phaser;
    }).then(function () {
      return loadScript(rulesSrc, "oip-paper-route-rules", function () {
        return !!window.OipPaperRouteRules;
      });
    }).then(function () {
      return loadScript(gameSrc, "oip-paper-route-runtime", function () {
        return !!window.OipPaperRouteGame;
      });
    });

    return runtimePromise;
  }

  function mountGame() {
    if (overlay.hidden || gameInstance || !window.OipPaperRouteGame) {
      return;
    }

    gameInstance = window.OipPaperRouteGame.mount({
      root: overlay,
      container: overlay.querySelector("[data-paper-route-game]"),
      bobSrc: bobSrc,
      bobSheetSrc: bobSheetSrc,
      paperSrc: paperSrc,
      puddleSrc: puddleSrc,
      puddleSplashSrc: puddleSplashSrc,
      mailboxHitSrc: mailboxHitSrc,
      doorstepHitSrc: doorstepHitSrc,
      windowHitSrc: windowHitSrc,
      status: status,
      score: overlay.querySelector("[data-paper-route-score]"),
      papers: overlay.querySelector("[data-paper-route-papers]"),
      time: overlay.querySelector("[data-paper-route-time]"),
      high: overlay.querySelector("[data-paper-route-high]"),
      muteButton: muteButton,
      pauseButton: pauseButton,
      restartButton: restartButton,
      startButton: overlay.querySelector("[data-paper-route-start]"),
      startCard: overlay.querySelector("[data-paper-route-start-card]"),
      pauseCard: overlay.querySelector("[data-paper-route-pause-card]"),
      summaryCard: overlay.querySelector("[data-paper-route-summary]"),
      summaryTitle: overlay.querySelector("[data-paper-route-summary-title]"),
      summaryCopy: overlay.querySelector("[data-paper-route-summary-copy]"),
      summaryRestart: overlay.querySelector("[data-paper-route-summary-restart]"),
      touchPanel: overlay.querySelector("[data-paper-route-touch]"),
      touchControls: Array.prototype.slice.call(overlay.querySelectorAll("[data-paper-route-action]"))
    });
  }

  function ensureGame() {
    setFailure(false);
    setLoading(true);
    setText(status, "Warming the presses...");

    loadRuntime().then(function () {
      setLoading(false);
      mountGame();
    }).catch(function () {
      runtimePromise = null;
      setLoading(false);
      setFailure(true);
      setGameControls(false);
      setText(status, "Paper-Bob could not load.");

      if (retryButton) {
        retryButton.focus({ preventScroll: true });
      }
    });
  }

  function openOverlay() {
    activeTrigger = document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("paper-route-open");
    setGameControls(!!gameInstance);
    setFailure(false);
    ensureGame();

    if (closeButton) {
      closeButton.focus({ preventScroll: true });
    }
  }

  function closeOverlay() {
    if (gameInstance && typeof gameInstance.destroy === "function") {
      gameInstance.destroy();
      gameInstance = null;
    }

    setGameControls(false);
    setLoading(false);
    setFailure(false);
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("paper-route-open");

    if (activeTrigger && typeof activeTrigger.focus === "function") {
      activeTrigger.focus({ preventScroll: true });
    } else {
      launcher.focus({ preventScroll: true });
    }

    activeTrigger = null;
  }

  launcher.addEventListener("click", openOverlay);

  if (retryButton) {
    retryButton.addEventListener("click", ensureGame);
  }

  closeControls.forEach(function (control) {
    control.addEventListener("click", closeOverlay);
  });

  document.addEventListener("keydown", function (event) {
    var focusable;
    var first;
    var last;

    if (overlay.hidden) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    focusable = focusableElements();
    if (!focusable.length) {
      return;
    }

    first = focusable[0];
    last = focusable[focusable.length - 1];

    if (!overlay.contains(document.activeElement) || focusable.indexOf(document.activeElement) === -1) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}());
