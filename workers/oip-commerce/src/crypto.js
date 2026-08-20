const encoder = new TextEncoder();

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

export function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  const length = Math.max(a.length, b.length);
  let different = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    different |= (a[index] || 0) ^ (b[index] || 0);
  }
  return different === 0;
}

export async function verifySquareSignature({ rawBody, signature, notificationUrl, signatureKey }) {
  if (!signature || !notificationUrl || !signatureKey) return false;
  const expected = await hmacSha256Base64(signatureKey, `${notificationUrl}${rawBody}`);
  return constantTimeEqual(signature, expected);
}
