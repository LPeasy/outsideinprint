import { createHash, createHmac, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalFloridaRateTable,
  canonicalPointMatchIndex,
  normalizedAddressKey,
  POINTMATCH_RESOLUTION_METHOD,
} from "../../src/florida-tax.js";

export const IMPORT_CONFIG_SCHEMA = "oip-florida-tax-import-config-v1";
export const PRIVATE_BUNDLE_SCHEMA = "oip-florida-tax-private-bundle-v1";

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const ZIP5 = /^\d{5}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHARD_PREFIX = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,127}$/u;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,127}$/u;
const SOURCE_URL = /^https:\/\/[^\s]{1,2039}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const COUNTY_FIPS = Object.freeze(
  Array.from({ length: 67 }, (_, index) => `12${String((index * 2) + 1).padStart(3, "0")}`),
);
const COUNTY_FIPS_SET = new Set(COUNTY_FIPS);
const POINTMATCH_FIELDS = Object.freeze([
  "address_line_1",
  "address_line_2",
  "locality",
  "region",
  "zip5",
  "county_fips",
  "match_status",
  "pending_effective_date",
  "special_case_code",
  "unit_policy",
  "lookup_scope",
]);
const CATEGORICAL_FIELDS = Object.freeze([
  "region",
  "match_status",
  "unit_policy",
  "lookup_scope",
]);
const RATE_FIELDS = Object.freeze([
  "county_fips",
  "state_rate",
  "surtax_rate",
  "combined_rate",
]);
const RECORD_KEYS = Object.freeze([
  "address_hmac",
  "county_fips",
  "match_status",
  "pending_effective_date",
  "special_case_code",
  "resolution_method",
  "unit_policy",
]);
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_SHARD_BYTES = 25 * 1024 * 1024;
const MAX_FIELD_CHARACTERS = 8192;
const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIRECTORY = path.resolve(MODULE_DIRECTORY, "../..");
const REPOSITORY_DIRECTORY = path.resolve(WORKER_DIRECTORY, "../..");
const IGNORED_PRIVATE_DIRECTORY = path.join(WORKER_DIRECTORY, ".private-imports");

export class FloridaTaxImportError extends Error {
  constructor(code, { record = null, field = null, source = null } = {}) {
    const parts = [code];
    if (source !== null) parts.push(`source=${source}`);
    if (record !== null) parts.push(`record=${record}`);
    if (field !== null) parts.push(`field=${field}`);
    super(parts.join(" "));
    this.name = "FloridaTaxImportError";
    this.code = code;
    this.record = record;
    this.field = field;
    this.source = source;
  }
}

function fail(code, details) {
  throw new FloridaTaxImportError(code, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, expected, code, details = {}) {
  if (!isPlainObject(value)) fail(code, details);
  const actual = Object.keys(value);
  if (actual.length !== expected.length || expected.some((key) => !actual.includes(key))) {
    fail(code, details);
  }
}

function requireString(value, pattern, code, field) {
  if (typeof value !== "string" || !pattern.test(value)) fail(code, { field });
  return value;
}

function requireSafeInteger(value, minimum, maximum, code, field) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code, { field });
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(value);
}

function pathIsWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function requireLexicallyPrivateFilesystemPath(candidate, code) {
  const resolved = path.resolve(candidate);
  if (pathIsWithin(resolved, REPOSITORY_DIRECTORY) && !pathIsWithin(resolved, IGNORED_PRIVATE_DIRECTORY)) {
    fail(code);
  }
  return resolved;
}

function sameFilesystemSpelling(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

let canonicalPrivateRootsPromise;

async function canonicalPrivateRoots() {
  if (!canonicalPrivateRootsPromise) {
    canonicalPrivateRootsPromise = Promise.all([
      realpath(REPOSITORY_DIRECTORY),
      realpath(WORKER_DIRECTORY),
    ]).then(([repository, worker]) => ({
      repository: path.resolve(repository),
      ignoredPrivate: path.join(path.resolve(worker), ".private-imports"),
    }));
  }
  try {
    return await canonicalPrivateRootsPromise;
  } catch {
    canonicalPrivateRootsPromise = undefined;
    fail("PRIVATE_PATH_ROOT_UNAVAILABLE");
  }
}

async function verifyNoWindowsReparsePoints(existingPaths, code) {
  if (process.platform !== "win32" || existingPaths.length === 0) return;
  const windowsRoot = process.env.SystemRoot || "C:\\Windows";
  const powershell = path.join(
    windowsRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const script = [
    "$ErrorActionPreference='Stop'",
    "$paths=ConvertFrom-Json -InputObject $env:OIP_FL_IMPORT_PATH_AUDIT",
    "foreach($candidate in $paths){",
    "  $item=Get-Item -LiteralPath $candidate -Force",
    "  if(($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0){exit 42}",
    "}",
    "exit 0",
  ].join(";");
  const childEnvironment = { ...process.env, OIP_FL_IMPORT_PATH_AUDIT: JSON.stringify(existingPaths) };
  delete childEnvironment.ADDRESS_LOOKUP_HMAC_SECRET;
  await new Promise((resolve, reject) => {
    const child = spawn(
      powershell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        stdio: "ignore",
        env: childEnvironment,
      },
    );
    child.once("error", () => reject(new FloridaTaxImportError(code)));
    child.once("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new FloridaTaxImportError(code));
    });
  });
}

async function verifyPrivateFilesystemPath(candidate, {
  code,
  expected = "ANY",
}) {
  const resolved = requireLexicallyPrivateFilesystemPath(candidate, code);
  const parsed = path.parse(resolved);
  const relative = path.relative(parsed.root, resolved);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = parsed.root;
  let lastExisting = parsed.root;
  let missingAt = -1;
  let finalInfo = null;
  const existingPaths = [];

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error?.code !== "ENOENT") fail(code);
      missingAt = index;
      break;
    }
    if (info.isSymbolicLink()) fail(code);
    if (index < segments.length - 1 && !info.isDirectory()) fail(code);
    lastExisting = current;
    finalInfo = info;
    existingPaths.push(current);
  }

  const exists = missingAt === -1;
  if (expected !== "MISSING" && !exists) fail(code);
  if (expected === "MISSING" && exists) fail(code);
  if (exists && expected === "FILE" && !finalInfo?.isFile()) fail(code);
  if (exists && expected === "DIRECTORY" && !finalInfo?.isDirectory()) fail(code);
  await verifyNoWindowsReparsePoints(existingPaths, code);

  let canonicalExisting;
  try {
    canonicalExisting = path.resolve(await realpath(lastExisting));
  } catch {
    fail(code);
  }
  if (!sameFilesystemSpelling(canonicalExisting, lastExisting)) fail(code);
  const missingSegments = missingAt === -1 ? [] : segments.slice(missingAt);
  const canonicalCandidate = path.resolve(canonicalExisting, ...missingSegments);
  const roots = await canonicalPrivateRoots();
  if (
    pathIsWithin(canonicalCandidate, roots.repository) &&
    !pathIsWithin(canonicalCandidate, roots.ignoredPrivate)
  ) {
    fail(code);
  }
  if (exists) {
    let canonicalFinal;
    try {
      canonicalFinal = path.resolve(await realpath(resolved));
    } catch {
      fail(code);
    }
    if (!sameFilesystemSpelling(canonicalFinal, resolved)) fail(code);
  }
  return resolved;
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactUtcDate(value, endOfDay, code, field) {
  requireString(value, DATE, code, field);
  const suffix = endOfDay ? "T23:59:59Z" : "T00:00:00Z";
  const milliseconds = Date.parse(`${value}${suffix}`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    fail(code, { field });
  }
  return Math.floor(milliseconds / 1000);
}

function exactUtcTimestamp(value, code, field) {
  requireString(value, RFC3339_UTC, code, field);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().replace(".000Z", "Z") !== value) {
    fail(code, { field });
  }
  return Math.floor(milliseconds / 1000);
}

