import { hmacSha256Hex, sha256Hex } from "./crypto.js";
import { HttpError, requireBinding } from "./http.js";

export const POINTMATCH_RESOLUTION_METHOD = "POINTMATCH_EXACT_HMAC_V1";
export const US_ZIP_STATE_RESOLUTION_METHOD = "USPS_ADDRESSES_API_V3_CITY_STATE_EXACT";

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const ZIP5 = /^\d{5}$/u;
const US_REGIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV",
  "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN",
  "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);
const FLORIDA_COUNTY_FIPS = Object.freeze(
  Array.from({ length: 67 }, (_, index) => `12${String((index * 2) + 1).padStart(3, "0")}`),
);

function isPlainObject(value) {
  return Boolean(value) && !Array.isArray(value) && typeof value === "object";
}

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

function requireSha256Binding(env, name, code, message) {
  const value = String(requireBinding(env, name));
  if (!SHA256_HEX.test(value)) throw new HttpError(503, code, message);
  return value;
}

function normalizedPart(value) {
  return String(value || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[.,]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const ADDRESS_TOKEN_MAP = Object.freeze({
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
  STREET: "ST", AVENUE: "AVE", BOULEVARD: "BLVD", ROAD: "RD", DRIVE: "DR",
  LANE: "LN", COURT: "CT", CIRCLE: "CIR", HIGHWAY: "HWY", PARKWAY: "PKWY",
  PLACE: "PL", TERRACE: "TER", TRAIL: "TRL", TURNPIKE: "TPKE", SQUARE: "SQ",
  PLAZA: "PLZ",
});

const UNIT_TOKEN_MAP = Object.freeze({
  APARTMENT: "APT", SUITE: "STE", BUILDING: "BLDG", FLOOR: "FL", ROOM: "RM",
});

function normalizedTokens(value, replacements) {
  return normalizedPart(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => replacements[token] || token)
    .join(" ");
}

export function normalizedAddressParts(destination) {
  return {
    addressLine1: normalizedTokens(destination.address_line_1, ADDRESS_TOKEN_MAP),
    addressLine2: normalizedTokens(destination.address_line_2, UNIT_TOKEN_MAP),
    locality: normalizedPart(destination.locality),
    region: normalizedPart(destination.administrative_district_level_1),
    postalCode: normalizedPart(destination.postal_code).slice(0, 5),
  };
}

export function normalizedAddressKey(destination, { includeUnit = true } = {}) {
  const parts = normalizedAddressParts(destination);
  return [
    parts.addressLine1,
    includeUnit ? parts.addressLine2 : "",
    parts.locality,
    parts.region,
    parts.postalCode,
    "US",
  ].join("|");
}

export async function physicalAddressBindingHash(env, destination) {
  const secret = requireBinding(env, "ADDRESS_LOOKUP_HMAC_SECRET");
  return hmacSha256Hex(secret, `oip-physical-binding:v1:${normalizedAddressKey(destination)}`);
}

async function pointMatchLookupHash(env, destination, includeUnit) {
  const secret = requireBinding(env, "ADDRESS_LOOKUP_HMAC_SECRET");
  return hmacSha256Hex(
    secret,
    `oip-pointmatch:v1:${normalizedAddressKey(destination, { includeUnit })}`,
  );
}

function validManifest(manifest, { version, schemaVersion, now }) {
  return (
    manifest &&
    manifest.dataset_version === version &&
    manifest.schema_version === schemaVersion &&
    manifest.status === "ACTIVE" &&
    Number.isSafeInteger(manifest.effective_from) && manifest.effective_from <= now &&
    Number.isSafeInteger(manifest.effective_through) && manifest.effective_through >= now &&
    Number.isSafeInteger(manifest.stale_after) && manifest.stale_after >= now &&
    Number.isSafeInteger(manifest.row_count) && manifest.row_count > 0 &&
    typeof manifest.content_sha256 === "string" && SHA256_HEX.test(manifest.content_sha256)
  );
}

function validRateManifest(manifest, { version, now }) {
  return (
    manifest &&
    manifest.rate_version === version &&
    manifest.status === "ACTIVE" &&
    Number.isSafeInteger(manifest.effective_from) && manifest.effective_from <= now &&
    Number.isSafeInteger(manifest.effective_through) && manifest.effective_through >= now &&
    Number.isSafeInteger(manifest.stale_after) && manifest.stale_after >= now &&
    Number.isSafeInteger(manifest.row_count) && manifest.row_count === 67 &&
    typeof manifest.content_sha256 === "string" && SHA256_HEX.test(manifest.content_sha256)
  );
}

function configuredShardPrefix(env) {
  const prefix = String(env.POINTMATCH_SHARD_PREFIX || "pointmatch").replace(/^\/+|\/+$/gu, "");
  if (!/^[A-Za-z0-9/_-]{1,128}$/u.test(prefix)) {
    throw new HttpError(503, "POINTMATCH_SHARD_PROVIDER_NOT_CONFIGURED", "Florida address validation is unavailable.");
  }
  return prefix;
}

function pointMatchIndexEntryValid(entry, { datasetVersion, zip5 = null, prefix }) {
  if (!hasExactKeys(entry, ["zip5", "object_key", "row_count", "content_sha256"])) return false;
  if (!ZIP5.test(entry.zip5) || (zip5 !== null && entry.zip5 !== zip5)) return false;
  const expectedObjectKey = `${prefix}/${datasetVersion}/zip5/${entry.zip5}.json`;
  return (
    entry.object_key === expectedObjectKey &&
    Number.isSafeInteger(entry.row_count) && entry.row_count > 0 &&
    typeof entry.content_sha256 === "string" && SHA256_HEX.test(entry.content_sha256)
  );
}

export function canonicalPointMatchIndex(payload) {
  return JSON.stringify({
    dataset_version: payload.dataset_version,
    schema_version: payload.schema_version,
    row_count: payload.row_count,
    shard_count: payload.shard_count,
    shards: payload.shards.map((entry) => ({
      zip5: entry.zip5,
      object_key: entry.object_key,
      row_count: entry.row_count,
      content_sha256: entry.content_sha256,
    })),
  });
}

function validPointMatchRecord(record) {
  const required = [
    "address_hmac", "county_fips", "match_status", "pending_effective_date",
    "special_case_code", "resolution_method", "unit_policy",
  ];
  return (
    hasExactKeys(record, required) &&
    typeof record.address_hmac === "string" && SHA256_HEX.test(record.address_hmac) &&
    typeof record.county_fips === "string" && /^12\d{3}$/u.test(record.county_fips) &&
    ["EXACT", "NONEXACT"].includes(record.match_status) &&
    (record.pending_effective_date === null || record.pending_effective_date === "" ||
      /^\d{4}-\d{2}-\d{2}$/u.test(record.pending_effective_date)) &&
    (record.special_case_code === null || record.special_case_code === "" ||
      (typeof record.special_case_code === "string" && /^[A-Z0-9_-]{1,64}$/u.test(record.special_case_code))) &&
    record.resolution_method === POINTMATCH_RESOLUTION_METHOD &&
    ["UNIT_SPECIFIC", "NOT_JURISDICTION_DEPENDENT"].includes(record.unit_policy)
  );
}

async function readPrivateJurisdictionObject(env, objectKey, unavailableCode, invalidCode, maxBytes) {
  if (!env.JURISDICTION_BUCKET || typeof env.JURISDICTION_BUCKET.get !== "function") {
    throw new HttpError(
      503,
      "POINTMATCH_SHARD_PROVIDER_NOT_CONFIGURED",
      "Florida address validation is unavailable.",
    );
  }
  const object = await env.JURISDICTION_BUCKET.get(objectKey);
  if (!object || typeof object.text !== "function" ||
      (Number.isFinite(object.size) && (object.size < 2 || object.size > maxBytes))) {
    throw new HttpError(503, unavailableCode, "Florida address validation is unavailable.");
  }
  const raw = await object.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(503, invalidCode, "Florida address validation is unavailable.");
  }
  return raw;
}

async function loadPointMatchIndex(env, { datasetVersion, schemaVersion, manifest }) {
  const prefix = configuredShardPrefix(env);
  const rootSha256 = requireSha256Binding(
    env,
    "POINTMATCH_INDEX_ROOT_SHA256",
    "POINTMATCH_INDEX_PROVIDER_NOT_CONFIGURED",
    "Florida address validation is unavailable.",
  );
  if (manifest.content_sha256 !== rootSha256) {
    throw new HttpError(503, "POINTMATCH_INDEX_DIGEST_MISMATCH", "Florida address validation is unavailable.");
  }
  const objectKey = `${prefix}/${datasetVersion}/index.json`;
  const raw = await readPrivateJurisdictionObject(
    env,
    objectKey,
    "POINTMATCH_INDEX_UNAVAILABLE",
    "POINTMATCH_INDEX_INVALID",
    25 * 1024 * 1024,
  );
  if (await sha256Hex(raw) !== rootSha256) {
    throw new HttpError(503, "POINTMATCH_INDEX_INVALID", "Florida address validation is unavailable.");
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new HttpError(503, "POINTMATCH_INDEX_INVALID", "Florida address validation is unavailable.");
  }
  const keys = ["dataset_version", "schema_version", "row_count", "shard_count", "shards"];
  if (
    !hasExactKeys(payload, keys) || payload.dataset_version !== datasetVersion ||
    payload.schema_version !== schemaVersion ||
    !Number.isSafeInteger(payload.row_count) || payload.row_count !== manifest.row_count ||
    !Number.isSafeInteger(payload.shard_count) || payload.shard_count < 1 ||
    !Array.isArray(payload.shards) || payload.shards.length !== payload.shard_count ||
    payload.shards.length > 100000 ||
    !payload.shards.every((entry) => pointMatchIndexEntryValid(entry, { datasetVersion, prefix }))
  ) {
    throw new HttpError(503, "POINTMATCH_INDEX_INVALID", "Florida address validation is unavailable.");
  }
  let previousZip5 = "";
  let indexedRows = 0;
  for (const entry of payload.shards) {
    if (entry.zip5 <= previousZip5 || !Number.isSafeInteger(indexedRows + entry.row_count)) {
      throw new HttpError(503, "POINTMATCH_INDEX_INVALID", "Florida address validation is unavailable.");
    }
    previousZip5 = entry.zip5;
    indexedRows += entry.row_count;
  }
  if (indexedRows !== payload.row_count || raw !== canonicalPointMatchIndex(payload)) {
    throw new HttpError(503, "POINTMATCH_INDEX_INVALID", "Florida address validation is unavailable.");
  }
  return { prefix, payload };
}

async function loadPointMatchShard(env, { datasetVersion, schemaVersion, destination, manifest }) {
  const zip5 = normalizedAddressParts(destination).postalCode;
  if (!ZIP5.test(zip5)) {
    throw new HttpError(409, "FL_ADDRESS_NOT_FOUND", "This Florida address could not be matched exactly.");
  }
  const { prefix, payload: index } = await loadPointMatchIndex(
    env,
    { datasetVersion, schemaVersion, manifest },
  );
  const matches = index.shards.filter((entry) => entry.zip5 === zip5);
  if (matches.length !== 1 ||
      !pointMatchIndexEntryValid(matches[0], { datasetVersion, zip5, prefix })) {
    throw new HttpError(503, "FL_JURISDICTION_SHARD_UNAVAILABLE", "Florida address validation is unavailable.");
  }
  const shardIndex = matches[0];
  const raw = await readPrivateJurisdictionObject(
    env,
    shardIndex.object_key,
    "FL_JURISDICTION_SHARD_UNAVAILABLE",
    "FL_JURISDICTION_SHARD_INVALID",
    25 * 1024 * 1024,
  );
  if (await sha256Hex(raw) !== shardIndex.content_sha256) {
    throw new HttpError(503, "FL_JURISDICTION_SHARD_INVALID", "Florida address validation is unavailable.");
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new HttpError(503, "FL_JURISDICTION_SHARD_INVALID", "Florida address validation is unavailable.");
  }
  if (
    !hasExactKeys(payload, ["dataset_version", "schema_version", "zip5", "records"]) ||
    payload.dataset_version !== datasetVersion ||
    payload.schema_version !== schemaVersion || payload.zip5 !== zip5 ||
    !Array.isArray(payload.records) || payload.records.length !== shardIndex.row_count ||
    !payload.records.every(validPointMatchRecord)
  ) {
    throw new HttpError(503, "FL_JURISDICTION_SHARD_INVALID", "Florida address validation is unavailable.");
  }
  return payload.records;
}

const USPS_ADDRESSES_API_HOSTS = new Set([
  "apis.usps.com", "apis-tem.usps.com", "api.private.usps.com", "api-tem.private.usps.com",
]);
const USPS_OAUTH_URLS = new Set([
  "https://apis.usps.com/oauth2/v3/token",
  "https://apis-tem.usps.com/oauth2/v3/token",
]);
const uspsTokenCache = new WeakMap();

function uspsProviderConfiguration(env) {
  if (String(env.US_ZIP_STATE_PROVIDER || "") !== "USPS_ADDRESSES_API_V3") {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_NOT_CONFIGURED", "U.S. ZIP Code validation is unavailable.");
  }
  let baseUrl;
  try {
    baseUrl = new URL(String(requireBinding(env, "USPS_ADDRESSES_API_BASE_URL")));
  } catch {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_NOT_CONFIGURED", "U.S. ZIP Code validation is unavailable.");
  }
  const tokenUrl = String(requireBinding(env, "USPS_OAUTH_TOKEN_URL"));
  const apiVersion = String(requireBinding(env, "USPS_ADDRESSES_API_VERSION"));
  const clientId = String(requireBinding(env, "USPS_API_CLIENT_ID"));
  const clientSecret = String(requireBinding(env, "USPS_API_CLIENT_SECRET"));
  const testBase = baseUrl.hostname.includes("-tem.") || baseUrl.hostname.startsWith("apis-tem.");
  const testToken = tokenUrl === "https://apis-tem.usps.com/oauth2/v3/token";
  if (
    baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash ||
    baseUrl.pathname !== "/" || baseUrl.port !== "" || !USPS_ADDRESSES_API_HOSTS.has(baseUrl.hostname) ||
    !USPS_OAUTH_URLS.has(tokenUrl) || testBase !== testToken || !/^3\.\d+\.\d+$/u.test(apiVersion) ||
    clientId.length < 8 || clientId.length > 512 || clientSecret.length < 8 || clientSecret.length > 2048
  ) {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_NOT_CONFIGURED", "U.S. ZIP Code validation is unavailable.");
  }
  return {
    baseUrl: baseUrl.origin,
    tokenUrl,
    apiVersion,
    clientId,
    clientSecret,
  };
}

function uspsFetch(env) {
  return typeof env.__testFetch === "function" ? env.__testFetch : fetch;
}

async function uspsAccessToken(env, configuration, now) {
  const cached = uspsTokenCache.get(env);
  if (cached && cached.expiresAt > now + 30) return cached.value;
  let response;
  try {
    response = await uspsFetch(env)(configuration.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_UNAVAILABLE", "U.S. ZIP Code validation is unavailable.");
  }
  if (!response.ok) {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_UNAVAILABLE", "U.S. ZIP Code validation is unavailable.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_INVALID", "U.S. ZIP Code validation is unavailable.");
  }
  const scopes = typeof payload?.scope === "string" ? payload.scope.split(/\s+/u) : [];
  if (
    typeof payload?.access_token !== "string" || payload.access_token.length < 8 || payload.access_token.length > 8192 ||
    payload.token_type !== "Bearer" || payload.status !== "approved" ||
    !Number.isSafeInteger(payload.expires_in) || payload.expires_in < 60 || payload.expires_in > 86400 ||
    !scopes.includes("addresses")
  ) {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_INVALID", "U.S. ZIP Code validation is unavailable.");
  }
  uspsTokenCache.set(env, { value: payload.access_token, expiresAt: now + payload.expires_in - 30 });
  return payload.access_token;
}

async function resolveNonFloridaZipState(env, destination, now) {
  const zip5 = normalizedAddressParts(destination).postalCode;
  const stateCode = normalizedPart(destination.administrative_district_level_1);
  if (!ZIP5.test(zip5) || !US_REGIONS.has(stateCode) || stateCode === "FL") {
    throw new HttpError(409, "PHYSICAL_ZIP_STATE_UNVERIFIED", "This ZIP Code and state could not be verified.");
  }
  const configuration = uspsProviderConfiguration(env);
  const token = await uspsAccessToken(env, configuration, now);
  let response;
  try {
    response = await uspsFetch(env)(
      `${configuration.baseUrl}/addresses/v3/city-state?ZIPCode=${encodeURIComponent(zip5)}`,
      {
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_UNAVAILABLE", "U.S. ZIP Code validation is unavailable.");
  }
  if (!response.ok) {
    throw new HttpError(409, "PHYSICAL_ZIP_STATE_UNVERIFIED", "This ZIP Code and state could not be verified.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_INVALID", "U.S. ZIP Code validation is unavailable.");
  }
  const allowed = new Set(["city", "state", "ZIPCode"]);
  if (
    !isPlainObject(payload) || Object.keys(payload).some((key) => !allowed.has(key)) ||
    typeof payload.city !== "string" || !payload.city.trim() || payload.city.length > 128 ||
    typeof payload.state !== "string" || !US_REGIONS.has(payload.state) || payload.state === "FL" ||
    (payload.ZIPCode !== undefined && payload.ZIPCode !== zip5)
  ) {
    throw new HttpError(503, "US_ZIP_STATE_PROVIDER_INVALID", "U.S. ZIP Code validation is unavailable.");
  }
  if (payload.state !== stateCode) {
    throw new HttpError(409, "PHYSICAL_ZIP_STATE_MISMATCH", "This ZIP Code does not match the selected state.");
  }
  return {
    stateCode,
    countyFips: null,
    combinedRateBps: 0,
    stateRateBps: 0,
    surtaxRateBps: 0,
    datasetVersion: configuration.apiVersion,
    rateTableVersion: null,
    resolutionMethod: US_ZIP_STATE_RESOLUTION_METHOD,
  };
}

function validFloridaRateRow(row, expectedCountyFips) {
  return (
    hasExactKeys(row, ["county_fips", "state_rate_bps", "surtax_rate_bps", "combined_rate_bps"]) &&
    row.county_fips === expectedCountyFips &&
    Number.isSafeInteger(row.state_rate_bps) && row.state_rate_bps === 600 &&
    Number.isSafeInteger(row.surtax_rate_bps) && row.surtax_rate_bps >= 0 && row.surtax_rate_bps <= 200 &&
    Number.isSafeInteger(row.combined_rate_bps) &&
    row.combined_rate_bps === row.state_rate_bps + row.surtax_rate_bps
  );
}

export function canonicalFloridaRateTable(rateVersion, rows) {
  return JSON.stringify({
    rate_version: rateVersion,
    rows: rows.map((row) => ({
      county_fips: row.county_fips,
      state_rate_bps: row.state_rate_bps,
      surtax_rate_bps: row.surtax_rate_bps,
      combined_rate_bps: row.combined_rate_bps,
    })),
  });
}

async function loadVerifiedFloridaRates(env, { rateVersion, rateManifest }) {
  const rootSha256 = requireSha256Binding(
    env,
    "FL_SALES_TAX_RATE_ROOT_SHA256",
    "FL_TAX_RATE_PROVIDER_NOT_CONFIGURED",
    "Florida tax calculation is unavailable.",
  );
  if (rateManifest.content_sha256 !== rootSha256) {
    throw new HttpError(503, "FL_TAX_RATE_DIGEST_MISMATCH", "Florida tax calculation is unavailable.");
  }
  const result = await env.DB
    .prepare(
      `SELECT county_fips, state_rate_bps, surtax_rate_bps, combined_rate_bps
       FROM florida_county_sales_tax_rates
       WHERE rate_version = ? ORDER BY county_fips ASC`,
    )
    .bind(rateVersion)
    .all();
  const rows = result?.results;
  if (
    !Array.isArray(rows) || rows.length !== FLORIDA_COUNTY_FIPS.length ||
    !rows.every((row, index) => validFloridaRateRow(row, FLORIDA_COUNTY_FIPS[index]))
  ) {
    throw new HttpError(503, "FL_TAX_RATE_INVALID", "Florida tax calculation is unavailable.");
  }
  if (await sha256Hex(canonicalFloridaRateTable(rateVersion, rows)) !== rootSha256) {
    throw new HttpError(503, "FL_TAX_RATE_INVALID", "Florida tax calculation is unavailable.");
  }
  return rows;
}

export async function resolveFloridaJurisdiction(env, destination, now) {
  if (destination.administrative_district_level_1 !== "FL") {
    return resolveNonFloridaZipState(env, destination, now);
  }

  const datasetVersion = String(requireBinding(env, "POINTMATCH_DATASET_VERSION"));
  const schemaVersion = String(requireBinding(env, "POINTMATCH_SCHEMA_VERSION"));
  const rateVersion = String(requireBinding(env, "FL_SALES_TAX_RATE_VERSION"));
  const manifest = await env.DB
    .prepare("SELECT * FROM florida_jurisdiction_datasets WHERE dataset_version = ?")
    .bind(datasetVersion)
    .first();
  if (!manifest) {
    throw new HttpError(503, "FL_JURISDICTION_PROVIDER_UNAVAILABLE", "Florida address validation is unavailable.");
  }
  if (manifest.schema_version !== schemaVersion) {
    throw new HttpError(503, "FL_JURISDICTION_SCHEMA_MISMATCH", "Florida address validation is unavailable.");
  }
  if (!validManifest(manifest, { version: datasetVersion, schemaVersion, now })) {
    throw new HttpError(503, "FL_JURISDICTION_DATA_STALE", "Florida address validation requires a current dataset.");
  }

  // Statewide PointMatch data is too large for D1. A private R2 ZIP5 shard
  // contains only HMAC-to-jurisdiction records; D1 binds its exact version/hash.
  const shardRecords = await loadPointMatchShard(
    env,
    { datasetVersion, schemaVersion, destination, manifest },
  );
  const lookup = async (addressHmac) => shardRecords.filter((record) => record?.address_hmac === addressHmac);
  const fullHash = await pointMatchLookupHash(env, destination, true);
  let matches = await lookup(fullHash);
  if (matches.length > 1) {
    throw new HttpError(409, "FL_ADDRESS_AMBIGUOUS", "This Florida address requires manual review.");
  }
  let selectedResolutionMethod = "POINTMATCH_UNIT_EXACT_HMAC_V1";
  if (matches.length === 0) {
    const primaryHash = await pointMatchLookupHash(env, destination, false);
    if (primaryHash === fullHash) {
      throw new HttpError(409, "FL_ADDRESS_NOT_FOUND", "This Florida address could not be matched exactly.");
    }
    matches = await lookup(primaryHash);
    if (matches.length > 1) {
      throw new HttpError(409, "FL_ADDRESS_AMBIGUOUS", "This Florida address requires manual review.");
    }
    if (matches.length === 0) {
      throw new HttpError(409, "FL_ADDRESS_NOT_FOUND", "This Florida address could not be matched exactly.");
    }
    if (matches[0].unit_policy !== "NOT_JURISDICTION_DEPENDENT") {
      throw new HttpError(409, "FL_ADDRESS_UNIT_DEPENDENT", "This unit requires an exact jurisdiction match.");
    }
    selectedResolutionMethod = "POINTMATCH_PRIMARY_HMAC_V1";
  }
  const match = matches[0];
  if (match.match_status !== "EXACT" || match.resolution_method !== POINTMATCH_RESOLUTION_METHOD) {
    throw new HttpError(409, "FL_ADDRESS_NOT_EXACT", "This Florida address requires an exact jurisdiction match.");
  }
  if (match.pending_effective_date !== null && match.pending_effective_date !== "") {
    throw new HttpError(409, "FL_ADDRESS_PENDING", "This Florida address is pending in the state jurisdiction data.");
  }
  if (match.special_case_code !== null && match.special_case_code !== "") {
    throw new HttpError(409, "FL_ADDRESS_SPECIAL_CASE", "This Florida address requires manual tax review.");
  }
  if (!["UNIT_SPECIFIC", "NOT_JURISDICTION_DEPENDENT"].includes(match.unit_policy)) {
    throw new HttpError(503, "FL_JURISDICTION_DATA_INVALID", "Florida address validation is unavailable.");
  }
  if (!normalizedAddressParts(destination).addressLine2 && match.unit_policy === "UNIT_SPECIFIC") {
    throw new HttpError(409, "FL_ADDRESS_UNIT_REQUIRED", "This address requires a unit-specific jurisdiction match.");
  }
  if (typeof match.county_fips !== "string" || !/^12\d{3}$/u.test(match.county_fips)) {
    throw new HttpError(503, "FL_JURISDICTION_DATA_INVALID", "Florida address validation is unavailable.");
  }

  const rateManifest = await env.DB
    .prepare("SELECT * FROM florida_sales_tax_rate_manifests WHERE rate_version = ?")
    .bind(rateVersion)
    .first();
  if (!rateManifest) {
    throw new HttpError(503, "FL_TAX_RATE_PROVIDER_UNAVAILABLE", "Florida tax calculation is unavailable.");
  }
  if (!validRateManifest(rateManifest, { version: rateVersion, now })) {
    throw new HttpError(503, "FL_TAX_RATE_DATA_STALE", "Florida tax calculation requires a current rate table.");
  }
  const rates = await loadVerifiedFloridaRates(env, { rateVersion, rateManifest });
  const rate = rates.find((row) => row.county_fips === match.county_fips);
  if (!rate) {
    throw new HttpError(503, "FL_TAX_RATE_INVALID", "Florida tax calculation is unavailable.");
  }
  return {
    stateCode: "FL",
    countyFips: match.county_fips,
    combinedRateBps: rate.combined_rate_bps,
    stateRateBps: rate.state_rate_bps,
    surtaxRateBps: rate.surtax_rate_bps,
    datasetVersion,
    rateTableVersion: rateVersion,
    resolutionMethod: selectedResolutionMethod,
  };
}

export function shippingCentsForQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 6) {
    throw new HttpError(400, "PHYSICAL_QUANTITY_INVALID", "An order may contain one through six books.");
  }
  if (quantity === 1) return 499;
  if (quantity <= 3) return 599;
  return 749;
}

export function taxCentsForTaxableAmount(taxableCents, rateBps) {
  if (
    !Number.isSafeInteger(taxableCents) || taxableCents < 0 ||
    !Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 10000
  ) {
    throw new TypeError("Invalid tax calculation input.");
  }
  return Math.round((taxableCents * rateBps) / 10000);
}

export function taxCentsForPhysicalLines(items, shippingCents, rateBps) {
  if (!Array.isArray(items) || items.length < 1) throw new TypeError("Physical tax lines are required.");
  let total = taxCentsForTaxableAmount(shippingCents, rateBps);
  for (const item of items) {
    if (!Number.isSafeInteger(item.priceCents) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new TypeError("Invalid physical tax line.");
    }
    total += taxCentsForTaxableAmount(item.priceCents * item.quantity, rateBps);
  }
  return total;
}

export function squarePercentageForBasisPoints(rateBps) {
  if (!Number.isSafeInteger(rateBps) || rateBps <= 0 || rateBps > 10000) {
    throw new TypeError("Invalid Square tax rate.");
  }
  return (rateBps / 100).toFixed(2).replace(/\.00$/u, "").replace(/(\.\d)0$/u, "$1");
}
