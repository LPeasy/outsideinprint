(function () {
  function mount(scope) {
  "use strict";

  var fallbackSequence = 0;

  function createIdempotencyKey() {
    var bytes;
    var hex;

    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      hex = Array.prototype.map.call(bytes, function (value) {
        return value.toString(16).padStart(2, "0");
      }).join("");
      return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
    }

    fallbackSequence += 1;
    return ["oip", Date.now().toString(36), fallbackSequence.toString(36), Math.random().toString(36).slice(2, 14)].join("-");
  }

  function secureSquareUrl(payload) {
    var checkoutUrl = payload && (payload.checkout_url || payload.url);
    var parsed;
    if (!checkoutUrl) return "";
    try {
      parsed = new URL(checkoutUrl);
    } catch (error) {
      return "";
    }
    if (parsed.protocol !== "https:") return "";
    if (parsed.hostname !== "square.link" && parsed.hostname !== "checkout.square.site") return "";
    return parsed.href;
  }

  function setStatus(form, message) {
    var status = form.querySelector("[data-epub-checkout-status]");
    if (status) status.textContent = message;
  }

  function normalizedEmail(input) {
    return String(input && input.value || "").trim().toLowerCase();
  }

  function optionalMeasurement() {
    var analytics = window.oipPurchaseAnalytics;
    if (!analytics || typeof analytics.captureCheckoutContext !== "function") return Promise.resolve(null);
    return new Promise(function (resolve) {
      var finished = false;
      var timer = window.setTimeout(function () { finish(null); }, 300);
      function finish(value) {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        var measurement = null;
        try {
          if (value && Object.keys(value).sort().join(",") === "captured_at,client_id,consent,session_id,version" &&
            value.version === 1 && value.consent === "granted" &&
            typeof value.client_id === "string" && /^[0-9]{1,20}\.[0-9]{1,20}$/.test(value.client_id) &&
            typeof value.session_id === "string" && /^[0-9]{1,20}$/.test(value.session_id) &&
            Number.isSafeInteger(value.captured_at) && value.captured_at > 0) {
            measurement = { version: 1, consent: "granted", client_id: value.client_id, session_id: value.session_id, captured_at: value.captured_at };
          }
        } catch (error) { /* A broken optional adapter must not strand the checkout. */ }
        resolve(measurement);
      }
      try {
        Promise.resolve(analytics.captureCheckoutContext()).then(finish, function () { finish(null); });
      } catch (error) { finish(null); }
    });
  }

  function submitButtondownPreferences(form, email) {
    var endpoint = form.dataset.buttondownEndpoint || "";
    var weekly = form.querySelector("input[name='weekly_email']");
    var publications = form.querySelector("input[name='publication_notifications']");
    var tags = [];
    var parsed;
    var body;

    if (weekly && weekly.checked && form.dataset.weeklyEmailTag) {
      tags.push(form.dataset.weeklyEmailTag);
    }
    if (publications && publications.checked && form.dataset.publicationEmailTag) {
      tags.push(form.dataset.publicationEmailTag);
    }
    if (!endpoint || tags.length === 0) return;

    try {
      parsed = new URL(endpoint);
    } catch (error) {
      return;
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "buttondown.com" ||
      !parsed.pathname.startsWith("/api/emails/embed-subscribe/")
    ) return;

    body = new URLSearchParams();
    body.append("email", email);
    body.append("embed", "1");
    tags.forEach(function (tag) { body.append("tag", tag); });
    fetch(parsed.href, {
      method: "POST",
      mode: "no-cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      keepalive: true,
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString()
    }).catch(function () {
      // Marketing signup is optional and must never block a paid EPUB checkout.
    });
  }

  scope.on(document, "submit", function (event) {
    var form = event.target;
    var button;
    var sku;
    var originalLabel;
    var idempotencyKey;
    var emailInput;
    var email;

    if (!form || !form.matches("[data-epub-checkout]")) return;
    event.preventDefault();
    button = form.querySelector("button[type='submit']");
    sku = form.dataset.epubSku || "";
    if (!button || button.disabled || !/^OIP-(?:[A-Z]{2}|PENDING)-EPUB$/.test(sku)) return;
    emailInput = form.querySelector("input[name='email']");
    if (!emailInput || !emailInput.checkValidity()) {
      if (emailInput) emailInput.reportValidity();
      return;
    }
    email = normalizedEmail(emailInput);

    originalLabel = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Opening secure checkout…";
    setStatus(form, "Connecting to Square…");
    idempotencyKey = createIdempotencyKey();

    optionalMeasurement().then(function (measurement) {
      if (!scope.active() || form.isConnected === false) return null;
      var body = { sku: sku, country_code: "US", email: email };
      if (measurement) body.measurement = measurement;
      return fetch(form.action, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "strict-origin-when-cross-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(body)
      });
    }).then(function (response) {
      if (!response) return null;
      if (!response.ok) throw new Error("checkout_request_failed");
      return response.json();
    }).then(function (payload) {
      if (!scope.active() || form.isConnected === false) return;
      var checkoutUrl = secureSquareUrl(payload);
      if (!checkoutUrl) throw new Error("checkout_url_missing");
      submitButtondownPreferences(form, email);
      window.location.assign(checkoutUrl);
    }).catch(function () {
      if (!scope.active() || form.isConnected === false) return;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = originalLabel;
      setStatus(form, "Secure checkout could not be opened. Please try again or email support@outsideinprint.org.");
    });
  });


  }
  if (window.oipRegisterRouteWidget) {
    window.oipRegisterRouteWidget("epub-checkout", mount);
  } else {
    mount({ on: function (target, type, callback, options) { target.addEventListener(type, callback, options); }, cleanup: function () {}, active: function () { return true; } });
  }
}());