function validateWindow(value, codePrefix) {
  const effectiveFrom = exactUtcDate(
    value.effective_from,
    false,
    `${codePrefix}_DATE_INVALID`,
    "effective_from",
  );
  const effectiveThrough = exactUtcDate(
    value.effective_through,
    true,
    `${codePrefix}_DATE_INVALID`,
    "effective_through",
  );
  const staleAfter = exactUtcDate(
    value.stale_after,
    true,
    `${codePrefix}_DATE_INVALID`,
    "stale_after",
  );
  const importedAt = exactUtcTimestamp(
    value.imported_at,
    `${codePrefix}_DATE_INVALID`,
    "imported_at",
  );
  if (
    effectiveFrom > staleAfter || staleAfter > effectiveThrough ||
    importedAt > staleAfter
  ) {
    fail(`${codePrefix}_DATE_ORDER_INVALID`);
  }
  return { effectiveFrom, effectiveThrough, staleAfter, importedAt };
}

function validateSource(source, codePrefix) {
  requireExactKeys(
    source,
    [
      "authority", "url", "release_date", "release_date_status", "retrieved_at",
      "release_evidence_id", "terms_evidence_id", "preparation_evidence_id",
    ],
    `${codePrefix}_SOURCE_INVALID`,
  );
  requireString(source.authority, SAFE_LABEL, `${codePrefix}_SOURCE_INVALID`, "authority");
  requireString(source.url, SOURCE_URL, `${codePrefix}_SOURCE_INVALID`, "url");
  let parsedUrl;
  try {
    parsedUrl = new URL(source.url);
  } catch {
    fail(`${codePrefix}_SOURCE_INVALID`, { field: "url" });
  }
  if (
    parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password ||
    parsedUrl.hash || !parsedUrl.hostname || parsedUrl.port
  ) {
    fail(`${codePrefix}_SOURCE_INVALID`, { field: "url" });
  }
  const retrievedAt = exactUtcTimestamp(
    source.retrieved_at,
    `${codePrefix}_SOURCE_INVALID`,
    "retrieved_at",
  );
  let releaseDate = null;
  if (source.release_date_status === "STATED_BY_SOURCE") {
    releaseDate = exactUtcDate(
      source.release_date,
      false,
      `${codePrefix}_SOURCE_INVALID`,
      "release_date",
    );
    if (releaseDate > retrievedAt) fail(`${codePrefix}_SOURCE_DATE_ORDER_INVALID`);
  } else if (source.release_date_status !== "NOT_STATED_BY_SOURCE") {
    fail(`${codePrefix}_SOURCE_INVALID`, { field: "release_date_status" });
  } else if (source.release_date !== null) {
    fail(`${codePrefix}_SOURCE_INVALID`, { field: "release_date" });
  }
  requireString(
    source.release_evidence_id,
    VERSION,
    `${codePrefix}_SOURCE_INVALID`,
    "release_evidence_id",
  );
  requireString(
    source.terms_evidence_id,
    VERSION,
    `${codePrefix}_SOURCE_INVALID`,
    "terms_evidence_id",
  );
  requireString(
    source.preparation_evidence_id,
    VERSION,
    `${codePrefix}_SOURCE_INVALID`,
    "preparation_evidence_id",
  );
  return { releaseDate, retrievedAt };
}

function validateHeader(header, codePrefix) {
  if (
    !Array.isArray(header) || header.length < 1 || header.length > 256 ||
    header.some((entry) => typeof entry !== "string" || entry.length < 1 || entry.length > 256) ||
    new Set(header).size !== header.length
  ) {
    fail(`${codePrefix}_HEADER_CONFIG_INVALID`);
  }
}

function validateInput(input, codePrefix) {
  requireExactKeys(
    input,
    ["label", "path", "expected_sha256", "expected_bytes", "expected_rows"],
    `${codePrefix}_INPUT_CONFIG_INVALID`,
  );
  requireString(input.label, SAFE_LABEL, `${codePrefix}_INPUT_CONFIG_INVALID`, "label");
  if (typeof input.path !== "string" || input.path.length < 1 || input.path.length > 4096) {
    fail(`${codePrefix}_INPUT_CONFIG_INVALID`, { field: "path" });
  }
  requireString(
    input.expected_sha256,
    SHA256_HEX,
    `${codePrefix}_INPUT_CONFIG_INVALID`,
    "expected_sha256",
  );
  requireSafeInteger(
    input.expected_bytes,
    1,
    MAX_SOURCE_BYTES,
    `${codePrefix}_INPUT_CONFIG_INVALID`,
    "expected_bytes",
  );
  requireSafeInteger(
    input.expected_rows,
    1,
    Number.MAX_SAFE_INTEGER,
    `${codePrefix}_INPUT_CONFIG_INVALID`,
    "expected_rows",
  );
}

function validateBinding(binding, header, codePrefix, field) {
  if (!isPlainObject(binding)) fail(`${codePrefix}_FIELD_BINDING_INVALID`, { field });
  const keys = Object.keys(binding);
  if (keys.length !== 1 || !["column", "constant"].includes(keys[0])) {
    fail(`${codePrefix}_FIELD_BINDING_INVALID`, { field });
  }
  const value = binding[keys[0]];
  if (typeof value !== "string" || value.length > MAX_FIELD_CHARACTERS) {
    fail(`${codePrefix}_FIELD_BINDING_INVALID`, { field });
  }
  if (keys[0] === "column" && !header.includes(value)) {
    fail(`${codePrefix}_FIELD_BINDING_INVALID`, { field });
  }
}

function validateFields(fields, names, header, codePrefix) {
  requireExactKeys(fields, names, `${codePrefix}_FIELDS_INVALID`);
  for (const field of names) validateBinding(fields[field], header, codePrefix, field);
}

function validateValueMaps(valueMaps) {
  requireExactKeys(valueMaps, CATEGORICAL_FIELDS, "POINTMATCH_VALUE_MAPS_INVALID");
  for (const field of CATEGORICAL_FIELDS) {
    const valueMap = valueMaps[field];
    if (!isPlainObject(valueMap) || Object.keys(valueMap).length > 256) {
      fail("POINTMATCH_VALUE_MAPS_INVALID", { field });
    }
    for (const [source, canonical] of Object.entries(valueMap)) {
      if (
        source.length < 1 || source.length > 256 ||
        typeof canonical !== "string" || canonical.length < 1 || canonical.length > 256
      ) {
        fail("POINTMATCH_VALUE_MAPS_INVALID", { field });
      }
    }
  }
}

