import { HttpError } from "./http.js";

const certCache = new Map();
const encoder = new TextEncoder();

function decodeBase64UrlBytes(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let decoded;
  try {
    decoded = atob(padded);
  } catch {
    throw new HttpError(403, "ADMIN_ACCESS_REQUIRED");
  }
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function decodeJwtPart(value) {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64UrlBytes(value)));
  } catch {
    throw new HttpError(403, "ADMIN_ACCESS_REQUIRED");
  }
}

async function accessKeys(env, issuer) {
  const cached = certCache.get(issuer);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.keys;
  const outboundFetch = env.__testFetch || globalThis.fetch;
  let response;
  try {
    response = await outboundFetch(`${issuer}/cdn-cgi/access/certs`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new HttpError(503, "ADMIN_ACCESS_VALIDATION_UNAVAILABLE");
  }
  if (!response.ok) throw new HttpError(503, "ADMIN_ACCESS_VALIDATION_UNAVAILABLE");
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(503, "ADMIN_ACCESS_VALIDATION_UNAVAILABLE");
  }
  if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
    throw new HttpError(503, "ADMIN_ACCESS_VALIDATION_UNAVAILABLE");
  }
  certCache.set(issuer, { keys: payload.keys, expiresAt: now + 60 * 60 * 1000 });
  return payload.keys;
}

function expectedAccessConfig(env) {
  const issuer = String(env.CF_ACCESS_ISSUER || "").replace(/\/$/u, "");
  const audience = String(env.CF_ACCESS_AUD || "");
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/u.test(issuer) || !audience) {
    throw new HttpError(503, "ADMIN_ACCESS_NOT_CONFIGURED");
  }
  return { issuer, audience };
}

export async function requireCloudflareAccessAdmin(request, env, nowSeconds) {
  const assertedEmail = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  const assertion = request.headers.get("cf-access-jwt-assertion");
  const permitted = new Set(
    String(env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!assertedEmail || !assertion || !permitted.has(assertedEmail)) {
    throw new HttpError(403, "ADMIN_ACCESS_REQUIRED");
  }
  const { issuer, audience } = expectedAccessConfig(env);
  const parts = assertion.split(".");
  if (parts.length !== 3) throw new HttpError(403, "ADMIN_ACCESS_REQUIRED");
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new HttpError(403, "ADMIN_ACCESS_REQUIRED");
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (
    payload.iss !== issuer ||
    !audiences.includes(audience) ||
    email !== assertedEmail ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= nowSeconds ||
    (Number.isFinite(payload.nbf) && payload.nbf > nowSeconds + 30)
  ) {
    throw new HttpError(403, "ADMIN_ACCESS_REQUIRED");
  }
  const jwk = (await accessKeys(env, issuer)).find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new HttpError(403, "ADMIN_ACCESS_REQUIRED");
  let key;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new HttpError(503, "ADMIN_ACCESS_VALIDATION_UNAVAILABLE");
  }
  const verified = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    decodeBase64UrlBytes(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) throw new HttpError(403, "ADMIN_ACCESS_REQUIRED");
  return { email };
}
