(function () {
  "use strict";

  var fallbackSequence = 0;
  var checkoutIntents = new WeakMap();

  function createIdempotencyKey() {
    var bytes;
    var hex;
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
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

  function idempotencyKeyFor(form, signature) {
    var existing = checkoutIntents.get(form);
    if (existing && existing.signature === signature) return existing.key;
    existing = { signature: signature, key: createIdempotencyKey() };
    checkoutIntents.set(form, existing);
    return existing.key;
  }

  function setStatus(form, message) {
    var status = form.querySelector("[data-physical-checkout-status]");
    if (status) status.textContent = message;
  }

  function isKnownPaperbackSku(sku) {
    return sku === "OIP-AN-PB" || sku === "OIP-PS-PB" || sku === "OIP-WC-PB";
  }

  function collectPaperbackItems(form, fields) {
    var items = [];
    var invalid = false;
    var totalQuantity = 0;
    var seen = Object.create(null);
    var inputs;

    if (form.matches("[data-physical-cart-checkout]")) {
      inputs = form.querySelectorAll("[data-physical-cart-item]");
      if (!inputs.length) return null;
      Array.prototype.forEach.call(inputs, function (input) {
        var sku = input.dataset.physicalSku || "";
        var quantity = Number(input.value);
        if (invalid) return;
        if (!isKnownPaperbackSku(sku) || seen[sku] || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 6) {
          invalid = true;
          return;
        }
        seen[sku] = true;
        if (quantity > 0) {
          items.push({ sku: sku, quantity: quantity });
          totalQuantity += quantity;
        }
      });
    } else {
      var sku = form.dataset.physicalSku || "";
      var quantity = Number(fields.get("quantity"));
      if (!isKnownPaperbackSku(sku) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 6) return null;
      items.push({ sku: sku, quantity: quantity });
      totalQuantity = quantity;
    }

    if (invalid || totalQuantity < 1 || totalQuantity > 6) return null;
    return items;
  }

  document.addEventListener("submit", function (event) {
    var form = event.target;
    var fields;
    var button;
    var items;
    var payload;
    var requestBody;
    var idempotencyKey;
    var originalLabel;
    if (!form || !form.matches("[data-physical-checkout]")) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    button = form.querySelector("button[type='submit']");
    fields = new FormData(form);
    items = collectPaperbackItems(form, fields);
    if (!items) {
      setStatus(form, "Choose between one and six paperbacks total.");
      return;
    }
    if (!button || button.disabled) return;

    originalLabel = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Checking address and tax…";
    setStatus(form, "Preparing a single-use Square checkout…");

    payload = {
      items: items,
      destination: {
        country: "US",
        address_line_1: String(fields.get("address_line_1") || ""),
        address_line_2: String(fields.get("address_line_2") || ""),
        locality: String(fields.get("locality") || ""),
        administrative_district_level_1: String(fields.get("administrative_district_level_1") || "").toUpperCase(),
        postal_code: String(fields.get("postal_code") || "")
      }
    };
    requestBody = JSON.stringify(payload);
    idempotencyKey = idempotencyKeyFor(form, requestBody);

    fetch(form.action, {
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
      body: requestBody
    }).then(function (response) {
      if (!response.ok) return response.json().catch(function () { return {}; }).then(function (payload) {
        var code = payload && payload.error && payload.error.code;
        if (code === "PHYSICAL_CHECKOUT_EXPIRED" || code === "PHYSICAL_CHECKOUT_NOT_REUSABLE" ||
            code === "IDEMPOTENCY_CONFLICT") checkoutIntents.delete(form);
        throw new Error(payload && payload.error && payload.error.message || "checkout_request_failed");
      });
      return response.json();
    }).then(function (payload) {
      var checkoutUrl = secureSquareUrl(payload);
      if (!checkoutUrl) throw new Error("checkout_url_missing");
      window.location.assign(checkoutUrl);
    }).catch(function (error) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = originalLabel;
      setStatus(form, error.message && error.message !== "checkout_request_failed"
        ? error.message
        : "Secure checkout could not be opened. Please try again or email support@outsideinprint.org.");
    });
  });
}());