function validateDatasetConfig(dataset) {
  requireExactKeys(
    dataset,
    [
      "version", "schema_version", "shard_prefix", "effective_from", "effective_through",
      "stale_after", "imported_at", "source", "header", "inputs", "fields",
      "value_maps", "limits",
    ],
    "POINTMATCH_CONFIG_INVALID",
  );
  requireString(dataset.version, VERSION, "POINTMATCH_CONFIG_INVALID", "version");
  requireString(dataset.schema_version, VERSION, "POINTMATCH_CONFIG_INVALID", "schema_version");
  requireString(dataset.shard_prefix, SHARD_PREFIX, "POINTMATCH_CONFIG_INVALID", "shard_prefix");
  if (dataset.shard_prefix.endsWith("/") || dataset.shard_prefix.includes("//")) {
    fail("POINTMATCH_CONFIG_INVALID", { field: "shard_prefix" });
  }
  const window = validateWindow(dataset, "POINTMATCH");
  const sourceWindow = validateSource(dataset.source, "POINTMATCH");
  if (sourceWindow.retrievedAt > window.importedAt) fail("POINTMATCH_SOURCE_DATE_ORDER_INVALID");
  validateHeader(dataset.header, "POINTMATCH");
  if (!Array.isArray(dataset.inputs) || dataset.inputs.length < 1 || dataset.inputs.length > 1000) {
    fail("POINTMATCH_INPUT_CONFIG_INVALID");
  }
  const labels = new Set();
  for (const input of dataset.inputs) {
    validateInput(input, "POINTMATCH");
    if (labels.has(input.label)) fail("POINTMATCH_INPUT_LABEL_DUPLICATE");
    labels.add(input.label);
  }
  validateFields(dataset.fields, POINTMATCH_FIELDS, dataset.header, "POINTMATCH");
  validateValueMaps(dataset.value_maps);
  requireExactKeys(
    dataset.limits,
    ["max_input_bytes", "max_records_per_shard", "max_shard_bytes"],
    "POINTMATCH_LIMITS_INVALID",
  );
  requireSafeInteger(
    dataset.limits.max_input_bytes,
    1,
    MAX_SOURCE_BYTES,
    "POINTMATCH_LIMITS_INVALID",
    "max_input_bytes",
  );
  requireSafeInteger(
    dataset.limits.max_records_per_shard,
    1,
    10_000_000,
    "POINTMATCH_LIMITS_INVALID",
    "max_records_per_shard",
  );
  requireSafeInteger(
    dataset.limits.max_shard_bytes,
    256,
    MAX_SHARD_BYTES,
    "POINTMATCH_LIMITS_INVALID",
    "max_shard_bytes",
  );
  if (dataset.inputs.some((input) => input.expected_bytes > dataset.limits.max_input_bytes)) {
    fail("POINTMATCH_INPUT_LIMIT_EXCEEDED");
  }
  return window;
}

function validateRateConfig(rates) {
  requireExactKeys(
    rates,
    [
      "version", "effective_from", "effective_through", "stale_after", "imported_at",
      "source", "header", "input", "fields", "units", "max_input_bytes",
    ],
    "RATE_CONFIG_INVALID",
  );
  requireString(rates.version, VERSION, "RATE_CONFIG_INVALID", "version");
  const window = validateWindow(rates, "RATE");
  const sourceWindow = validateSource(rates.source, "RATE");
  if (sourceWindow.retrievedAt > window.importedAt) fail("RATE_SOURCE_DATE_ORDER_INVALID");
  validateHeader(rates.header, "RATE");
  validateInput(rates.input, "RATE");
  if (rates.input.expected_rows !== 67) fail("RATE_ROW_COUNT_CONFIG_INVALID");
  validateFields(rates.fields, RATE_FIELDS, rates.header, "RATE");
  requireExactKeys(rates.units, ["state_rate", "surtax_rate", "combined_rate"], "RATE_UNITS_INVALID");
  for (const field of ["state_rate", "surtax_rate", "combined_rate"]) {
    if (!["BASIS_POINTS", "PERCENT_DECIMAL"].includes(rates.units[field])) {
      fail("RATE_UNITS_INVALID", { field });
    }
  }
  requireSafeInteger(
    rates.max_input_bytes,
    1,
    MAX_SOURCE_BYTES,
    "RATE_INPUT_LIMIT_INVALID",
    "max_input_bytes",
  );
  if (rates.input.expected_bytes > rates.max_input_bytes) fail("RATE_INPUT_LIMIT_EXCEEDED");
  return window;
}

export function validateImportConfig(config) {
  requireExactKeys(config, ["schema_version", "dataset", "rates"], "CONFIG_INVALID");
  if (config.schema_version !== IMPORT_CONFIG_SCHEMA) fail("CONFIG_SCHEMA_UNSUPPORTED");
  const datasetWindow = validateDatasetConfig(config.dataset);
  const rateWindow = validateRateConfig(config.rates);
  return { datasetWindow, rateWindow };
}

async function safeReadConfig(configPath) {
  let raw;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    fail("CONFIG_UNREADABLE");
  }
  if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) fail("CONFIG_TOO_LARGE");
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    fail("CONFIG_JSON_INVALID");
  }
  validateImportConfig(config);
  return config;
}

function secretBytes(secret) {
  if (typeof secret !== "string" || secret.includes("\0") || /[\r\n]/u.test(secret)) {
    fail("HMAC_SECRET_INVALID");
  }
  const bytes = Buffer.from(secret, "utf8");
  if (bytes.length < 32 || bytes.length > 1024) fail("HMAC_SECRET_INVALID");
  return bytes;
}

function compareArrays(actual, expected) {
  return actual.length === expected.length && actual.every((entry, index) => entry === expected[index]);
}

async function* parseCsv(filePath, { expectedHeader, sourceLabel, integrity }) {
  const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const streamHash = createHash("sha256");
  let streamBytes = 0;
  let field = "";
  let fields = [];
  let state = "UNQUOTED";
  let recordNumber = 0;
  let skipLf = false;
  let firstCharacter = true;

  const append = (character) => {
    field += character;
    if (field.length > MAX_FIELD_CHARACTERS) {
      fail("CSV_FIELD_TOO_LARGE", { source: sourceLabel, record: recordNumber + 1 });
    }
  };
  const finishField = () => {
    fields.push(field);
    field = "";
    state = "UNQUOTED";
    if (fields.length > 256) {
      fail("CSV_COLUMN_COUNT_INVALID", { source: sourceLabel, record: recordNumber + 1 });
    }
  };
  const finishRecord = () => {
    finishField();
    recordNumber += 1;
    const completed = fields;
    fields = [];
    return completed;
  };

  const decodedChunks = async function* () {
    for await (const bytes of stream) {
      streamBytes += bytes.length;
      if (!Number.isSafeInteger(streamBytes) || streamBytes > MAX_SOURCE_BYTES) {
        fail("SOURCE_TOO_LARGE", { source: sourceLabel });
      }
      streamHash.update(bytes);
      try {
        yield decoder.decode(bytes, { stream: true });
      } catch {
        fail("CSV_UTF8_INVALID", { source: sourceLabel });
      }
    }
    try {
      const final = decoder.decode();
      if (final) yield final;
    } catch {
      fail("CSV_UTF8_INVALID", { source: sourceLabel });
    }
  };

  for await (const chunk of decodedChunks()) {
    for (const originalCharacter of chunk) {
      let character = originalCharacter;
      if (firstCharacter) {
        firstCharacter = false;
        if (character === "\uFEFF") continue;
      }
      if (character === "\0") {
        fail("CSV_NUL_FORBIDDEN", { source: sourceLabel, record: recordNumber + 1 });
      }
      if (skipLf) {
        skipLf = false;
        if (character === "\n") continue;
      }
      if (state === "QUOTED") {
        if (character === '"') state = "AFTER_QUOTE";
        else append(character);
        continue;
      }
      if (state === "AFTER_QUOTE") {
        if (character === '"') {
          append('"');
          state = "QUOTED";
          continue;
        }
        if (character !== "," && character !== "\r" && character !== "\n") {
          fail("CSV_QUOTE_INVALID", { source: sourceLabel, record: recordNumber + 1 });
        }
      }
      if (character === ",") {
        finishField();
      } else if (character === "\r" || character === "\n") {
        if (character === "\r") skipLf = true;
        const completed = finishRecord();
        if (completed.length === 1 && completed[0] === "") {
          fail("CSV_BLANK_RECORD", { source: sourceLabel, record: recordNumber });
        }
        if (recordNumber === 1) {
          if (!compareArrays(completed, expectedHeader)) {
            fail("CSV_HEADER_MISMATCH", { source: sourceLabel, record: 1 });
          }
        } else {
          if (completed.length !== expectedHeader.length) {
            fail("CSV_COLUMN_COUNT_INVALID", { source: sourceLabel, record: recordNumber });
          }
          yield { recordNumber, fields: completed };
        }
      } else if (character === '"') {
        if (state !== "UNQUOTED" || field.length !== 0) {
          fail("CSV_QUOTE_INVALID", { source: sourceLabel, record: recordNumber + 1 });
        }
        state = "QUOTED";
      } else {
        if (state === "AFTER_QUOTE") {
          fail("CSV_QUOTE_INVALID", { source: sourceLabel, record: recordNumber + 1 });
        }
        append(character);
      }
    }
  }
  if (state === "QUOTED") fail("CSV_QUOTE_UNTERMINATED", { source: sourceLabel, record: recordNumber + 1 });
  if (field.length > 0 || fields.length > 0 || state === "AFTER_QUOTE") {
    const completed = finishRecord();
    if (recordNumber === 1) {
      if (!compareArrays(completed, expectedHeader)) {
        fail("CSV_HEADER_MISMATCH", { source: sourceLabel, record: 1 });
      }
    } else {
      if (completed.length !== expectedHeader.length) {
        fail("CSV_COLUMN_COUNT_INVALID", { source: sourceLabel, record: recordNumber });
      }
      yield { recordNumber, fields: completed };
    }
  }
  if (recordNumber === 0) fail("CSV_EMPTY", { source: sourceLabel });
  integrity.sha256 = streamHash.digest("hex");
  integrity.bytes = streamBytes;
}

