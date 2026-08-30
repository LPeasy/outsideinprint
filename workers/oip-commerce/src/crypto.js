const encoder = new TextEncoder();
const SQUARE_EVENT_ID_RE = /^[A-Za-z0-9_-]{1,192}$/u;

export function isValidSquareEventId(value) {
  return typeof value === "string" && SQUARE_EVENT_ID_RE.test(value);
}

export function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Base64(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(value)));
  return bytesToBase64(new Uint8Array(signature));
}

export async function hmacSha256Hex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(value)));
  return bytesToHex(new Uint8Array(signature));
}

export async function deriveDownloadToken(secret, fulfillmentId, generation) {
  if (!secret || !fulfillmentId || !Number.isSafeInteger(generation) || generation < 1) {
    throw new TypeError("Invalid download-token derivation input.");
  }
  return (await hmacSha256Base64(secret, `oip-download:v1:${fulfillmentId}:${generation}`))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export async function constantTimeEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right))),
  ]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

export async function verifySquareSignature({ rawBody, signature, notificationUrl, signatureKey }) {
  if (!signature || !notificationUrl || !signatureKey) return false;
  const expected = await hmacSha256Base64(signatureKey, `${notificationUrl}${rawBody}`);
  return await constantTimeEqual(signature, expected);
}
