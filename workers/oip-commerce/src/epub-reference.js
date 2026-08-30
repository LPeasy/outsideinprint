import { constantTimeEqual, hmacSha256Base64 } from "./crypto.js";

const REFERENCE_PATTERN = /^E1\.([0-9a-z]{1,9})\.([A-Za-z0-9_-]{22})$/u;
const CLOCK_SKEW_SECONDS = 5 * 60;

function signingInput({ issuedAt, sku }) {
  return JSON.stringify([
    "oip-epub-us-order:v1",
    "US",
    issuedAt,
    sku,
  ]);
}

function base64UrlPrefix(value) {
  return value.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "").slice(0, 22);
}

export async function createEpubUsOrderReference(secret, { issuedAt, sku }) {
  if (!secret || !Number.isSafeInteger(issuedAt) || issuedAt < 1 ||
      typeof sku !== "string" || !sku) {
    throw new TypeError("Invalid EPUB order-reference input.");
  }
  const timestamp = issuedAt.toString(36);
  const signature = base64UrlPrefix(
    await hmacSha256Base64(secret, signingInput({ issuedAt, sku })),
  );
  const reference = `E1.${timestamp}.${signature}`;
  if (reference.length > 40) throw new TypeError("EPUB order reference is too long.");
  return reference;
}

export async function verifyEpubUsOrderReference(
  secret,
  { referenceId, paymentCreatedAt, sku },
) {
  const match = typeof referenceId === "string" ? REFERENCE_PATTERN.exec(referenceId) : null;
  if (!match || typeof paymentCreatedAt !== "string") return false;
  const issuedAt = Number.parseInt(match[1], 36);
  const paymentTime = Date.parse(paymentCreatedAt);
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 1 || !Number.isFinite(paymentTime)) return false;
  if (issuedAt.toString(36) !== match[1]) return false;
  const paidAt = Math.floor(paymentTime / 1000);
  if (paidAt < issuedAt - CLOCK_SKEW_SECONDS) return false;
  let expected;
  try {
    expected = await createEpubUsOrderReference(secret, { issuedAt, sku });
  } catch {
    return false;
  }
  return constantTimeEqual(expected, referenceId);
}