export async function digestFile(filePath) {
  const resolvedFilePath = await verifyPrivateFilesystemPath(filePath, {
    code: "SOURCE_PATH_NOT_PRIVATE",
    expected: "FILE",
  });
  const hash = createHash("sha256");
  let bytes = 0;
  let info;
  try {
    info = await lstat(resolvedFilePath);
  } catch {
    fail("SOURCE_UNREADABLE");
  }
  if (!info.isFile() || info.isSymbolicLink()) fail("SOURCE_NOT_REGULAR_FILE");
  for await (const chunk of createReadStream(resolvedFilePath)) {
    bytes += chunk.length;
    if (bytes > MAX_SOURCE_BYTES) fail("SOURCE_TOO_LARGE");
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), bytes, mtimeMs: info.mtimeMs };
}

async function verifyInputFile(filePath, input, maxInputBytes, codePrefix) {
  const initial = await digestFile(filePath);
  if (
    initial.bytes !== input.expected_bytes || initial.bytes > maxInputBytes ||
    initial.sha256 !== input.expected_sha256
  ) {
    fail(`${codePrefix}_SOURCE_BINDING_MISMATCH`, { source: input.label });
  }
  return initial;
}

async function verifyFileUnchanged(filePath, initial, parsedIntegrity, input, codePrefix) {
  let final;
  try {
    final = await stat(filePath);
  } catch {
    fail(`${codePrefix}_SOURCE_CHANGED`, { source: input.label });
  }
  if (
    final.size !== initial.bytes || final.mtimeMs !== initial.mtimeMs ||
    parsedIntegrity.bytes !== initial.bytes || parsedIntegrity.sha256 !== initial.sha256
  ) {
    fail(`${codePrefix}_SOURCE_CHANGED`, { source: input.label });
  }
}

function rowObject(header, fields) {
  return Object.fromEntries(header.map((name, index) => [name, fields[index]]));
}

function boundValue(row, binding) {
  return Object.hasOwn(binding, "constant") ? binding.constant : row[binding.column];
}

function mappedCategorical(raw, field, binding, valueMaps, details) {
  if (Object.hasOwn(binding, "constant")) return raw;
  if (!Object.hasOwn(valueMaps[field], raw)) fail("POINTMATCH_VALUE_UNMAPPED", { ...details, field });
  return valueMaps[field][raw];
}

function requireText(value, minimum, maximum, code, details) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) fail(code, details);
  return value;
}

function canonicalPointMatchRecord(row, config, secret, details) {
  const raw = Object.fromEntries(
    POINTMATCH_FIELDS.map((field) => [field, boundValue(row, config.fields[field])]),
  );
  for (const field of CATEGORICAL_FIELDS) {
    raw[field] = mappedCategorical(
      raw[field],
      field,
      config.fields[field],
      config.value_maps,
      details,
    );
  }
  requireText(raw.address_line_1, 1, 256, "POINTMATCH_ROW_INVALID", { ...details, field: "address_line_1" });
  requireText(raw.address_line_2, 0, 256, "POINTMATCH_ROW_INVALID", { ...details, field: "address_line_2" });
  requireText(raw.locality, 1, 128, "POINTMATCH_ROW_INVALID", { ...details, field: "locality" });
  if (raw.region !== "FL") fail("POINTMATCH_ROW_INVALID", { ...details, field: "region" });
  if (!ZIP5.test(raw.zip5)) fail("POINTMATCH_ROW_INVALID", { ...details, field: "zip5" });
  if (!COUNTY_FIPS_SET.has(raw.county_fips)) {
    fail("POINTMATCH_ROW_INVALID", { ...details, field: "county_fips" });
  }
  if (!["EXACT", "NONEXACT"].includes(raw.match_status)) {
    fail("POINTMATCH_ROW_INVALID", { ...details, field: "match_status" });
  }
  let pendingEffectiveDate = null;
  if (raw.pending_effective_date !== "") {
    exactUtcDate(
      raw.pending_effective_date,
      false,
      "POINTMATCH_ROW_INVALID",
      "pending_effective_date",
    );
    pendingEffectiveDate = raw.pending_effective_date;
  }
  let specialCaseCode = null;
  if (raw.special_case_code !== "") {
    if (!/^[A-Z0-9_-]{1,64}$/u.test(raw.special_case_code)) {
      fail("POINTMATCH_ROW_INVALID", { ...details, field: "special_case_code" });
    }
    specialCaseCode = raw.special_case_code;
  }
  if (!["UNIT_SPECIFIC", "NOT_JURISDICTION_DEPENDENT"].includes(raw.unit_policy)) {
    fail("POINTMATCH_ROW_INVALID", { ...details, field: "unit_policy" });
  }
  if (!["PRIMARY", "UNIT"].includes(raw.lookup_scope)) {
    fail("POINTMATCH_ROW_INVALID", { ...details, field: "lookup_scope" });
  }
  if (
    (raw.lookup_scope === "PRIMARY" && (raw.address_line_2 !== "" || raw.unit_policy !== "NOT_JURISDICTION_DEPENDENT")) ||
    (raw.lookup_scope === "UNIT" && (raw.address_line_2 === "" || raw.unit_policy !== "UNIT_SPECIFIC"))
  ) {
    fail("POINTMATCH_UNIT_SEMANTICS_INVALID", { ...details, field: "lookup_scope" });
  }
  const destination = {
    address_line_1: raw.address_line_1,
    address_line_2: raw.address_line_2,
    locality: raw.locality,
    administrative_district_level_1: raw.region,
    postal_code: raw.zip5,
  };
  const normalizedKey = normalizedAddressKey(destination, { includeUnit: raw.lookup_scope === "UNIT" });
  const normalized = normalizedKey.split("|");
  if (!normalized[0] || !normalized[2] || normalized[3] !== "FL" || normalized[4] !== raw.zip5) {
    fail("POINTMATCH_NORMALIZATION_INVALID", { ...details });
  }
  const addressHmac = createHmac("sha256", secret)
    .update(`oip-pointmatch:v1:${normalizedKey}`, "utf8")
    .digest("hex");
  return {
    zip5: raw.zip5,
    record: {
      address_hmac: addressHmac,
      county_fips: raw.county_fips,
      match_status: raw.match_status,
      pending_effective_date: pendingEffectiveDate,
      special_case_code: specialCaseCode,
      resolution_method: POINTMATCH_RESOLUTION_METHOD,
      unit_policy: raw.unit_policy,
    },
  };
}

function canonicalPointMatchShard(payload) {
  return canonicalJson({
    dataset_version: payload.dataset_version,
    schema_version: payload.schema_version,
    zip5: payload.zip5,
    records: payload.records.map((record) => ({
      address_hmac: record.address_hmac,
      county_fips: record.county_fips,
      match_status: record.match_status,
      pending_effective_date: record.pending_effective_date,
      special_case_code: record.special_case_code,
      resolution_method: record.resolution_method,
      unit_policy: record.unit_policy,
    })),
  });
}

