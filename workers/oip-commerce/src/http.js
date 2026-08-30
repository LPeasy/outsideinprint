export class HttpError extends Error {
  constructor(status, code, message = "Request could not be completed.") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export async function readJson(request, maxBytes = 4096) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "JSON_REQUIRED", "Send an application/json request.");
  }
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "Request is too large.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "Request is too large.");
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("not an object");
    return parsed;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

export function requireBinding(env, name) {
  const value = env[name];
  if (value === undefined || value === null || value === "" || value === "SET_DURING_PROVISIONING") {
    throw new HttpError(503, "SERVICE_NOT_CONFIGURED", "Checkout is not available yet.");
  }
  return value;
}

export function validateSupportAmount(payload) {
  if (Object.keys(payload).some((key) => key !== "amount_cents")) {
    throw new HttpError(400, "UNEXPECTED_FIELD", "Only amount_cents is accepted.");
  }
  const amount = payload.amount_cents;
  if (!Number.isSafeInteger(amount) || amount < 500 || amount > 50000 || amount % 100 !== 0) {
    throw new HttpError(
      400,
      "INVALID_AMOUNT",
      "Choose a whole-dollar amount from $5 through $500.",
    );
  }
  return amount;
}

export function validateEpubCheckoutRequest(payload) {
  const allowedFields = new Set(["sku", "country_code", "email"]);
  if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
    throw new HttpError(400, "UNEXPECTED_FIELD", "Only sku, country_code, and email are accepted.");
  }
  if (typeof payload.sku !== "string" || !/^[A-Z0-9-]{1,64}$/u.test(payload.sku)) {
    throw new HttpError(400, "INVALID_EPUB_SKU", "Choose an available EPUB edition.");
  }
  if (payload.country_code !== "US") {
    throw new HttpError(403, "EPUB_US_ONLY", "Direct EPUB checkout is available only to U.S. customers.");
  }
  const email = normalizeEmailAddress(payload.email);
  if (!email) {
    throw new HttpError(400, "INVALID_BUYER_EMAIL", "Enter the email address that should receive the EPUB.");
  }
  return { sku: payload.sku, countryCode: payload.country_code, email };
}

export function normalizeEmailAddress(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (
    normalized.length < 3 || normalized.length > 256 ||
    /[\u0000-\u0020\u007f]/u.test(normalized) ||
    !/^[^@]+@[^@]+$/u.test(normalized)
  ) return null;
  const [local, domain] = normalized.split("@");
  if (!local || local.length > 64 || !domain || domain.length > 255 ||
      domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null;
  return normalized;
}

const US_SHIPPING_REGIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV",
  "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN",
  "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

function requiredAddressString(value, field, maximum) {
  if (typeof value !== "string") {
    throw new HttpError(400, "PHYSICAL_ADDRESS_INVALID", `Enter a valid ${field}.`);
  }
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new HttpError(400, "PHYSICAL_ADDRESS_INVALID", `Enter a valid ${field}.`);
  }
  return normalized;
}

