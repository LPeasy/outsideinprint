(function () {
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
    return [
      "oip",
      Date.now().toString(36),
      fallbackSequence.toString(36),
      Math.random().toString(36).slice(2, 14)
    ].join("-");
  }

  function getAmountCents(form) {
    var centsInput = form.querySelector("[name='amount_cents']");
    var dollarsInput = form.querySelector("[name='amount_dollars']");
    var cents;
    var dollars;

    if (centsInput) {
      cents = Number(centsInput.value);
    } else if (dollarsInput) {
      dollars = Number(dollarsInput.value);
      cents = dollars * 100;
    }

    if (!Number.isInteger(cents) || cents < 500 || cents > 50000 || cents % 100 !== 0) {
      return null;
    }

    return cents;
  }

  function getCheckoutUrl(payload) {
    var checkoutUrl = payload && (payload.checkout_url || payload.url);
    var parsed;

    if (!checkoutUrl) {
      return "";
    }

    try {
      parsed = new URL(checkoutUrl);
    } catch (error) {
      return "";
    }

    if (parsed.protocol !== "https:") {
      return "";
    }

    if (parsed.hostname !== "square.link" && parsed.hostname !== "checkout.square.site") {
      return "";
    }

    return parsed.href;
  }

  function setStatus(form, message) {
    var status = form.querySelector("[data-checkout-status]");

    if (status) {
      status.textContent = message;
    }
  }

  document.addEventListener("submit", function (event) {
    var form = event.target;
    var submitButton;
    var amountCents;
    var originalLabel;
    var request;
    var idempotencyKey;

    if (!form || !form.matches("[data-support-checkout]")) {
      return;
    }

    event.preventDefault();
    submitButton = form.querySelector("button[type='submit']");

    if (!submitButton || submitButton.disabled) {
      return;
    }

    amountCents = getAmountCents(form);
    if (amountCents === null) {
      setStatus(form, "Enter a whole-dollar amount from $5 to $500.");
      return;
    }

    originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    submitButton.textContent = "Opening secure checkout…";
    setStatus(form, "Connecting to Square…");
    idempotencyKey = createIdempotencyKey();

    request = fetch(form.action, {
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
      body: JSON.stringify({ amount_cents: amountCents })
    });

    request.then(function (response) {
      if (!response.ok) {
        throw new Error("checkout_request_failed");
      }

      return response.json();
    }).then(function (payload) {
      var checkoutUrl = getCheckoutUrl(payload);

      if (!checkoutUrl) {
        throw new Error("checkout_url_missing");
      }

      window.location.assign(checkoutUrl);
    }).catch(function () {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
      submitButton.textContent = originalLabel;
      setStatus(form, "Secure checkout could not be opened. Please try again or email support@outsideinprint.org.");
    });
  });
}());