function validPointMatchRecord(record) {
  if (!isPlainObject(record) || !compareArrays(Object.keys(record), RECORD_KEYS)) return false;
  return (
    SHA256_HEX.test(record.address_hmac) && COUNTY_FIPS_SET.has(record.county_fips) &&
    ["EXACT", "NONEXACT"].includes(record.match_status) &&
    (record.pending_effective_date === null || DATE.test(record.pending_effective_date)) &&
    (record.special_case_code === null || /^[A-Z0-9_-]{1,64}$/u.test(record.special_case_code)) &&
    record.resolution_method === POINTMATCH_RESOLUTION_METHOD &&
    ["UNIT_SPECIFIC", "NOT_JURISDICTION_DEPENDENT"].includes(record.unit_policy)
  );
}

async function writeUtf8(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, { encoding: "utf8", flag: "wx" });
}

async function importPointMatch({ config, configDir, outputDir, secret }) {
  const sourceFiles = [];
  const shards = [];
  let totalRows = 0;
  let currentZip5 = null;
  let currentRecords = [];
  let currentEstimatedBytes = 0;
  let previousZip5 = "";

  const flush = async () => {
    if (currentZip5 === null) return;
    currentRecords.sort((left, right) => (
      left.address_hmac < right.address_hmac ? -1 : left.address_hmac > right.address_hmac ? 1 : 0
    ));
    for (let index = 1; index < currentRecords.length; index += 1) {
      if (currentRecords[index - 1].address_hmac === currentRecords[index].address_hmac) {
        fail("POINTMATCH_ADDRESS_DUPLICATE", { source: "private-input" });
      }
    }
    const payload = {
      dataset_version: config.version,
      schema_version: config.schema_version,
      zip5: currentZip5,
      records: currentRecords,
    };
    const raw = canonicalPointMatchShard(payload);
    const bytes = Buffer.byteLength(raw, "utf8");
    if (bytes > config.limits.max_shard_bytes || bytes > MAX_SHARD_BYTES) {
      fail("POINTMATCH_SHARD_LIMIT_EXCEEDED");
    }
    const objectKey = `${config.shard_prefix}/${config.version}/zip5/${currentZip5}.json`;
    await writeUtf8(path.join(outputDir, ...objectKey.split("/")), raw);
    shards.push({
      zip5: currentZip5,
      object_key: objectKey,
      row_count: currentRecords.length,
      content_sha256: sha256Text(raw),
    });
    currentRecords = [];
    currentEstimatedBytes = 0;
  };

  for (const input of config.inputs) {
    const inputPath = await verifyPrivateFilesystemPath(
      path.resolve(configDir, input.path),
      { code: "POINTMATCH_SOURCE_PATH_NOT_PRIVATE", expected: "FILE" },
    );
    const initial = await verifyInputFile(inputPath, input, config.limits.max_input_bytes, "POINTMATCH");
    const parsedIntegrity = {};
    let inputRows = 0;
    for await (const parsed of parseCsv(inputPath, {
      expectedHeader: config.header,
      sourceLabel: input.label,
      integrity: parsedIntegrity,
    })) {
      inputRows += 1;
      const converted = canonicalPointMatchRecord(
        rowObject(config.header, parsed.fields),
        config,
        secret,
        { source: input.label, record: parsed.recordNumber },
      );
      if (converted.zip5 < previousZip5) {
        fail("POINTMATCH_INPUT_NOT_ZIP_SORTED", { source: input.label, record: parsed.recordNumber, field: "zip5" });
      }
      if (currentZip5 !== null && converted.zip5 !== currentZip5) await flush();
      if (converted.zip5 !== currentZip5) {
        if (converted.zip5 <= previousZip5) {
          fail("POINTMATCH_ZIP_SPLIT_OR_REPEATED", { source: input.label, record: parsed.recordNumber, field: "zip5" });
        }
        currentZip5 = converted.zip5;
      }
      previousZip5 = converted.zip5;
      currentRecords.push(converted.record);
      currentEstimatedBytes += Buffer.byteLength(canonicalJson(converted.record), "utf8") + 1;
      if (currentRecords.length > config.limits.max_records_per_shard) {
        fail("POINTMATCH_SHARD_RECORD_LIMIT_EXCEEDED", { source: input.label, record: parsed.recordNumber });
      }
      if (currentEstimatedBytes + 512 > config.limits.max_shard_bytes) {
        fail("POINTMATCH_SHARD_LIMIT_EXCEEDED", { source: input.label, record: parsed.recordNumber });
      }
      totalRows += 1;
      if (!Number.isSafeInteger(totalRows)) fail("POINTMATCH_ROW_COUNT_OVERFLOW");
    }
    if (inputRows !== input.expected_rows) {
      fail("POINTMATCH_SOURCE_ROW_COUNT_MISMATCH", { source: input.label });
    }
    await verifyFileUnchanged(inputPath, initial, parsedIntegrity, input, "POINTMATCH");
    sourceFiles.push({
      label: input.label,
      content_sha256: initial.sha256,
      bytes: initial.bytes,
      rows: inputRows,
    });
  }
  await flush();
  if (totalRows < 1 || shards.length < 1) fail("POINTMATCH_DATASET_EMPTY");
  const indexPayload = {
    dataset_version: config.version,
    schema_version: config.schema_version,
    row_count: totalRows,
    shard_count: shards.length,
    shards,
  };
  const indexRaw = canonicalPointMatchIndex(indexPayload);
  if (Buffer.byteLength(indexRaw, "utf8") > MAX_SHARD_BYTES) fail("POINTMATCH_INDEX_LIMIT_EXCEEDED");
  const indexObjectKey = `${config.shard_prefix}/${config.version}/index.json`;
  await writeUtf8(path.join(outputDir, ...indexObjectKey.split("/")), indexRaw);
  return {
    indexPayload,
    indexRaw,
    indexObjectKey,
    indexSha256: sha256Text(indexRaw),
    sourceFiles,
  };
}

function decimalPercentToBasisPoints(value, details) {
  if (typeof value !== "string" || !/^\d{1,3}(?:\.\d{1,4})?$/u.test(value)) {
    fail("RATE_VALUE_INVALID", details);
  }
  const [whole, fraction = ""] = value.split(".");
  const tenThousandths = (Number(whole) * 10_000) + Number(fraction.padEnd(4, "0"));
  if (tenThousandths % 100 !== 0) fail("RATE_VALUE_NOT_WHOLE_BASIS_POINT", details);
  return tenThousandths / 100;
}

function basisPoints(value, unit, details) {
  if (unit === "PERCENT_DECIMAL") return decimalPercentToBasisPoints(value, details);
  if (typeof value !== "string" || !/^\d{1,5}$/u.test(value)) fail("RATE_VALUE_INVALID", details);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail("RATE_VALUE_INVALID", details);
  return parsed;
}

