(function () {
  "use strict";
  var storageKey = "oip.newsletter-attribution.v1";
  var idleLimit = 30 * 60 * 1000;
  var attempts = new WeakMap();

  function mount(scope) {
    var configNode = document.querySelector('script[data-oip-route-config="newsletter-attribution"]');
    var config;
    try { config = JSON.parse(configNode.textContent); } catch (error) { return; }
    if (config.enabled !== true) return;

    var endpoint;
    try { endpoint = new URL(config.endpoint); } catch (error) { return; }
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return;
    if (!window.fetch || typeof AbortController !== "function" || !window.crypto || (!window.crypto.randomUUID && !window.crypto.getRandomValues)) return;

    var attribution = null;
    var currentSearch = window.location.search;

    function storageAllowed() {
      // The deployment switch stays off until the privacy/retention review. A
      // consent controller can withdraw permission without changing form use.
      if (config.storageEnabled !== true || window.navigator.globalPrivacyControl === true || window.navigator.doNotTrack === "1") return false;
      try {
        return typeof window.oipNewsletterAttributionStorageAllowed !== "function" || window.oipNewsletterAttributionStorageAllowed() === true;
      } catch (error) { return false; }
    }

    function clearStored() {
      try { window.sessionStorage.removeItem(storageKey); } catch (error) { /* Storage is optional. */ }
    }

    function campaignFor(value) {
      return (config.campaigns || []).find(function (campaign) {
        return campaign.code === value.campaign_code && campaign.utm_campaign === value.utm_campaign &&
          campaign.utm_source === value.utm_source && campaign.utm_medium === value.utm_medium &&
          (campaign.utm_content || "") === value.utm_content;
      });
    }

    function cleanPath(path) {
      return typeof path === "string" && path.length <= 240 && /^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/.test(path) ? path : "";
    }

    function valid(value) {
      return value && Object.keys(value).sort().join(",") === "campaign_code,landing_path,last_activity,utm_campaign,utm_content,utm_medium,utm_source" &&
        campaignFor(value) && cleanPath(value.landing_path) && Number.isFinite(value.last_activity) &&
        value.last_activity <= Date.now() && Date.now() - value.last_activity < idleLimit;
    }

    function currentCampaign() {
      var params = new URLSearchParams(window.location.search);
      var names = ["utm_campaign", "utm_source", "utm_medium", "utm_content"];
      var supplied = names.some(function (name) { return params.has(name); });
      if (!supplied) return { supplied: false, value: null };
      if (names.some(function (name) { return params.getAll(name).length > 1; })) return { supplied: true, value: null };
      var matches = (config.campaigns || []).filter(function (campaign) {
        return campaign.utm_campaign === params.get("utm_campaign") && campaign.utm_source === params.get("utm_source") &&
          campaign.utm_medium === params.get("utm_medium") && (campaign.utm_content || "") === (params.get("utm_content") || "");
      });
      // An ambiguous tuple never receives invented per-post attribution.
      if (matches.length !== 1) return { supplied: true, value: null };
      var campaign = matches[0];
      var path = cleanPath(config.pagePath);
      if (!path) return { supplied: true, value: null };
      return { supplied: true, value: {
        campaign_code: campaign.code, utm_campaign: campaign.utm_campaign,
        utm_source: campaign.utm_source, utm_medium: campaign.utm_medium,
        utm_content: campaign.utm_content || "", landing_path: path, last_activity: Date.now()
      } };
    }

    function persist() {
      if (!storageAllowed()) return;
      try {
        if (attribution) window.sessionStorage.setItem(storageKey, JSON.stringify(attribution));
        else window.sessionStorage.removeItem(storageKey);
      } catch (error) { /* Current-page attribution remains usable without storage. */ }
    }

    function arrive() {
      var current = currentCampaign();
      attribution = current.value;
      if (storageAllowed()) {
        if (!current.supplied) {
          try {
            var saved = JSON.parse(window.sessionStorage.getItem(storageKey));
            if (valid(saved)) attribution = saved;
          } catch (error) { /* No cross-page attribution without usable storage. */ }
        }
        // An unrecognized explicit tag replaces a prior attribution with unknown.
        if (attribution) attribution.last_activity = Date.now();
        persist();
      }
      fillForms();
    }

    function activity() {
      if (attribution && !valid(attribution)) {
        attribution = null;
        persist();
      }
      if (attribution && Date.now() - attribution.last_activity >= 1000) {
        attribution.last_activity = Date.now();
        persist();
      }
    }

    function fields() {
      activity();
      var value = attribution || {};
      return {
        campaign_code: value.campaign_code || "", utm_campaign: value.utm_campaign || "",
        utm_source: value.utm_source || "", utm_medium: value.utm_medium || "",
        utm_content: value.utm_content || "", landing_path: value.landing_path || ""
      };
    }

    function fillForm(form, values) {
      Object.keys(values).forEach(function (name) {
        var field = form.querySelector('input[name="' + name + '"]');
        if (!field) {
          field = document.createElement("input");
          field.type = "hidden";
          field.name = name;
          form.appendChild(field);
        }
        field.value = values[name];
      });
    }

    function fillForms() {
      var values = fields();
      document.querySelectorAll("form[data-newsletter-attribution]").forEach(function (form) { fillForm(form, values); });
    }

    function randomReference() {
      if (window.crypto.randomUUID) return window.crypto.randomUUID();
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      var hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
      return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
    }

    arrive();
    ["pointerdown", "keydown", "scroll"].forEach(function (type) { scope.on(document, type, activity, { passive: true }); });
    scope.on(document, "oip:query", function () {
      if (currentSearch !== window.location.search) {
        currentSearch = window.location.search;
        arrive();
      }
    });
    scope.on(document, "oip:privacy-change", function () {
      if (!storageAllowed()) clearStored();
      arrive();
    });
    scope.on(document, "submit", async function (event) {
      var form = event.target;
      if (!form || !form.matches("form[data-newsletter-attribution]")) return;
      event.preventDefault();
      var input = form.querySelector('input[name="email"]');
      var button = form.querySelector('button[type="submit"]');
      var status = form.querySelector("[data-newsletter-attribution-status]");
      if (!input || !button || button.disabled) return;
      if (!input.checkValidity()) { input.reportValidity(); return; }
      var email = input.value.trim();
      var attempt = attempts.get(form);
      if (!attempt || attempt.email !== email) {
        var values = fields();
        var trap = form.querySelector('input[name="website"]');
        attempt = { email: email, body: Object.assign(values, {
          email: email, signup_ref: randomReference(), website: trap ? trap.value : ""
        }) };
        attempts.set(form, attempt);
      }
      // Keep this exact body/key after any uncertain outcome. Never submit through
      // the embedded Buttondown action after attempting the Worker request.
      fillForm(form, { signup_ref: attempt.body.signup_ref });
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      if (status) { status.hidden = false; status.textContent = "Sending your request…"; }
      var controller = new AbortController();
      var timer = window.setTimeout(function () { controller.abort(); }, 20000);
      try {
        var response = await window.fetch(endpoint.href, {
          method: "POST", mode: "cors", credentials: "omit", cache: "no-store",
          referrerPolicy: "no-referrer", signal: controller.signal,
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Idempotency-Key": attempt.body.signup_ref },
          body: JSON.stringify(attempt.body)
        });
        var result = await response.json();
        if (!response.ok || !result || result.ok !== true) throw new Error("signup_not_accepted");
        attempt.accepted = true;
        if (scope.active() && form.isConnected !== false && status) status.textContent = "Check your inbox for any next steps.";
      } catch (error) {
        if (scope.active() && form.isConnected !== false && status) status.textContent = "We could not confirm your request. Please retry using this form.";
      } finally {
        window.clearTimeout(timer);
        if (scope.active() && form.isConnected !== false) {
          button.disabled = attempt.accepted === true;
          button.removeAttribute("aria-busy");
        }
      }
    });
  }

  if (window.oipRegisterRouteWidget) window.oipRegisterRouteWidget("newsletter-attribution", mount);
  else mount({ on: function (target, type, callback, options) { target.addEventListener(type, callback, options); }, active: function () { return true; } });
}());
