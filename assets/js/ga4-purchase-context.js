(function () {
  "use strict";
  if (window.oipPurchaseAnalytics) return;

  var origin = "https://outsideinprint.org";
  var choiceKey = "oip.purchase-measurement.v1";
  var choiceAge = 180 * 24 * 60 * 60;
  var config = readConfig();
  var measurementId = config.measurementId;
  var allowed = eligible(config);
  var consent = "unknown";
  var generation = 0;
  var started = false;
  var configured = false;
  var tagLoaded = false;
  var script;
  var pending = [];
  var lastLocation = "";
  var landing = true;
  var panel = document.querySelector("[data-purchase-consent]");
  var preferences = document.querySelector("[data-purchase-preferences]");

  function readConfig() {
    var node = document.querySelector('script[data-oip-route-config="purchase-analytics"]');
    try { return node && JSON.parse(node.textContent) || {}; } catch (error) { return {}; }
  }

  function eligible(value) {
    return value.enabled === true && /^G-[A-Z0-9]{6,20}$/.test(value.measurementId || "") &&
      window.location.origin === origin && window.location.protocol === "https:";
  }

  function readChoice() {
    var value;
    var now = Math.floor(Date.now() / 1000);
    try { value = JSON.parse(window.localStorage.getItem(choiceKey)); } catch (error) { return "unknown"; }
    return value && Object.keys(value).sort().join(",") === "choice,updated_at,version" && value.version === 1 &&
      (value.choice === "granted" || value.choice === "denied") && Number.isSafeInteger(value.updated_at) &&
      value.updated_at <= now && value.updated_at > now - choiceAge ? value.choice : "unknown";
  }

  function saveChoice(value) {
    try {
      window.localStorage.setItem(choiceKey, JSON.stringify({ version: 1, choice: value, updated_at: Math.floor(Date.now() / 1000) }));
    } catch (error) { /* A blocked preference store must not prevent checkout. */ }
  }

  function safePage() {
    var page = config.page || {};
    var path = typeof page.path === "string" && /^\/[a-zA-Z0-9/_~.\-]*$/.test(page.path) && page.path.length <= 300 ? page.path : "/";
    var title = typeof page.title === "string" ? page.title.replace(/[<>\u0000-\u001f\u007f]/g, "").trim().slice(0, 160) : "";
    var location = origin + path;
    var referrer = "";
    if (!landing) referrer = origin + "/";
    else {
      try {
        var parsed = new URL(document.referrer);
        if (/^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password) referrer = parsed.origin + "/";
      } catch (error) { /* Empty or invalid referrers stay empty. */ }
    }
    // Only the real landing-page parameter is eligible. No campaign identifiers are invented or stored.
    if (landing && window.location.pathname === path) {
      try {
        var params = new URLSearchParams(window.location.search);
        var click = params.get("srsltid");
        if (params.getAll("srsltid").length === 1 && /^[A-Za-z0-9_-]{1,256}$/.test(click || "")) {
          location += "?srsltid=" + encodeURIComponent(click);
        }
      } catch (error) { /* Arbitrary query strings and fragments never enter the payload. */ }
    }
    if (!title || /@|https?:|www\./i.test(title)) title = "Outside In Print";
    return { page_location: location, page_referrer: referrer, page_title: title };
  }

  function tag() { window.oipPurchaseDataLayer.push(arguments); }

  function applySafePage() {
    var page = safePage();
    // Set global defaults as well as per-event values: Google must never fall back to the raw URL/title.
    tag("set", page);
    return page;
  }

  function pageView() {
    if (!allowed || consent !== "granted") return;
    var page = applySafePage();
    var path = page.page_location.split("?")[0];
    if (lastLocation === path) return;
    lastLocation = path;
    page.send_to = measurementId;
    tag("event", "page_view", page);
  }

  function start() {
    if (!allowed || consent !== "granted") return;
    window["ga-disable-" + measurementId] = false;
    if (configured) {
      tag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      pageView();
      return;
    }
    if (!started) {
      started = true;
      window.oipPurchaseDataLayer = [];
    }
    configured = true;
    tag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    tag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    tag("set", "ads_data_redaction", true);
    tag("set", "url_passthrough", false);
    var page = applySafePage();
    tag("js", new Date());
    tag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: "outsideinprint.org",
      cookie_flags: "SameSite=Lax;Secure",
      page_location: page.page_location,
      page_referrer: page.page_referrer,
      page_title: page.page_title
    });
    pageView();
    if (script) return;
    script = document.createElement("script");
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId) + "&l=oipPurchaseDataLayer";
    script.setAttribute("data-oip-purchase-tag", "");
    script.onload = function () { tagLoaded = true; };
    document.head.appendChild(script);
  }

  function clearCookies() {
    // Remove only this implementation's GA cookies, including earlier host-only variants.
    ["_ga", "_ga_" + measurementId.slice(2)].forEach(function (name) {
      ["", "; Domain=outsideinprint.org", "; Domain=.outsideinprint.org"].forEach(function (domain) {
        document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax; Secure" + domain;
      });
    });
  }

  function stop() {
    generation += 1;
    pending.slice().forEach(function (finish) { finish(null); });
    if (started) {
      window["ga-disable-" + measurementId] = true;
      if (!tagLoaded) {
        // A delayed tag must not replay pre-withdrawal events after a later grant.
        // Keep the same dedicated queue object; its one pending script still references it.
        window.oipPurchaseDataLayer.length = 0;
        configured = false;
      }
      tag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      clearCookies();
    }
    lastLocation = "";
  }

  function setConsent(value, persist) {
    if (value === consent) return;
    consent = value;
    if (persist) saveChoice(value);
    if (value === "granted") start();
    else stop();
  }

  function showPanel(show) {
    if (!panel || !preferences) return;
    panel.hidden = !show || !allowed;
    preferences.hidden = show || !allowed;
    preferences.setAttribute("aria-expanded", show && allowed ? "true" : "false");
    var status = panel.querySelector("[data-purchase-consent-status]");
    if (status) status.textContent = consent === "granted" ? "Purchase measurement is on. You can turn it off below." : "Purchase measurement is off unless you allow it.";
  }

  function captureCheckoutContext() {
    if (!allowed || consent !== "granted" || !started) return Promise.resolve(null);
    var currentGeneration = generation;
    return new Promise(function (resolve) {
      var clientId;
      var sessionId;
      var finished = false;
      var timer;
      function finish(value) {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        pending = pending.filter(function (item) { return item !== finish; });
        resolve(value);
      }
      function received() {
        if (currentGeneration !== generation || consent !== "granted" || !allowed) return finish(null);
        if (clientId !== undefined && sessionId !== undefined) {
          finish({ version: 1, consent: "granted", client_id: clientId, session_id: sessionId, captured_at: Math.floor(Date.now() / 1000) });
        }
      }
      pending.push(finish);
      timer = window.setTimeout(function () { finish(null); }, 250);
      try {
        var page = applySafePage();
        page.send_to = measurementId;
        // Anchor the browser session. Confirmed purchases are emitted only by the payment-verifying server.
        tag("event", "begin_checkout", page);
        tag("get", measurementId, "client_id", function (value) {
          if (typeof value !== "string" || !/^[0-9]{1,20}\.[0-9]{1,20}$/.test(value)) return finish(null);
          clientId = value;
          received();
        });
        tag("get", measurementId, "session_id", function (value) {
          if ((typeof value !== "string" && typeof value !== "number") || !/^[0-9]{1,20}$/.test(String(value))) return finish(null);
          sessionId = String(value);
          received();
        });
      } catch (error) { finish(null); }
    });
  }

  window.oipPurchaseAnalytics = { captureCheckoutContext: captureCheckoutContext };
  if (!allowed) return;

  document.addEventListener("click", function (event) {
    var control = event.target.closest && event.target.closest("[data-purchase-choice], [data-purchase-preferences]");
    if (!control || !allowed) return;
    if (control.hasAttribute("data-purchase-preferences")) {
      showPanel(true);
      var allow = panel && panel.querySelector('[data-purchase-choice="granted"]');
      if (allow) allow.focus();
      return;
    }
    var choice = control.getAttribute("data-purchase-choice");
    if (choice !== "granted" && choice !== "denied") return;
    setConsent(choice, true);
    showPanel(false);
    if (preferences) preferences.focus();
  });

  document.addEventListener("oip:route", function () {
    var wasAllowed = allowed;
    config = readConfig();
    landing = false;
    allowed = eligible(config) && config.measurementId === measurementId;
    if (!allowed) stop();
    else if (consent === "granted") {
      if (!wasAllowed) start();
      else pageView();
    }
    showPanel(consent === "unknown");
  });

  window.addEventListener("storage", function (event) {
    if (event.key !== choiceKey && event.key !== null) return;
    setConsent(readChoice(), false);
    showPanel(consent === "unknown");
  });

  setConsent(readChoice(), false);
  showPanel(consent === "unknown");
}());