async function importRates({ config, configDir }) {
  const input = config.input;
  const inputPath = await verifyPrivateFilesystemPath(
    path.resolve(configDir, input.path),
    { code: "RATE_SOURCE_PATH_NOT_PRIVATE", expected: "FILE" },
  );
  const initial = await verifyInputFile(inputPath, input, config.max_input_bytes, "RATE");
  const parsedIntegrity = {};
  const rows = [];
  let previousFips = "";
  for await (const parsed of parseCsv(inputPath, {
    expectedHeader: config.header,
    sourceLabel: input.label,
    integrity: parsedIntegrity,
  })) {
    const sourceRow = rowObject(config.header, parsed.fields);
    const raw = Object.fromEntries(
      RATE_FIELDS.map((field) => [field, boundValue(sourceRow, config.fields[field])]),
    );
    const details = { source: input.label, record: parsed.recordNumber };
    if (!COUNTY_FIPS_SET.has(raw.county_fips)) {
      fail("RATE_COUNTY_FIPS_INVALID", { ...details, field: "county_fips" });
    }
    if (raw.county_fips <= previousFips) {
      fail("RATE_INPUT_NOT_FIPS_SORTED", { ...details, field: "county_fips" });
    }
    previousFips = raw.county_fips;
    const stateRateBps = basisPoints(raw.state_rate, config.units.state_rate, { ...details, field: "state_rate" });
    const surtaxRateBps = basisPoints(raw.surtax_rate, config.units.surtax_rate, { ...details, field: "surtax_rate" });
    const combinedRateBps = basisPoints(raw.combined_rate, config.units.combined_rate, { ...details, field: "combined_rate" });
    if (
      stateRateBps !== 600 || surtaxRateBps < 0 || surtaxRateBps > 200 ||
      combinedRateBps !== stateRateBps + surtaxRateBps
    ) {
      fail("RATE_ARITHMETIC_INVALID", details);
    }
    rows.push({
      county_fips: raw.county_fips,
      state_rate_bps: stateRateBps,
      surtax_rate_bps: surtaxRateBps,
      combined_rate_bps: combinedRateBps,
    });
  }
  if (rows.length !== 67 || !rows.every((row, index) => row.county_fips === COUNTY_FIPS[index])) {
    fail("RATE_COUNTY_SET_INCOMPLETE");
  }
  await verifyFileUnchanged(inputPath, initial, parsedIntegrity, input, "RATE");
  const raw = canonicalFloridaRateTable(config.version, rows);
  return {
    rows,
    raw,
    sha256: sha256Text(raw),
    sourceFiles: [{
      label: input.label,
      content_sha256: initial.sha256,
      bytes: initial.bytes,
      rows: rows.length,
    }],
  };
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function canonicalD1Sql({ dataset, datasetWindow, pointMatch, rates, rateWindow, rateResult }) {
  const lines = [
    "INSERT INTO florida_jurisdiction_datasets",
    "  (dataset_version, schema_version, status, effective_from, effective_through, stale_after, row_count, content_sha256, source_url, imported_at)",
    `VALUES (${sqlText(dataset.version)}, ${sqlText(dataset.schema_version)}, 'ACTIVE', ${datasetWindow.effectiveFrom}, ${datasetWindow.effectiveThrough}, ${datasetWindow.staleAfter}, ${pointMatch.indexPayload.row_count}, ${sqlText(pointMatch.indexSha256)}, ${sqlText(dataset.source.url)}, ${datasetWindow.importedAt});`,
    "INSERT INTO florida_sales_tax_rate_manifests",
    "  (rate_version, status, effective_from, effective_through, stale_after, row_count, content_sha256, source_url, imported_at)",
    `VALUES (${sqlText(rates.version)}, 'ACTIVE', ${rateWindow.effectiveFrom}, ${rateWindow.effectiveThrough}, ${rateWindow.staleAfter}, 67, ${sqlText(rateResult.sha256)}, ${sqlText(rates.source.url)}, ${rateWindow.importedAt});`,
    "INSERT INTO florida_county_sales_tax_rates",
    "  (rate_version, county_fips, state_rate_bps, surtax_rate_bps, combined_rate_bps)",
    "VALUES",
  ];
  rateResult.rows.forEach((row, index) => {
    const suffix = index === rateResult.rows.length - 1 ? ";" : ",";
    lines.push(
      `  (${sqlText(rates.version)}, ${sqlText(row.county_fips)}, ${row.state_rate_bps}, ${row.surtax_rate_bps}, ${row.combined_rate_bps})${suffix}`,
    );
  });
  lines.push("");
  return lines.join("\n");
}

function canonicalProvenance({ config, configDigest, windows, pointMatch, rateResult, sqlRaw }) {
  return canonicalJson({
    schema_version: PRIVATE_BUNDLE_SCHEMA,
    mapping_config_sha256: configDigest,
    dataset: {
      version: config.dataset.version,
      schema_version: config.dataset.schema_version,
      shard_prefix: config.dataset.shard_prefix,
      effective_from: windows.datasetWindow.effectiveFrom,
      effective_through: windows.datasetWindow.effectiveThrough,
      stale_after: windows.datasetWindow.staleAfter,
      imported_at: windows.datasetWindow.importedAt,
      row_count: pointMatch.indexPayload.row_count,
      shard_count: pointMatch.indexPayload.shard_count,
      index_object_key: pointMatch.indexObjectKey,
      content_sha256: pointMatch.indexSha256,
      source: config.dataset.source,
      source_files: pointMatch.sourceFiles,
    },
    rates: {
      version: config.rates.version,
      effective_from: windows.rateWindow.effectiveFrom,
      effective_through: windows.rateWindow.effectiveThrough,
      stale_after: windows.rateWindow.staleAfter,
      imported_at: windows.rateWindow.importedAt,
      row_count: 67,
      content_sha256: rateResult.sha256,
      source: config.rates.source,
      source_files: rateResult.sourceFiles,
    },
    artifacts: {
      rates_object: "florida-rates.json",
      rates_sha256: rateResult.sha256,
      d1_import: "d1-import.sql",
      d1_import_sha256: sha256Text(sqlRaw),
    },
  });
}

function resolveSafeOutputLexically(outputDir) {
  const resolved = requireLexicallyPrivateFilesystemPath(outputDir, "OUTPUT_PATH_NOT_PRIVATE");
  const parsed = path.parse(resolved);
  if (resolved === parsed.root || !parsed.base || parsed.base === "." || parsed.base === "..") {
    fail("OUTPUT_PATH_UNSAFE");
  }
  return resolved;
}

async function ensureOutputAbsent(outputDir) {
  try {
    await lstat(outputDir);
    fail("OUTPUT_ALREADY_EXISTS");
  } catch (error) {
    if (error instanceof FloridaTaxImportError) throw error;
    if (error?.code !== "ENOENT") fail("OUTPUT_PATH_UNUSABLE");
  }
}

async function removeVerifiedTemporaryDirectory(tempDir, parentDir) {
  const resolvedTemp = path.resolve(tempDir);
  const resolvedParent = path.resolve(parentDir);
  if (path.dirname(resolvedTemp) !== resolvedParent || !path.basename(resolvedTemp).startsWith(".oip-fl-tax-import-")) {
    fail("TEMP_PATH_UNSAFE");
  }
  await verifyPrivateFilesystemPath(resolvedParent, {
    code: "TEMP_CLEANUP_REFUSED",
    expected: "DIRECTORY",
  });
  await verifyPrivateFilesystemPath(resolvedTemp, {
    code: "TEMP_CLEANUP_REFUSED",
    expected: "DIRECTORY",
  });
  await listBundleFiles(resolvedTemp);
  await rm(resolvedTemp, { recursive: true, force: true });
}

export async function buildPrivateBundle({ configPath, outputDir, secret }) {
  const resolvedConfigPath = await verifyPrivateFilesystemPath(configPath, {
    code: "CONFIG_PATH_NOT_PRIVATE",
    expected: "FILE",
  });
  const resolvedOutput = resolveSafeOutputLexically(outputDir);
  await verifyPrivateFilesystemPath(resolvedOutput, {
    code: "OUTPUT_PATH_NOT_PRIVATE",
    expected: "MISSING",
  });
  await ensureOutputAbsent(resolvedOutput);
  const config = await safeReadConfig(resolvedConfigPath);
  const windows = validateImportConfig(config);
  const key = secretBytes(secret);
  const parentDir = path.dirname(resolvedOutput);
  await mkdir(parentDir, { recursive: true });
  await verifyPrivateFilesystemPath(parentDir, {
    code: "OUTPUT_PARENT_PATH_NOT_PRIVATE",
    expected: "DIRECTORY",
  });
  const tempDir = path.join(parentDir, `.oip-fl-tax-import-${process.pid}-${randomBytes(8).toString("hex")}`);
  await ensureOutputAbsent(tempDir);
  await mkdir(tempDir, { recursive: false });
  await verifyPrivateFilesystemPath(tempDir, {
    code: "TEMP_PATH_NOT_PRIVATE",
    expected: "DIRECTORY",
  });
  try {
    const configDir = path.dirname(resolvedConfigPath);
    const pointMatch = await importPointMatch({
      config: config.dataset,
      configDir,
      outputDir: tempDir,
      secret: key,
    });
    const rateResult = await importRates({ config: config.rates, configDir });
    await writeUtf8(path.join(tempDir, "florida-rates.json"), rateResult.raw);
    const sqlRaw = canonicalD1Sql({
      dataset: config.dataset,
      datasetWindow: windows.datasetWindow,
      pointMatch,
      rates: config.rates,
      rateWindow: windows.rateWindow,
      rateResult,
    });
    await writeUtf8(path.join(tempDir, "d1-import.sql"), sqlRaw);
    const configDigest = sha256Text(canonicalJson(config));
    const provenanceRaw = canonicalProvenance({
      config,
      configDigest,
      windows,
      pointMatch,
      rateResult,
      sqlRaw,
    });
    await writeUtf8(path.join(tempDir, "provenance-manifest.json"), provenanceRaw);
    await validatePrivateBundle(tempDir);
    await verifyPrivateFilesystemPath(resolvedConfigPath, {
      code: "CONFIG_PATH_CHANGED",
      expected: "FILE",
    });
    for (const input of config.dataset.inputs) {
      await verifyPrivateFilesystemPath(path.resolve(configDir, input.path), {
        code: "POINTMATCH_SOURCE_PATH_CHANGED",
        expected: "FILE",
      });
    }
    await verifyPrivateFilesystemPath(path.resolve(configDir, config.rates.input.path), {
      code: "RATE_SOURCE_PATH_CHANGED",
      expected: "FILE",
    });
    await verifyPrivateFilesystemPath(parentDir, {
      code: "OUTPUT_PARENT_PATH_CHANGED",
      expected: "DIRECTORY",
    });
    await verifyPrivateFilesystemPath(tempDir, {
      code: "TEMP_PATH_CHANGED",
      expected: "DIRECTORY",
    });
    await verifyPrivateFilesystemPath(resolvedOutput, {
      code: "OUTPUT_PATH_CHANGED",
      expected: "MISSING",
    });
    await rename(tempDir, resolvedOutput);
    return {
      outputDir: resolvedOutput,
      datasetRows: pointMatch.indexPayload.row_count,
      shardCount: pointMatch.indexPayload.shard_count,
      rateRows: rateResult.rows.length,
    };
  } catch (error) {
    await removeVerifiedTemporaryDirectory(tempDir, parentDir);
    if (error instanceof FloridaTaxImportError) throw error;
    fail("IMPORT_FAILED_CLOSED");
  } finally {
    key.fill(0);
  }
}

function exactKeysInOrder(value, keys) {
  return isPlainObject(value) && compareArrays(Object.keys(value), keys);
}

async function readBoundedUtf8(filePath, maxBytes, code) {
  let info;
  try {
    info = await lstat(filePath);
  } catch {
    fail(code);
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > maxBytes) fail(code);
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    fail(code);
  }
  if (Buffer.byteLength(raw, "utf8") !== info.size) fail(code);
  return raw;
}