export function validatePhysicalDestination(destination) {
  const destinationFields = new Set([
    "country", "address_line_1", "address_line_2", "locality",
    "administrative_district_level_1", "postal_code",
  ]);
  if (!destination || Array.isArray(destination) || typeof destination !== "object" ||
      Object.keys(destination).some((key) => !destinationFields.has(key))) {
    throw new HttpError(400, "PHYSICAL_ADDRESS_INVALID", "Enter a valid U.S. shipping address.");
  }
  if (destination.country !== "US") {
    throw new HttpError(403, "PHYSICAL_US_ONLY", "Paperback shipping is available only in the United States.");
  }
  const addressLine1 = requiredAddressString(destination.address_line_1, "street address", 128);
  const addressLine2 = typeof destination.address_line_2 === "string"
    ? destination.address_line_2.normalize("NFKC").trim().replace(/\s+/gu, " ")
    : "";
  if (addressLine2.length > 64 || /[\u0000-\u001f\u007f]/u.test(addressLine2)) {
    throw new HttpError(400, "PHYSICAL_ADDRESS_INVALID", "Enter a valid apartment, suite, or unit.");
  }
  if (/(?:^|\s)(?:(?:APT|APARTMENT|UNIT|STE|SUITE|BLDG|BUILDING|FL|FLOOR|ROOM|RM)\b|#)\s*[-:#]?[A-Z0-9]/iu.test(addressLine1)) {
    throw new HttpError(400, "PHYSICAL_ADDRESS_UNIT_PLACEMENT", "Enter apartment, suite, or unit in address line 2.");
  }
  const specialAddress = `${addressLine1} ${addressLine2}`.trim();
  if (/(?:^|\s)(?:P(?:OST)?\.?\s*O(?:FFICE)?\.?\s+BOX|GENERAL\s+DELIVERY|APO|FPO|DPO|RR|RURAL\s+ROUTE|HC|HIGHWAY\s+CONTRACT)\b/iu.test(specialAddress)) {
    throw new HttpError(409, "PHYSICAL_ADDRESS_SPECIAL_UNSUPPORTED", "This address requires manual review.");
  }
  const locality = requiredAddressString(destination.locality, "city", 96);
  const region = requiredAddressString(
    destination.administrative_district_level_1,
    "state",
    2,
  ).toUpperCase();
  if (!US_SHIPPING_REGIONS.has(region)) {
    throw new HttpError(403, "PHYSICAL_US_ONLY", "Paperback shipping is limited to the 50 states and D.C.");
  }
  const postalCode = requiredAddressString(destination.postal_code, "ZIP Code", 10);
  if (!/^\d{5}(?:-\d{4})?$/u.test(postalCode)) {
    throw new HttpError(400, "PHYSICAL_POSTAL_CODE_INVALID", "Enter a five- or nine-digit U.S. ZIP Code.");
  }
  return {
    country: "US",
    address_line_1: addressLine1,
    address_line_2: addressLine2,
    locality,
    administrative_district_level_1: region,
    postal_code: postalCode,
  };
}

export function validatePhysicalCheckoutRequest(payload) {
  const allowedFields = new Set(["items", "destination"]);
  if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
    throw new HttpError(400, "UNEXPECTED_FIELD", "Only items and destination are accepted.");
  }
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 3) {
    throw new HttpError(400, "PHYSICAL_ITEMS_INVALID", "Choose one through six paperback copies.");
  }
  const items = [];
  const seen = new Set();
  let totalQuantity = 0;
  for (const item of payload.items) {
    if (!item || Array.isArray(item) || typeof item !== "object" ||
        Object.keys(item).some((key) => !["sku", "quantity"].includes(key))) {
      throw new HttpError(400, "PHYSICAL_ITEM_INVALID", "Each item must contain only sku and quantity.");
    }
    if (typeof item.sku !== "string" || !/^OIP-[A-Z]{2}-[A-Z]+$/u.test(item.sku)) {
      throw new HttpError(400, "PHYSICAL_ITEM_INVALID", "Choose an available paperback edition.");
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 6) {
      throw new HttpError(400, "PHYSICAL_QUANTITY_INVALID", "Paperback quantity must be one through six.");
    }
    if (seen.has(item.sku)) {
      throw new HttpError(400, "PHYSICAL_DUPLICATE_SKU", "Combine duplicate paperback quantities.");
    }
    seen.add(item.sku);
    totalQuantity += item.quantity;
    items.push({ sku: item.sku, quantity: item.quantity });
  }
  if (totalQuantity < 1 || totalQuantity > 6) {
    throw new HttpError(400, "PHYSICAL_QUANTITY_INVALID", "An order may contain at most six books.");
  }
  items.sort((left, right) => left.sku.localeCompare(right.sku));
  return { items, totalQuantity, destination: validatePhysicalDestination(payload.destination) };
}

export function allowedOrigins(env) {
  const origins = new Set(
    String(env.ALLOWED_ORIGINS || "https://outsideinprint.org")
      .split(",")
      .map((value) => value.trim().replace(/\/$/u, ""))
      .filter(Boolean),
  );
  if (parseBoolean(env.ALLOW_LOCAL_ORIGINS, false)) {
    origins.add("http://localhost:1313");
    origins.add("http://127.0.0.1:1313");
  }
  return origins;
}

export function corsHeadersFor(request, env) {
  const origin = (request.headers.get("origin") || "").replace(/\/$/u, "");
  if (!origin || !allowedOrigins(env).has(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Idempotency-Key",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function requireAllowedOrigin(request, env) {
  const headers = corsHeadersFor(request, env);
  if (!headers) throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed.");
  return headers;
}

export function requireAllowedHost(request, env) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const expected = String(env.PUBLIC_HOST || "downloads.outsideinprint.org").toLowerCase();
  const localAllowed =
    parseBoolean(env.ALLOW_LOCAL_ORIGINS, false) && ["localhost", "127.0.0.1"].includes(hostname);
  if (hostname !== expected && !localAllowed) {
    throw new HttpError(404, "NOT_FOUND", "Route not found.");
  }
}

export function validateIdempotencyKey(value) {
  if (!value) {
    throw new HttpError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Send a unique Idempotency-Key for this checkout attempt.",
    );
  }
  if (value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(value)) {
    throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is invalid.");
  }
  return value;
}

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}