function parseJsonBound(raw, code) {
  try {
    return JSON.parse(raw);
  } catch {
    fail(code);
  }
}

function validSourceFileEvidence(file) {
  return exactKeysInOrder(file, ["label", "content_sha256", "bytes", "rows"]) &&
    SAFE_LABEL.test(file.label) && SHA256_HEX.test(file.content_sha256) &&
    Number.isSafeInteger(file.bytes) && file.bytes > 0 &&
    Number.isSafeInteger(file.rows) && file.rows > 0;
}

function validateProvenanceShape(provenance) {
  if (!exactKeysInOrder(provenance, ["schema_version", "mapping_config_sha256", "dataset", "rates", "artifacts"])) {
    fail("BUNDLE_PROVENANCE_INVALID");
  }
  if (provenance.schema_version !== PRIVATE_BUNDLE_SCHEMA || !SHA256_HEX.test(provenance.mapping_config_sha256)) {
    fail("BUNDLE_PROVENANCE_INVALID");
  }
  if (!exactKeysInOrder(provenance.dataset, [
    "version", "schema_version", "shard_prefix", "effective_from", "effective_through", "stale_after",
    "imported_at", "row_count", "shard_count", "index_object_key", "content_sha256", "source", "source_files",
  ])) fail("BUNDLE_PROVENANCE_INVALID");
  if (!exactKeysInOrder(provenance.rates, [
    "version", "effective_from", "effective_through", "stale_after", "imported_at", "row_count",
    "content_sha256", "source", "source_files",
  ])) fail("BUNDLE_PROVENANCE_INVALID");
  if (!exactKeysInOrder(provenance.artifacts, [
    "rates_object", "rates_sha256", "d1_import", "d1_import_sha256",
  ])) fail("BUNDLE_PROVENANCE_INVALID");
  for (const section of [provenance.dataset, provenance.rates]) {
    if (!Array.isArray(section.source_files) || section.source_files.length < 1 ||
        !section.source_files.every(validSourceFileEvidence)) fail("BUNDLE_PROVENANCE_INVALID");
    if (new Set(section.source_files.map((file) => file.label)).size !== section.source_files.length) {
      fail("BUNDLE_PROVENANCE_INVALID");
    }
    const sourceWindow = validateSource(section.source, "BUNDLE");
    for (const field of ["effective_from", "effective_through", "stale_after", "imported_at", "row_count"]) {
      if (!Number.isSafeInteger(section[field]) || section[field] < 0) fail("BUNDLE_PROVENANCE_INVALID");
    }
    if (
      section.effective_from > section.stale_after || section.stale_after > section.effective_through ||
      section.imported_at > section.stale_after || sourceWindow.retrievedAt > section.imported_at ||
      section.source_files.reduce((total, file) => total + file.rows, 0) !== section.row_count
    ) fail("BUNDLE_PROVENANCE_INVALID");
  }
  if (
    !VERSION.test(provenance.dataset.version) || !VERSION.test(provenance.dataset.schema_version) ||
    !SHARD_PREFIX.test(provenance.dataset.shard_prefix) || !SHA256_HEX.test(provenance.dataset.content_sha256) ||
    !Number.isSafeInteger(provenance.dataset.shard_count) || provenance.dataset.shard_count < 1 ||
    provenance.dataset.shard_count > 100000 ||
    provenance.dataset.index_object_key !== `${provenance.dataset.shard_prefix}/${provenance.dataset.version}/index.json` ||
    !VERSION.test(provenance.rates.version) || provenance.rates.row_count !== 67 ||
    !SHA256_HEX.test(provenance.rates.content_sha256) ||
    provenance.artifacts.rates_object !== "florida-rates.json" ||
    provenance.artifacts.d1_import !== "d1-import.sql" ||
    !SHA256_HEX.test(provenance.artifacts.rates_sha256) ||
    !SHA256_HEX.test(provenance.artifacts.d1_import_sha256)
  ) fail("BUNDLE_PROVENANCE_INVALID");
}

async function listBundleFiles(root, relative = "") {
  let entries;
  try {
    entries = await readdir(path.join(root, relative), { withFileTypes: true });
  } catch {
    fail("BUNDLE_LAYOUT_INVALID");
  }
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) fail("BUNDLE_LAYOUT_INVALID");
    if (entry.isDirectory()) files.push(...await listBundleFiles(root, child));
    else if (entry.isFile()) files.push(child.replaceAll("\\", "/"));
    else fail("BUNDLE_LAYOUT_INVALID");
    if (files.length > 100005) fail("BUNDLE_LAYOUT_INVALID");
  }
  return files.sort();
}

export async function validatePrivateBundle(bundleDir) {
  const resolvedLexical = resolveSafeOutputLexically(bundleDir);
  const resolved = await verifyPrivateFilesystemPath(resolvedLexical, {
    code: "BUNDLE_PATH_NOT_PRIVATE",
    expected: "DIRECTORY",
  });
  const provenanceRaw = await readBoundedUtf8(
    path.join(resolved, "provenance-manifest.json"),
    1024 * 1024,
    "BUNDLE_PROVENANCE_INVALID",
  );
  const provenance = parseJsonBound(provenanceRaw, "BUNDLE_PROVENANCE_INVALID");
  validateProvenanceShape(provenance);
  if (provenanceRaw !== canonicalJson(provenance)) fail("BUNDLE_PROVENANCE_NOT_CANONICAL");

  const indexPath = path.join(resolved, ...provenance.dataset.index_object_key.split("/"));
  const indexRaw = await readBoundedUtf8(indexPath, MAX_SHARD_BYTES, "BUNDLE_INDEX_INVALID");
  if (sha256Text(indexRaw) !== provenance.dataset.content_sha256) fail("BUNDLE_INDEX_DIGEST_MISMATCH");
  const index = parseJsonBound(indexRaw, "BUNDLE_INDEX_INVALID");
  if (
    !exactKeysInOrder(index, ["dataset_version", "schema_version", "row_count", "shard_count", "shards"]) ||
    index.dataset_version !== provenance.dataset.version ||
    index.schema_version !== provenance.dataset.schema_version ||
    index.row_count !== provenance.dataset.row_count || index.shard_count !== provenance.dataset.shard_count ||
    !Array.isArray(index.shards) || index.shards.length !== index.shard_count ||
    index.shard_count > 100000 ||
    indexRaw !== canonicalPointMatchIndex(index)
  ) fail("BUNDLE_INDEX_INVALID");
  let previousZip5 = "";
  let aggregateRows = 0;
  for (const shardEntry of index.shards) {
    if (!exactKeysInOrder(shardEntry, ["zip5", "object_key", "row_count", "content_sha256"]) ||
        !ZIP5.test(shardEntry.zip5) || shardEntry.zip5 <= previousZip5 ||
        shardEntry.object_key !== `${provenance.dataset.shard_prefix}/${provenance.dataset.version}/zip5/${shardEntry.zip5}.json` ||
        !Number.isSafeInteger(shardEntry.row_count) || shardEntry.row_count < 1 ||
        !SHA256_HEX.test(shardEntry.content_sha256)) fail("BUNDLE_INDEX_INVALID");
    previousZip5 = shardEntry.zip5;
    aggregateRows += shardEntry.row_count;
    if (!Number.isSafeInteger(aggregateRows)) fail("BUNDLE_INDEX_INVALID");
    const shardRaw = await readBoundedUtf8(
      path.join(resolved, ...shardEntry.object_key.split("/")),
      MAX_SHARD_BYTES,
      "BUNDLE_SHARD_INVALID",
    );
    if (sha256Text(shardRaw) !== shardEntry.content_sha256) fail("BUNDLE_SHARD_DIGEST_MISMATCH");
    const shard = parseJsonBound(shardRaw, "BUNDLE_SHARD_INVALID");
    if (!exactKeysInOrder(shard, ["dataset_version", "schema_version", "zip5", "records"]) ||
        shard.dataset_version !== provenance.dataset.version ||
        shard.schema_version !== provenance.dataset.schema_version || shard.zip5 !== shardEntry.zip5 ||
        !Array.isArray(shard.records) || shard.records.length !== shardEntry.row_count ||
        !shard.records.every(validPointMatchRecord) || shardRaw !== canonicalPointMatchShard(shard)) {
      fail("BUNDLE_SHARD_INVALID");
    }
    let previousHmac = "";
    for (const record of shard.records) {
      if (record.address_hmac <= previousHmac) fail("BUNDLE_SHARD_ORDER_INVALID");
      if (record.pending_effective_date !== null) {
        exactUtcDate(record.pending_effective_date, false, "BUNDLE_SHARD_INVALID", "pending_effective_date");
      }
      previousHmac = record.address_hmac;
    }
  }
  if (aggregateRows !== index.row_count) fail("BUNDLE_INDEX_ROW_COUNT_MISMATCH");

  const ratesRaw = await readBoundedUtf8(
    path.join(resolved, provenance.artifacts.rates_object),
    1024 * 1024,
    "BUNDLE_RATES_INVALID",
  );
  if (
    sha256Text(ratesRaw) !== provenance.rates.content_sha256 ||
    provenance.artifacts.rates_sha256 !== provenance.rates.content_sha256
  ) fail("BUNDLE_RATES_DIGEST_MISMATCH");
  const rateTable = parseJsonBound(ratesRaw, "BUNDLE_RATES_INVALID");
  if (!exactKeysInOrder(rateTable, ["rate_version", "rows"]) ||
      rateTable.rate_version !== provenance.rates.version || !Array.isArray(rateTable.rows) ||
      rateTable.rows.length !== 67 || ratesRaw !== canonicalFloridaRateTable(rateTable.rate_version, rateTable.rows)) {
    fail("BUNDLE_RATES_INVALID");
  }
  for (let indexValue = 0; indexValue < rateTable.rows.length; indexValue += 1) {
    const row = rateTable.rows[indexValue];
    if (!exactKeysInOrder(row, ["county_fips", "state_rate_bps", "surtax_rate_bps", "combined_rate_bps"]) ||
        row.county_fips !== COUNTY_FIPS[indexValue] || row.state_rate_bps !== 600 ||
        !Number.isSafeInteger(row.surtax_rate_bps) || row.surtax_rate_bps < 0 || row.surtax_rate_bps > 200 ||
        row.combined_rate_bps !== row.state_rate_bps + row.surtax_rate_bps) {
      fail("BUNDLE_RATES_INVALID");
    }
  }

  const sqlRaw = await readBoundedUtf8(
    path.join(resolved, provenance.artifacts.d1_import),
    1024 * 1024,
    "BUNDLE_SQL_INVALID",
  );
  if (sha256Text(sqlRaw) !== provenance.artifacts.d1_import_sha256) fail("BUNDLE_SQL_DIGEST_MISMATCH");
  const expectedSql = canonicalD1Sql({
    dataset: {
      version: provenance.dataset.version,
      schema_version: provenance.dataset.schema_version,
      source: provenance.dataset.source,
    },
    datasetWindow: {
      effectiveFrom: provenance.dataset.effective_from,
      effectiveThrough: provenance.dataset.effective_through,
      staleAfter: provenance.dataset.stale_after,
      importedAt: provenance.dataset.imported_at,
    },
    pointMatch: { indexPayload: index, indexSha256: provenance.dataset.content_sha256 },
    rates: { version: provenance.rates.version, source: provenance.rates.source },
    rateWindow: {
      effectiveFrom: provenance.rates.effective_from,
      effectiveThrough: provenance.rates.effective_through,
      staleAfter: provenance.rates.stale_after,
      importedAt: provenance.rates.imported_at,
    },
    rateResult: { rows: rateTable.rows, sha256: provenance.rates.content_sha256 },
  });
  if (sqlRaw !== expectedSql) fail("BUNDLE_SQL_INVALID");
  const expectedFiles = [
    "d1-import.sql",
    "florida-rates.json",
    "provenance-manifest.json",
    provenance.dataset.index_object_key,
    ...index.shards.map((entry) => entry.object_key),
  ].sort();
  if (!compareArrays(await listBundleFiles(resolved), expectedFiles)) fail("BUNDLE_LAYOUT_INVALID");
  return {
    datasetRows: index.row_count,
    shardCount: index.shard_count,
    rateRows: rateTable.rows.length,
  };
}
