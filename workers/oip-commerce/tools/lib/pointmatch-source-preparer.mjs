import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

import { normalizedAddressKey } from "../../src/florida-tax.js";

export const POINTMATCH_PREP_CONFIG_SCHEMA = "oip-pointmatch-source-prep-config-v1";
export const POINTMATCH_PREP_PROVENANCE_SCHEMA = "oip-pointmatch-source-prep-provenance-v1";
export const POINTMATCH_SOURCE_HEADER = Object.freeze([
  "NUMBER", "PREDIR", "STNAME", "STSUFFIX", "POSTDIR", "UNITTYPE", "UNITNUM",
  "MAILCITY", "ZIP", "ZIP+4", "LAT", "LONG", "FEATID", "COUNTYID", "COUNTY",
  "JURISDICTION", "FIRECODE", "POLCODE", "EFFDATE", "TDTCODE",
]);
export const POINTMATCH_DERIVED_HEADER = Object.freeze([
  "address_line_1", "address_line_2", "locality", "region", "zip5", "county_fips",
  "match_status", "pending_effective_date", "special_case_code", "unit_policy",
  "lookup_scope",
]);

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,127}$/u;
const SOURCE_URL = /^https:\/\/[^\s]{1,2039}$/u;
const ZIP5 = /^\d{5}$/u;
const COUNTY_ID = /^\d{3}$/u;
const COUNTY_FIPS = Object.freeze(
  Array.from({ length: 67 }, (_, index) => `12${String((index * 2) + 1).padStart(3, "0")}`),
);
const COUNTY_FIPS_SET = new Set(COUNTY_FIPS);
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_CENTRAL_DIRECTORY_BYTES = 16 * 1024 * 1024;
const MAX_FIELD_CHARACTERS = 8192;
const MAX_COLUMNS = 256;
const EXPECTED_CSV_FILES = 67;
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_SENTINEL = 0xffffffff;
const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIRECTORY = path.resolve(MODULE_DIRECTORY, "../..");
const REPOSITORY_DIRECTORY = path.resolve(WORKER_DIRECTORY, "../..");
const IGNORED_PRIVATE_DIRECTORY = path.join(WORKER_DIRECTORY, ".private-imports");
const DERIVED_FILENAME = "pointmatch-derived.csv";
const PROVENANCE_FILENAME = "pointmatch-prep-provenance.json";
const STAGED_ARCHIVE_FILENAME = ".pointmatch-source.zip";
const COPY_BUFFER_BYTES = 64 * 1024;

export class PointMatchSourcePrepError extends Error {
  constructor(code, { source = null, record = null, field = null } = {}) {
    const parts = [code];
    if (source !== null) parts.push(`source=${source}`);
    if (record !== null) parts.push(`record=${record}`);
    if (field !== null) parts.push(`field=${field}`);
    super(parts.join(" "));
    this.name = "PointMatchSourcePrepError";
    this.code = code;
    this.source = source;
    this.record = record;
    this.field = field;
  }
}

function fail(code, details) {
  throw new PointMatchSourcePrepError(code, details);
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

function exactUtcDate(value, code, field) {
  requireString(value, DATE, code, field);
  const milliseconds = Date.parse(`${value}T00:00:00Z`);
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

function validateSourceMetadata(source) {
  requireExactKeys(source, [
    "label", "path", "expected_sha256", "expected_bytes", "expected_rows",
    "effective_date", "effdate_format", "csv_encoding", "authority", "url",
    "release_date", "release_date_status", "retrieved_at", "release_evidence_id", "terms_evidence_id",
  ], "SOURCE_CONFIG_INVALID");
  requireString(source.label, SAFE_LABEL, "SOURCE_CONFIG_INVALID", "label");
  if (typeof source.path !== "string" || source.path.length < 1 || source.path.length > 4096 || source.path.includes("\0")) {
    fail("SOURCE_CONFIG_INVALID", { field: "path" });
  }
  requireString(source.expected_sha256, SHA256_HEX, "SOURCE_CONFIG_INVALID", "expected_sha256");
  requireSafeInteger(source.expected_bytes, 1, MAX_ARCHIVE_BYTES, "SOURCE_CONFIG_INVALID", "expected_bytes");
  requireSafeInteger(source.expected_rows, 67, 100_000_000, "SOURCE_CONFIG_INVALID", "expected_rows");
  const effectiveDate = exactUtcDate(source.effective_date, "SOURCE_CONFIG_INVALID", "effective_date");
  if (source.effdate_format !== "MM/DD/YYYY") {
    fail("SOURCE_CONFIG_INVALID", { field: "effdate_format" });
  }
  if (!new Set(["utf-8", "windows-1252"]).has(source.csv_encoding)) {
    fail("SOURCE_CONFIG_INVALID", { field: "csv_encoding" });
  }
  if (typeof source.authority !== "string" || source.authority.length < 1 || source.authority.length > 256) {
    fail("SOURCE_CONFIG_INVALID", { field: "authority" });
  }
  requireString(source.url, SOURCE_URL, "SOURCE_CONFIG_INVALID", "url");
  let parsedUrl;
  try {
    parsedUrl = new URL(source.url);
  } catch {
    fail("SOURCE_CONFIG_INVALID", { field: "url" });
  }
  if (parsedUrl.username || parsedUrl.password || parsedUrl.hash || parsedUrl.port) {
    fail("SOURCE_CONFIG_INVALID", { field: "url" });
  }
  let releaseDate = null;
  if (source.release_date_status === "STATED_BY_SOURCE") {
    releaseDate = exactUtcDate(source.release_date, "SOURCE_CONFIG_INVALID", "release_date");
  } else if (source.release_date_status === "NOT_STATED_BY_SOURCE" && source.release_date === null) {
    releaseDate = null;
  } else {
    fail("SOURCE_CONFIG_INVALID", { field: "release_date_status" });
  }
  const retrievedAt = exactUtcTimestamp(source.retrieved_at, "SOURCE_CONFIG_INVALID", "retrieved_at");
  if (releaseDate !== null && (retrievedAt < releaseDate || effectiveDate < releaseDate)) {
    fail("SOURCE_DATE_ORDER_INVALID");
  }
  for (const field of ["release_evidence_id", "terms_evidence_id"]) {
    requireString(source[field], SAFE_LABEL, "SOURCE_CONFIG_INVALID", field);
  }
}

function validatePreparation(preparation) {
  requireExactKeys(preparation, [
    "preparation_evidence_id", "max_archive_bytes", "max_entry_uncompressed_bytes",
    "max_total_uncompressed_bytes", "max_records_per_chunk", "max_chunks",
  ], "PREPARATION_CONFIG_INVALID");
  requireString(
    preparation.preparation_evidence_id,
    SAFE_LABEL,
    "PREPARATION_CONFIG_INVALID",
    "preparation_evidence_id",
  );
  requireSafeInteger(
    preparation.max_archive_bytes,
    1,
    MAX_ARCHIVE_BYTES,
    "PREPARATION_CONFIG_INVALID",
    "max_archive_bytes",
  );
  requireSafeInteger(
    preparation.max_entry_uncompressed_bytes,
    1,
    MAX_ENTRY_BYTES,
    "PREPARATION_CONFIG_INVALID",
    "max_entry_uncompressed_bytes",
  );
  requireSafeInteger(
    preparation.max_total_uncompressed_bytes,
    1,
    MAX_TOTAL_UNCOMPRESSED_BYTES,
    "PREPARATION_CONFIG_INVALID",
    "max_total_uncompressed_bytes",
  );
  requireSafeInteger(
    preparation.max_records_per_chunk,
    1,
    1_000_000,
    "PREPARATION_CONFIG_INVALID",
    "max_records_per_chunk",
  );
  requireSafeInteger(preparation.max_chunks, 1, 512, "PREPARATION_CONFIG_INVALID", "max_chunks");
}

export function validatePointMatchPrepConfig(config) {
  requireExactKeys(
    config,
    ["schema_version", "dataset_version", "prepared_at", "source", "preparation"],
    "CONFIG_INVALID",
  );
  if (config.schema_version !== POINTMATCH_PREP_CONFIG_SCHEMA) fail("CONFIG_SCHEMA_UNSUPPORTED");
  requireString(config.dataset_version, VERSION, "CONFIG_INVALID", "dataset_version");
  exactUtcTimestamp(config.prepared_at, "CONFIG_INVALID", "prepared_at");
  validateSourceMetadata(config.source);
  validatePreparation(config.preparation);
  if (config.source.expected_bytes > config.preparation.max_archive_bytes) {
    fail("SOURCE_LIMIT_EXCEEDED");
  }
  if (config.source.retrieved_at > config.prepared_at) fail("SOURCE_DATE_ORDER_INVALID");
  return config;
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
    "$paths=ConvertFrom-Json -InputObject $env:OIP_POINTMATCH_PREP_PATH_AUDIT",
    "foreach($candidate in $paths){",
    "  $item=Get-Item -LiteralPath $candidate -Force",
    "  if(($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0){exit 42}",
    "}",
    "exit 0",
  ].join(";");
  const childEnvironment = {
    ...process.env,
    OIP_POINTMATCH_PREP_PATH_AUDIT: JSON.stringify(existingPaths),
  };
  delete childEnvironment.ADDRESS_LOOKUP_HMAC_SECRET;
  await new Promise((resolve, reject) => {
    const child = spawn(
      powershell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, stdio: "ignore", env: childEnvironment },
    );
    child.once("error", () => reject(new PointMatchSourcePrepError(code)));
    child.once("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new PointMatchSourcePrepError(code));
    });
  });
}

async function verifyPrivateFilesystemPath(candidate, { code, expected = "ANY" }) {
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

function sameFileObject(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFileIdentity(left, right) {
  return (
    sameFileObject(left, right) && left.size === right.size &&
    left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
  );
}

async function openStablePrivateSource(filePath, { code = "SOURCE_PATH_NOT_PRIVATE" } = {}) {
  const resolved = await verifyPrivateFilesystemPath(filePath, { code, expected: "FILE" });
  let pathInfo;
  let handle = null;
  try {
    pathInfo = await lstat(resolved);
    if (!pathInfo.isFile() || pathInfo.isSymbolicLink()) fail("SOURCE_NOT_REGULAR_FILE");
    handle = await open(resolved, "r");
    const handleInfo = await handle.stat();
    if (!handleInfo.isFile() || !sameFileIdentity(pathInfo, handleInfo)) {
      fail("SOURCE_CHANGED_DURING_READ");
    }
    return { path: resolved, handle, info: handleInfo };
  } catch (error) {
    if (handle !== null) {
      try { await handle.close(); } catch { /* best effort */ }
    }
    if (error instanceof PointMatchSourcePrepError) throw error;
    fail("SOURCE_UNREADABLE");
  }
}

async function verifyStableSourceState(source) {
  let handleInfo;
  let pathInfo;
  try {
    handleInfo = await source.handle.stat();
    pathInfo = await lstat(source.path);
  } catch {
    fail("SOURCE_CHANGED_DURING_READ");
  }
  if (
    !handleInfo.isFile() || !pathInfo.isFile() || pathInfo.isSymbolicLink() ||
    !sameFileIdentity(source.info, handleInfo) || !sameFileIdentity(source.info, pathInfo)
  ) {
    fail("SOURCE_CHANGED_DURING_READ");
  }
}

async function readAndHashStableSource(source, maxBytes, destinationHandle = null) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  let bytes = 0;
  try {
    while (true) {
      const { bytesRead } = await source.handle.read(buffer, 0, buffer.length, bytes);
      if (bytesRead === 0) break;
      const nextBytes = bytes + bytesRead;
      if (!Number.isSafeInteger(nextBytes) || nextBytes > maxBytes) fail("SOURCE_TOO_LARGE");
      const chunk = buffer.subarray(0, bytesRead);
      hash.update(chunk);
      if (destinationHandle !== null) {
        let written = 0;
        while (written < bytesRead) {
          const result = await destinationHandle.write(
            chunk,
            written,
            bytesRead - written,
            bytes + written,
          );
          if (result.bytesWritten < 1) fail("SOURCE_STAGE_WRITE_FAILED");
          written += result.bytesWritten;
        }
      }
      bytes = nextBytes;
    }
    await verifyStableSourceState(source);
    return { sha256: hash.digest("hex"), bytes };
  } catch (error) {
    if (error instanceof PointMatchSourcePrepError) throw error;
    fail(destinationHandle === null ? "SOURCE_UNREADABLE" : "SOURCE_STAGE_WRITE_FAILED");
  }
}

async function digestPrivateFile(filePath, { code = "SOURCE_PATH_NOT_PRIVATE", maxBytes = MAX_ARCHIVE_BYTES } = {}) {
  const source = await openStablePrivateSource(filePath, { code });
  try {
    const digest = await readAndHashStableSource(source, maxBytes);
    return { path: source.path, ...digest, mtimeMs: source.info.mtimeMs };
  } finally {
    try { await source.handle.close(); } catch { /* digest is already fail-closed */ }
  }
}

export async function digestPointMatchArchive(filePath) {
  const digest = await digestPrivateFile(filePath);
  return { sha256: digest.sha256, bytes: digest.bytes };
}

async function safeReadConfig(configPath) {
  const resolved = await verifyPrivateFilesystemPath(configPath, {
    code: "CONFIG_PATH_NOT_PRIVATE",
    expected: "FILE",
  });
  let info;
  let raw;
  try {
    info = await lstat(resolved);
    raw = await readFile(resolved, "utf8");
  } catch {
    fail("CONFIG_UNREADABLE");
  }
  if (!info.isFile() || info.isSymbolicLink()) fail("CONFIG_PATH_NOT_PRIVATE");
  if (Buffer.byteLength(raw, "utf8") > MAX_CONFIG_BYTES) fail("CONFIG_TOO_LARGE");
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    fail("CONFIG_JSON_INVALID");
  }
  validatePointMatchPrepConfig(config);
  return {
    config,
    raw,
    path: resolved,
    bytes: Buffer.byteLength(raw, "utf8"),
    sha256: createHash("sha256").update(raw, "utf8").digest("hex"),
    mtimeMs: info.mtimeMs,
  };
}

async function verifyConfigUnchanged(initial) {
  let current;
  try {
    current = await lstat(initial.path);
  } catch {
    fail("CONFIG_CHANGED");
  }
  if (!current.isFile() || current.isSymbolicLink() || current.size !== initial.bytes || current.mtimeMs !== initial.mtimeMs) {
    fail("CONFIG_CHANGED");
  }
  const raw = await readFile(initial.path, "utf8");
  if (createHash("sha256").update(raw, "utf8").digest("hex") !== initial.sha256) fail("CONFIG_CHANGED");
}

function compareArrays(actual, expected) {
  return actual.length === expected.length && actual.every((entry, index) => entry === expected[index]);
}

function crc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = crc32Table();

function updateCrc32(state, bytes) {
  let value = state;
  for (let index = 0; index < bytes.length; index += 1) {
    value = CRC32_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

async function readExact(handle, length, position, code) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  try {
    while (offset < length) {
      const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
      if (bytesRead === 0) fail(code);
      offset += bytesRead;
    }
    return buffer;
  } catch (error) {
    if (error instanceof PointMatchSourcePrepError) throw error;
    fail(code);
  }
}

function decodeArchiveName(bytes, utf8Flag) {
  if (!utf8Flag && bytes.some((byte) => byte > 0x7f)) fail("ZIP_ENTRY_NAME_ENCODING_UNSUPPORTED");
  let value;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("ZIP_ENTRY_NAME_ENCODING_UNSUPPORTED");
  }
  if (!value || value.includes("\0") || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) {
    fail("ZIP_ENTRY_NAME_INVALID");
  }
  const segments = value.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) fail("ZIP_ENTRY_NAME_INVALID");
  return value;
}

async function readZipDirectory(archiveHandle, archiveBytes) {
  const tailLength = Math.min(archiveBytes, 65_557);
  const tail = await readExact(
    archiveHandle,
    tailLength,
    archiveBytes - tailLength,
    "ZIP_EOCD_INVALID",
  );
  let eocdOffset = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) !== ZIP_END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = tail.readUInt16LE(index + 20);
    if (index + 22 + commentLength === tail.length) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) fail("ZIP_EOCD_INVALID");
  const diskNumber = tail.readUInt16LE(eocdOffset + 4);
  const centralDisk = tail.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = tail.readUInt16LE(eocdOffset + 8);
  const totalEntries = tail.readUInt16LE(eocdOffset + 10);
  const centralBytes = tail.readUInt32LE(eocdOffset + 12);
  const centralOffset = tail.readUInt32LE(eocdOffset + 16);
  if (
    diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries ||
    totalEntries === 0xffff || centralBytes === ZIP64_SENTINEL || centralOffset === ZIP64_SENTINEL
  ) {
    fail("ZIP_LAYOUT_UNSUPPORTED");
  }
  if (
    centralBytes < 1 || centralBytes > MAX_CENTRAL_DIRECTORY_BYTES ||
    centralOffset + centralBytes > archiveBytes
  ) {
    fail("ZIP_CENTRAL_DIRECTORY_INVALID");
  }
  const central = await readExact(
    archiveHandle,
    centralBytes,
    centralOffset,
    "ZIP_CENTRAL_DIRECTORY_INVALID",
  );
  const entries = [];
  let cursor = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== ZIP_CENTRAL_FILE_HEADER) {
      fail("ZIP_CENTRAL_DIRECTORY_INVALID");
    }
    const flags = central.readUInt16LE(cursor + 8);
    const method = central.readUInt16LE(cursor + 10);
    const crc32 = central.readUInt32LE(cursor + 16);
    const compressedBytes = central.readUInt32LE(cursor + 20);
    const uncompressedBytes = central.readUInt32LE(cursor + 24);
    const nameLength = central.readUInt16LE(cursor + 28);
    const extraLength = central.readUInt16LE(cursor + 30);
    const commentLength = central.readUInt16LE(cursor + 32);
    const diskStart = central.readUInt16LE(cursor + 34);
    const localOffset = central.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > central.length) fail("ZIP_CENTRAL_DIRECTORY_INVALID");
    if (
      diskStart !== 0 || compressedBytes === ZIP64_SENTINEL ||
      uncompressedBytes === ZIP64_SENTINEL || localOffset === ZIP64_SENTINEL
    ) {
      fail("ZIP_LAYOUT_UNSUPPORTED");
    }
    if ((flags & 0x1) !== 0 || !new Set([0, 8]).has(method)) fail("ZIP_ENTRY_UNSUPPORTED");
    const nameBytes = central.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decodeArchiveName(nameBytes, (flags & 0x800) !== 0);
    entries.push({
      name,
      nameBytes: Buffer.from(nameBytes),
      flags,
      method,
      crc32,
      compressedBytes,
      uncompressedBytes,
      localOffset,
      directory: name.endsWith("/"),
    });
    cursor = end;
  }
  if (cursor !== central.length) fail("ZIP_CENTRAL_DIRECTORY_INVALID");
  return entries;
}

async function* readArchiveRange(archiveHandle, start, length, sourceLabel) {
  const buffer = Buffer.allocUnsafe(Math.min(COPY_BUFFER_BYTES, length));
  let position = start;
  let remaining = length;
  try {
    while (remaining > 0) {
      const requested = Math.min(buffer.length, remaining);
      const { bytesRead } = await archiveHandle.read(buffer, 0, requested, position);
      if (bytesRead === 0) fail("ZIP_ENTRY_RANGE_INVALID", { source: sourceLabel });
      yield Buffer.from(buffer.subarray(0, bytesRead));
      position += bytesRead;
      remaining -= bytesRead;
    }
  } catch (error) {
    if (error instanceof PointMatchSourcePrepError) throw error;
    fail("ZIP_ENTRY_READ_FAILED", { source: sourceLabel });
  }
}

async function zipEntryReadable(archiveHandle, archiveBytes, entry, limits) {
  if (
    entry.compressedBytes < 1 || entry.uncompressedBytes < 1 ||
    entry.compressedBytes > limits.max_archive_bytes ||
    entry.uncompressedBytes > limits.max_entry_uncompressed_bytes
  ) {
    fail("ZIP_ENTRY_LIMIT_EXCEEDED", { source: entry.sourceLabel });
  }
  if (entry.method === 0 && entry.compressedBytes !== entry.uncompressedBytes) {
    fail("ZIP_ENTRY_INTEGRITY_MISMATCH", { source: entry.sourceLabel });
  }
  try {
    const local = await readExact(archiveHandle, 30, entry.localOffset, "ZIP_LOCAL_HEADER_INVALID");
    if (local.readUInt32LE(0) !== ZIP_LOCAL_FILE_HEADER) fail("ZIP_LOCAL_HEADER_INVALID");
    const flags = local.readUInt16LE(6);
    const method = local.readUInt16LE(8);
    const nameLength = local.readUInt16LE(26);
    const extraLength = local.readUInt16LE(28);
    if (flags !== entry.flags || method !== entry.method) fail("ZIP_LOCAL_HEADER_MISMATCH");
    const localName = await readExact(
      archiveHandle,
      nameLength,
      entry.localOffset + 30,
      "ZIP_LOCAL_HEADER_INVALID",
    );
    if (!localName.equals(entry.nameBytes)) fail("ZIP_LOCAL_HEADER_MISMATCH");
    const dataStart = entry.localOffset + 30 + nameLength + extraLength;
    if (dataStart + entry.compressedBytes > archiveBytes) fail("ZIP_ENTRY_RANGE_INVALID");
    const compressed = Readable.from(readArchiveRange(
      archiveHandle,
      dataStart,
      entry.compressedBytes,
      entry.sourceLabel,
    ));
    return entry.method === 8 ? compressed.pipe(createInflateRaw()) : compressed;
  } catch (error) {
    if (error instanceof PointMatchSourcePrepError) throw error;
    fail("ZIP_ENTRY_READ_FAILED", { source: entry.sourceLabel });
  }
}

async function* parseCsvReadable(readable, {
  expectedHeader,
  encoding,
  sourceLabel,
  integrity,
  maxBytes = MAX_ENTRY_BYTES,
}) {
  const decoder = new TextDecoder(encoding, { fatal: true });
  let field = "";
  let fields = [];
  let state = "UNQUOTED";
  let recordNumber = 0;
  let skipLf = false;
  let firstCharacter = true;
  let crc = 0xffffffff;
  let bytes = 0;

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
    if (fields.length > MAX_COLUMNS) {
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
  const handleRecord = (completed) => {
    if (completed.length === 1 && completed[0] === "") {
      fail("CSV_BLANK_RECORD", { source: sourceLabel, record: recordNumber });
    }
    if (recordNumber === 1) {
      if (!compareArrays(completed, expectedHeader)) {
        fail("CSV_HEADER_MISMATCH", { source: sourceLabel, record: 1 });
      }
      return null;
    }
    if (completed.length !== expectedHeader.length) {
      fail("CSV_COLUMN_COUNT_INVALID", { source: sourceLabel, record: recordNumber });
    }
    return { recordNumber, fields: completed };
  };

  const decodedChunks = async function* () {
    try {
      for await (const chunk of readable) {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += data.length;
        if (!Number.isSafeInteger(bytes) || bytes > maxBytes) {
          fail("ZIP_ENTRY_LIMIT_EXCEEDED", { source: sourceLabel });
        }
        crc = updateCrc32(crc, data);
        yield decoder.decode(data, { stream: true });
      }
      const final = decoder.decode();
      if (final) yield final;
    } catch (error) {
      if (error instanceof PointMatchSourcePrepError) throw error;
      fail("ZIP_ENTRY_READ_FAILED", { source: sourceLabel });
    }
  };

  for await (const chunk of decodedChunks()) {
    for (const originalCharacter of chunk) {
      const character = originalCharacter;
      if (firstCharacter) {
        firstCharacter = false;
        if (character === "\uFEFF") continue;
      }
      if (character === "\0") fail("CSV_NUL_FORBIDDEN", { source: sourceLabel, record: recordNumber + 1 });
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
        const parsed = handleRecord(finishRecord());
        if (parsed) yield parsed;
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
    const parsed = handleRecord(finishRecord());
    if (parsed) yield parsed;
  }
  if (recordNumber === 0) fail("CSV_EMPTY", { source: sourceLabel });
  integrity.bytes = bytes;
  integrity.crc32 = (crc ^ 0xffffffff) >>> 0;
}

function rowObject(fields) {
  return Object.fromEntries(POINTMATCH_SOURCE_HEADER.map((name, index) => [name, fields[index]]));
}

function cleanComponent(value, maximum, details) {
  if (typeof value !== "string" || value.length > maximum || value.includes("\0")) {
    fail("SOURCE_ROW_INVALID", details);
  }
  return value.replace(/\s+/gu, " ").trim();
}

function composeLine(parts, details) {
  const value = parts.map((part) => cleanComponent(part, 256, details)).filter(Boolean).join(" ");
  if (!value || value.length > 256) fail("SOURCE_ROW_INVALID", details);
  return value;
}

function csvField(value) {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function validDateOrdinal(yearText, monthText, dayText) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(day) || day < 1 || day > days[month - 1]) return null;
  return (year * 10_000) + (month * 100) + day;
}

function canonicalDerivedRow(sourceRow, config, details) {
  const number = cleanComponent(sourceRow.NUMBER, 64, { ...details, field: "NUMBER" });
  if (!number) fail("SOURCE_ROW_INVALID", { ...details, field: "NUMBER" });
  const addressLine1 = composeLine(
    [sourceRow.NUMBER, sourceRow.PREDIR, sourceRow.STNAME, sourceRow.STSUFFIX, sourceRow.POSTDIR],
    { ...details, field: "address_line_1" },
  );
  const unitType = cleanComponent(sourceRow.UNITTYPE, 64, { ...details, field: "UNITTYPE" });
  const unitNumber = cleanComponent(sourceRow.UNITNUM, 128, { ...details, field: "UNITNUM" });
  if (Boolean(unitType) !== Boolean(unitNumber)) {
    fail("SOURCE_UNIT_PAIR_MISMATCH", { ...details, field: "UNITTYPE_UNITNUM" });
  }
  const addressLine2 = unitType ? `${unitType} ${unitNumber}` : "";
  if (unitType && !new Set(["UNIT", "LOT"]).has(unitType)) {
    fail("SOURCE_UNIT_TYPE_INVALID", { ...details, field: "UNITTYPE" });
  }
  const locality = cleanComponent(sourceRow.MAILCITY, 128, { ...details, field: "MAILCITY" });
  if (!locality) fail("SOURCE_ROW_INVALID", { ...details, field: "MAILCITY" });
  const zip5 = cleanComponent(sourceRow.ZIP, 5, { ...details, field: "ZIP" });
  if (!ZIP5.test(zip5)) fail("SOURCE_ROW_INVALID", { ...details, field: "ZIP" });
  const countyId = cleanComponent(sourceRow.COUNTYID, 3, { ...details, field: "COUNTYID" });
  const countyFips = `12${countyId}`;
  if (!COUNTY_ID.test(countyId) || !COUNTY_FIPS_SET.has(countyFips)) {
    fail("SOURCE_ROW_INVALID", { ...details, field: "COUNTYID" });
  }
  const matchedEffectiveDate = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(sourceRow.EFFDATE);
  if (!matchedEffectiveDate) {
    fail("SOURCE_ADDRESS_EFFECTIVE_DATE_INVALID", { ...details, field: "EFFDATE" });
  }
  const rowEffective = validDateOrdinal(
    matchedEffectiveDate[3],
    matchedEffectiveDate[1],
    matchedEffectiveDate[2],
  );
  const releaseEffective = Number(config.source.effective_date.replaceAll("-", ""));
  if (rowEffective === null || rowEffective > releaseEffective) {
    fail("SOURCE_ADDRESS_EFFECTIVE_DATE_INVALID", { ...details, field: "EFFDATE" });
  }
  const lookupScope = addressLine2 ? "UNIT" : "PRIMARY";
  const unitPolicy = addressLine2 ? "UNIT_SPECIFIC" : "NOT_JURISDICTION_DEPENDENT";
  const values = [
    addressLine1,
    addressLine2,
    locality,
    "FL",
    zip5,
    countyFips,
    "EXACT",
    "",
    "",
    unitPolicy,
    lookupScope,
  ];
  const destination = {
    address_line_1: addressLine1,
    address_line_2: addressLine2,
    locality,
    administrative_district_level_1: "FL",
    postal_code: zip5,
  };
  const normalizedKey = normalizedAddressKey(destination, { includeUnit: lookupScope === "UNIT" });
  const normalized = normalizedKey.split("|");
  if (!normalized[0] || !normalized[2] || normalized[3] !== "FL" || normalized[4] !== zip5) {
    fail("SOURCE_NORMALIZATION_INVALID", details);
  }
  return {
    sortKey: `${zip5}\0${normalizedKey}`,
    signature: `${countyFips}|${unitPolicy}|${lookupScope}`,
    csvLine: values.map(csvField).join(","),
    countyFips,
  };
}

class BufferedUtf8Writer {
  constructor(handle, { hash = false } = {}) {
    this.handle = handle;
    this.parts = [];
    this.pendingBytes = 0;
    this.bytes = 0;
    this.hash = hash ? createHash("sha256") : null;
  }

  async write(value) {
    this.parts.push(value);
    this.pendingBytes += Buffer.byteLength(value, "utf8");
    if (this.pendingBytes >= 1024 * 1024) await this.flush();
  }

  async flush() {
    if (this.parts.length === 0) return;
    const data = Buffer.from(this.parts.join(""), "utf8");
    await this.handle.write(data);
    this.bytes += data.length;
    if (this.hash) this.hash.update(data);
    this.parts = [];
    this.pendingBytes = 0;
  }

  async close() {
    await this.flush();
    await this.handle.close();
    return {
      bytes: this.bytes,
      sha256: this.hash ? this.hash.digest("hex") : null,
    };
  }
}

function chunkComparator(left, right) {
  if (left[0] < right[0]) return -1;
  if (left[0] > right[0]) return 1;
  if (left[1] < right[1]) return -1;
  if (left[1] > right[1]) return 1;
  if (left[2] < right[2]) return -1;
  if (left[2] > right[2]) return 1;
  return 0;
}

async function writeChunk(chunkDirectory, index, rows) {
  rows.sort((left, right) => chunkComparator(
    [left.sortKey, left.signature, left.csvLine],
    [right.sortKey, right.signature, right.csvLine],
  ));
  const chunkPath = path.join(chunkDirectory, `chunk-${String(index).padStart(4, "0")}.jsonl`);
  const handle = await open(chunkPath, "wx");
  const writer = new BufferedUtf8Writer(handle);
  try {
    for (const row of rows) await writer.write(`${JSON.stringify([row.sortKey, row.signature, row.csvLine])}\n`);
    await writer.close();
  } catch (error) {
    try { await handle.close(); } catch { /* best effort */ }
    throw error;
  }
  return chunkPath;
}

class MinHeap {
  constructor(compare) {
    this.values = [];
    this.compare = compare;
  }

  push(value) {
    const values = this.values;
    values.push(value);
    let index = values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(values[parent], value) <= 0) break;
      values[index] = values[parent];
      index = parent;
    }
    values[index] = value;
  }

  pop() {
    const values = this.values;
    if (values.length === 0) return null;
    const root = values[0];
    const tail = values.pop();
    if (values.length > 0) {
      let index = 0;
      while (true) {
        const left = (index * 2) + 1;
        if (left >= values.length) break;
        const right = left + 1;
        let child = right < values.length && this.compare(values[right], values[left]) < 0 ? right : left;
        if (this.compare(values[child], tail) >= 0) break;
        values[index] = values[child];
        index = child;
      }
      values[index] = tail;
    }
    return root;
  }
}

async function chunkIterator(filePath) {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  return {
    input,
    iterator: lines[Symbol.asyncIterator](),
    async close() {
      lines.close();
      input.destroy();
    },
  };
}

function parseChunkLine(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail("PRIVATE_CHUNK_INVALID");
  }
  if (
    !Array.isArray(parsed) || parsed.length !== 3 ||
    parsed.some((entry) => typeof entry !== "string")
  ) {
    fail("PRIVATE_CHUNK_INVALID");
  }
  return parsed;
}

async function mergeChunks(chunkPaths, derivedPath) {
  const readers = await Promise.all(chunkPaths.map((filePath) => chunkIterator(filePath)));
  const heap = new MinHeap((left, right) => {
    const compared = chunkComparator(left.row, right.row);
    return compared !== 0 ? compared : left.readerIndex - right.readerIndex;
  });
  const handle = await open(derivedPath, "wx");
  const writer = new BufferedUtf8Writer(handle, { hash: true });
  let derivedRows = 0;
  let duplicateGroupsCollapsed = 0;
  let duplicateRowsCollapsed = 0;
  let conflictGroupsQuarantined = 0;
  let conflictRowsQuarantined = 0;
  let unitSpecificRows = 0;
  let primaryRows = 0;

  const advance = async (readerIndex) => {
    const next = await readers[readerIndex].iterator.next();
    if (!next.done) heap.push({ row: parseChunkLine(next.value), readerIndex });
  };

  const flushGroup = async (group) => {
    if (!group) return;
    if (group.signatures.size > 1) {
      conflictGroupsQuarantined += 1;
      conflictRowsQuarantined += group.rows;
      return;
    }
    if (group.rows > 1) {
      duplicateGroupsCollapsed += 1;
      duplicateRowsCollapsed += group.rows - 1;
    }
    await writer.write(`${group.minimumCsvLine}\n`);
    derivedRows += 1;
    const signature = [...group.signatures][0];
    if (signature.endsWith("|UNIT_SPECIFIC|UNIT")) unitSpecificRows += 1;
    else primaryRows += 1;
  };

  let group = null;
  try {
    await writer.write(`${POINTMATCH_DERIVED_HEADER.join(",")}\n`);
    for (let index = 0; index < readers.length; index += 1) await advance(index);
    while (heap.values.length > 0) {
      const item = heap.pop();
      const [sortKey, signature, csvLine] = item.row;
      if (!group || group.sortKey !== sortKey) {
        await flushGroup(group);
        group = { sortKey, signatures: new Set([signature]), minimumCsvLine: csvLine, rows: 1 };
      } else {
        group.signatures.add(signature);
        group.rows += 1;
        if (csvLine < group.minimumCsvLine) group.minimumCsvLine = csvLine;
      }
      await advance(item.readerIndex);
    }
    await flushGroup(group);
    const digest = await writer.close();
    return {
      ...digest,
      derivedRows,
      duplicateGroupsCollapsed,
      duplicateRowsCollapsed,
      conflictGroupsQuarantined,
      conflictRowsQuarantined,
      unitSpecificRows,
      primaryRows,
    };
  } catch (error) {
    try { await handle.close(); } catch { /* best effort */ }
    throw error;
  } finally {
    await Promise.all(readers.map((reader) => reader.close()));
  }
}

async function createPrivateTempDirectory(outputDir) {
  const parent = path.dirname(outputDir);
  await verifyPrivateFilesystemPath(parent, { code: "OUTPUT_PATH_NOT_PRIVATE", expected: "DIRECTORY" });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = path.join(parent, `.pointmatch-prep-${randomBytes(12).toString("hex")}`);
    await verifyPrivateFilesystemPath(candidate, { code: "OUTPUT_PATH_NOT_PRIVATE", expected: "MISSING" });
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      if (error?.code !== "EEXIST") fail("OUTPUT_CREATE_FAILED");
    }
  }
  fail("OUTPUT_CREATE_FAILED");
}

async function stageBoundArchive({ config, sourcePath, tempDirectory }) {
  const source = await openStablePrivateSource(sourcePath, { code: "SOURCE_PATH_NOT_PRIVATE" });
  const stagedPath = path.join(tempDirectory, STAGED_ARCHIVE_FILENAME);
  let stagedHandle = null;
  try {
    await verifyPrivateFilesystemPath(stagedPath, {
      code: "SOURCE_STAGE_PATH_INVALID",
      expected: "MISSING",
    });
    stagedHandle = await open(stagedPath, "wx+");
    const stagedHandleInfo = await stagedHandle.stat();
    const stagedPathInfo = await lstat(stagedPath);
    if (
      !stagedHandleInfo.isFile() || !stagedPathInfo.isFile() || stagedPathInfo.isSymbolicLink() ||
      !sameFileObject(stagedHandleInfo, stagedPathInfo)
    ) {
      fail("SOURCE_STAGE_PATH_INVALID");
    }
    const digest = await readAndHashStableSource(
      source,
      config.preparation.max_archive_bytes,
      stagedHandle,
    );
    await stagedHandle.sync();
    const stagedFinalInfo = await stagedHandle.stat();
    const stagedFinalPathInfo = await lstat(stagedPath);
    if (
      !stagedFinalInfo.isFile() || !stagedFinalPathInfo.isFile() ||
      stagedFinalPathInfo.isSymbolicLink() || !sameFileObject(stagedHandleInfo, stagedFinalInfo) ||
      !sameFileObject(stagedHandleInfo, stagedFinalPathInfo) || stagedFinalInfo.size !== digest.bytes ||
      stagedFinalPathInfo.size !== digest.bytes
    ) {
      fail("SOURCE_STAGE_INTEGRITY_MISMATCH");
    }
    if (
      digest.bytes !== config.source.expected_bytes ||
      digest.sha256 !== config.source.expected_sha256
    ) {
      fail("SOURCE_BINDING_MISMATCH", { source: config.source.label });
    }
    return {
      path: source.path,
      sha256: digest.sha256,
      bytes: digest.bytes,
      mtimeMs: source.info.mtimeMs,
      stagedPath,
      handle: stagedHandle,
    };
  } catch (error) {
    if (stagedHandle !== null) {
      try { await stagedHandle.close(); } catch { /* best effort */ }
    }
    if (error instanceof PointMatchSourcePrepError) throw error;
    fail("SOURCE_STAGE_FAILED");
  } finally {
    try { await source.handle.close(); } catch { /* staged digest is already fail-closed */ }
  }
}

async function discardStagedArchive(stagedArchive) {
  try {
    await stagedArchive.handle.close();
    stagedArchive.handle = null;
    const verified = await verifyPrivateFilesystemPath(stagedArchive.stagedPath, {
      code: "SOURCE_STAGE_CLEANUP_FAILED",
      expected: "FILE",
    });
    await rm(verified, { force: false });
    await verifyPrivateFilesystemPath(stagedArchive.stagedPath, {
      code: "SOURCE_STAGE_CLEANUP_FAILED",
      expected: "MISSING",
    });
  } catch (error) {
    if (error instanceof PointMatchSourcePrepError) throw error;
    fail("SOURCE_STAGE_CLEANUP_FAILED");
  }
}

function validatedTestHooks(value) {
  if (value === null || value === undefined) return null;
  requireExactKeys(
    value,
    ["afterArchiveStaged", "afterArchivePrepared"],
    "TEST_HOOK_INVALID",
  );
  if (
    typeof value.afterArchiveStaged !== "function" ||
    typeof value.afterArchivePrepared !== "function"
  ) {
    fail("TEST_HOOK_INVALID");
  }
  return value;
}

async function invokeTestHook(testHooks, name) {
  if (testHooks === null) return;
  try {
    await testHooks[name]();
  } catch {
    fail("TEST_HOOK_FAILED");
  }
}

async function verifyFinalBundleLayout(bundleDir, code) {
  let entries;
  try {
    entries = (await readdir(bundleDir, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    fail(code);
  }
  if (
    entries.length !== 2 || entries.some((entry) => !entry.isFile()) ||
    entries[0].name !== DERIVED_FILENAME || entries[1].name !== PROVENANCE_FILENAME
  ) {
    fail(code);
  }
  await verifyPrivateFilesystemPath(path.join(bundleDir, DERIVED_FILENAME), { code, expected: "FILE" });
  await verifyPrivateFilesystemPath(path.join(bundleDir, PROVENANCE_FILENAME), { code, expected: "FILE" });
}

async function prepareArchive({ config, archiveHandle, archiveIntegrity, tempDirectory }) {
  const entries = await readZipDirectory(archiveHandle, archiveIntegrity.bytes);
  const csvEntries = entries.filter((entry) => !entry.directory && entry.name.toLowerCase().endsWith(".csv"));
  if (csvEntries.length !== EXPECTED_CSV_FILES) fail("SOURCE_CSV_FILE_COUNT_MISMATCH");
  csvEntries.sort((left, right) => Buffer.compare(left.nameBytes, right.nameBytes));
  const seenNames = new Set();
  for (const entry of csvEntries) {
    const key = entry.name.toLowerCase();
    if (seenNames.has(key)) fail("SOURCE_CSV_NAME_DUPLICATE");
    seenNames.add(key);
  }

  const chunkDirectory = path.join(tempDirectory, ".chunks");
  await mkdir(chunkDirectory);
  const chunkPaths = [];
  let currentChunk = [];
  let sourceRows = 0;
  let totalUncompressedBytes = 0;
  const countySet = new Set();

  const flushChunk = async () => {
    if (currentChunk.length === 0) return;
    if (chunkPaths.length >= config.preparation.max_chunks) fail("PREPARATION_CHUNK_LIMIT_EXCEEDED");
    chunkPaths.push(await writeChunk(chunkDirectory, chunkPaths.length, currentChunk));
    currentChunk = [];
  };

  for (let entryIndex = 0; entryIndex < csvEntries.length; entryIndex += 1) {
    const entry = csvEntries[entryIndex];
    entry.sourceLabel = `archive-csv-${String(entryIndex + 1).padStart(3, "0")}`;
    totalUncompressedBytes += entry.uncompressedBytes;
    if (
      !Number.isSafeInteger(totalUncompressedBytes) ||
      totalUncompressedBytes > config.preparation.max_total_uncompressed_bytes
    ) {
      fail("SOURCE_UNCOMPRESSED_LIMIT_EXCEEDED");
    }
    const readable = await zipEntryReadable(
      archiveHandle,
      archiveIntegrity.bytes,
      entry,
      config.preparation,
    );
    const integrity = {};
    let entryRows = 0;
    let entryCounty = null;
    for await (const parsed of parseCsvReadable(readable, {
      expectedHeader: POINTMATCH_SOURCE_HEADER,
      encoding: config.source.csv_encoding,
      sourceLabel: entry.sourceLabel,
      integrity,
      maxBytes: entry.uncompressedBytes,
    })) {
      entryRows += 1;
      sourceRows += 1;
      if (!Number.isSafeInteger(sourceRows) || sourceRows > config.source.expected_rows) {
        fail("SOURCE_ROW_COUNT_MISMATCH");
      }
      const converted = canonicalDerivedRow(
        rowObject(parsed.fields),
        config,
        { source: entry.sourceLabel, record: parsed.recordNumber },
      );
      if (entryCounty === null) entryCounty = converted.countyFips;
      else if (entryCounty !== converted.countyFips) {
        fail("SOURCE_COUNTY_FILE_MIXED", { source: entry.sourceLabel, record: parsed.recordNumber, field: "COUNTYID" });
      }
      currentChunk.push(converted);
      if (currentChunk.length >= config.preparation.max_records_per_chunk) await flushChunk();
    }
    if (entryRows < 1 || entryCounty === null) fail("SOURCE_COUNTY_FILE_EMPTY", { source: entry.sourceLabel });
    if (integrity.bytes !== entry.uncompressedBytes || integrity.crc32 !== entry.crc32) {
      fail("ZIP_ENTRY_INTEGRITY_MISMATCH", { source: entry.sourceLabel });
    }
    if (countySet.has(entryCounty)) fail("SOURCE_COUNTY_FILE_DUPLICATE", { source: entry.sourceLabel });
    countySet.add(entryCounty);
  }
  await flushChunk();
  if (sourceRows !== config.source.expected_rows) fail("SOURCE_ROW_COUNT_MISMATCH");
  if (countySet.size !== 67 || COUNTY_FIPS.some((county) => !countySet.has(county))) {
    fail("SOURCE_COUNTY_SET_INCOMPLETE");
  }
  if (chunkPaths.length < 1) fail("SOURCE_DATASET_EMPTY");
  const merged = await mergeChunks(chunkPaths, path.join(tempDirectory, DERIVED_FILENAME));
  if (
    merged.derivedRows + merged.duplicateRowsCollapsed + merged.conflictRowsQuarantined !== sourceRows
  ) {
    fail("PREPARATION_COUNT_RECONCILIATION_FAILED");
  }
  await rm(chunkDirectory, { recursive: true, force: false });
  return {
    sourceRows,
    csvFiles: csvEntries.length,
    totalUncompressedBytes,
    ...merged,
  };
}

function canonicalProvenance(config, configIntegrity, archiveIntegrity, prepared) {
  return `${JSON.stringify({
    schema_version: POINTMATCH_PREP_PROVENANCE_SCHEMA,
    dataset_version: config.dataset_version,
    prepared_at: config.prepared_at,
    source: {
      label: config.source.label,
      authority: config.source.authority,
      url: config.source.url,
      release_date: config.source.release_date,
      release_date_status: config.source.release_date_status,
      retrieved_at: config.source.retrieved_at,
      release_evidence_id: config.source.release_evidence_id,
      terms_evidence_id: config.source.terms_evidence_id,
      content_sha256: archiveIntegrity.sha256,
      bytes: archiveIntegrity.bytes,
      rows: prepared.sourceRows,
      csv_files: prepared.csvFiles,
      uncompressed_csv_bytes: prepared.totalUncompressedBytes,
      effective_date: config.source.effective_date,
      common_header_sha256: createHash("sha256").update(POINTMATCH_SOURCE_HEADER.join(","), "utf8").digest("hex"),
    },
    preparation: {
      preparation_evidence_id: config.preparation.preparation_evidence_id,
      config_sha256: configIntegrity.sha256,
      derived_csv: {
        filename: DERIVED_FILENAME,
        content_sha256: prepared.sha256,
        bytes: prepared.bytes,
        rows: prepared.derivedRows,
        header_sha256: createHash("sha256").update(POINTMATCH_DERIVED_HEADER.join(","), "utf8").digest("hex"),
      },
      duplicate_groups_collapsed: prepared.duplicateGroupsCollapsed,
      duplicate_rows_collapsed: prepared.duplicateRowsCollapsed,
      conflict_groups_quarantined: prepared.conflictGroupsQuarantined,
      conflict_rows_quarantined: prepared.conflictRowsQuarantined,
      unit_specific_rows: prepared.unitSpecificRows,
      primary_rows: prepared.primaryRows,
      normalized_conflict_policy: "OMIT_ENTIRE_GROUP_NO_RAW_QUARANTINE",
      normalization_semantics: "normalizedAddressKey",
      match_status: "EXACT",
      pending_effective_date: null,
      special_case_code: null,
      region: "FL",
    },
  })}\n`;
}

async function verifySourceUnchanged(initial, config) {
  const final = await digestPrivateFile(initial.path, {
    code: "SOURCE_PATH_NOT_PRIVATE",
    maxBytes: config.preparation.max_archive_bytes,
  });
  if (
    final.bytes !== initial.bytes || final.sha256 !== initial.sha256 || final.mtimeMs !== initial.mtimeMs
  ) {
    fail("SOURCE_CHANGED");
  }
}

function expectedProvenanceKeys(provenance) {
  requireExactKeys(
    provenance,
    ["schema_version", "dataset_version", "prepared_at", "source", "preparation"],
    "PROVENANCE_INVALID",
  );
  requireExactKeys(provenance.source, [
    "label", "authority", "url", "release_date", "retrieved_at", "release_evidence_id",
    "release_date_status", "terms_evidence_id", "content_sha256", "bytes", "rows", "csv_files",
    "uncompressed_csv_bytes", "effective_date", "common_header_sha256",
  ], "PROVENANCE_INVALID");
  requireExactKeys(provenance.preparation, [
    "preparation_evidence_id", "config_sha256", "derived_csv", "duplicate_groups_collapsed",
    "duplicate_rows_collapsed", "conflict_groups_quarantined", "conflict_rows_quarantined",
    "unit_specific_rows", "primary_rows", "normalized_conflict_policy",
    "normalization_semantics", "match_status", "pending_effective_date", "special_case_code", "region",
  ], "PROVENANCE_INVALID");
  requireExactKeys(
    provenance.preparation.derived_csv,
    ["filename", "content_sha256", "bytes", "rows", "header_sha256"],
    "PROVENANCE_INVALID",
  );
}

async function validateDerivedCsv(bundleDir, provenance) {
  const derivedPath = await verifyPrivateFilesystemPath(path.join(bundleDir, DERIVED_FILENAME), {
    code: "BUNDLE_PATH_NOT_PRIVATE",
    expected: "FILE",
  });
  const expected = provenance.preparation.derived_csv;
  if (
    expected.filename !== DERIVED_FILENAME || !SHA256_HEX.test(expected.content_sha256) ||
    !Number.isSafeInteger(expected.bytes) || expected.bytes < 1 ||
    !Number.isSafeInteger(expected.rows) || expected.rows < 1
  ) {
    fail("PROVENANCE_INVALID");
  }
  const integrity = {};
  let rows = 0;
  let previousSortKey = "";
  const readable = createReadStream(derivedPath);
  for await (const parsed of parseCsvReadable(readable, {
    expectedHeader: POINTMATCH_DERIVED_HEADER,
    encoding: "utf-8",
    sourceLabel: "derived-csv",
    integrity,
    maxBytes: MAX_TOTAL_UNCOMPRESSED_BYTES,
  })) {
    rows += 1;
    const row = Object.fromEntries(POINTMATCH_DERIVED_HEADER.map((name, index) => [name, parsed.fields[index]]));
    if (
      row.region !== "FL" || row.match_status !== "EXACT" ||
      row.pending_effective_date !== "" || row.special_case_code !== "" ||
      !ZIP5.test(row.zip5) || !COUNTY_FIPS_SET.has(row.county_fips)
    ) {
      fail("DERIVED_ROW_INVALID", { source: "derived-csv", record: parsed.recordNumber });
    }
    const unit = row.lookup_scope === "UNIT" && row.unit_policy === "UNIT_SPECIFIC" && row.address_line_2 !== "";
    const primary = row.lookup_scope === "PRIMARY" && row.unit_policy === "NOT_JURISDICTION_DEPENDENT" && row.address_line_2 === "";
    if (!unit && !primary) fail("DERIVED_UNIT_SEMANTICS_INVALID", { source: "derived-csv", record: parsed.recordNumber });
    const normalized = normalizedAddressKey({
      address_line_1: row.address_line_1,
      address_line_2: row.address_line_2,
      locality: row.locality,
      administrative_district_level_1: "FL",
      postal_code: row.zip5,
    }, { includeUnit: unit });
    const sortKey = `${row.zip5}\0${normalized}`;
    if (sortKey <= previousSortKey) fail("DERIVED_SORT_OR_DUPLICATE_INVALID", { source: "derived-csv", record: parsed.recordNumber });
    previousSortKey = sortKey;
  }
  const digest = await digestPrivateFile(derivedPath, {
    code: "BUNDLE_PATH_NOT_PRIVATE",
    maxBytes: MAX_TOTAL_UNCOMPRESSED_BYTES,
  });
  if (rows !== expected.rows || digest.bytes !== expected.bytes || digest.sha256 !== expected.content_sha256) {
    fail("DERIVED_BINDING_MISMATCH");
  }
  return rows;
}

export async function validatePreparedPointMatchBundle(bundleDir) {
  const resolvedBundle = await verifyPrivateFilesystemPath(bundleDir, {
    code: "BUNDLE_PATH_NOT_PRIVATE",
    expected: "DIRECTORY",
  });
  const files = (await readdir(resolvedBundle, { withFileTypes: true }))
    .map((entry) => ({ name: entry.name, file: entry.isFile() }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (
    files.length !== 2 || files.some((entry) => !entry.file) ||
    files[0].name !== DERIVED_FILENAME || files[1].name !== PROVENANCE_FILENAME
  ) {
    fail("BUNDLE_LAYOUT_INVALID");
  }
  let raw;
  let provenance;
  try {
    const provenancePath = await verifyPrivateFilesystemPath(
      path.join(resolvedBundle, PROVENANCE_FILENAME),
      { code: "BUNDLE_PATH_NOT_PRIVATE", expected: "FILE" },
    );
    const provenanceInfo = await lstat(provenancePath);
    if (provenanceInfo.size < 1 || provenanceInfo.size > MAX_CONFIG_BYTES) fail("PROVENANCE_INVALID");
    raw = await readFile(provenancePath, "utf8");
    provenance = JSON.parse(raw);
  } catch (error) {
    if (error instanceof PointMatchSourcePrepError) throw error;
    fail("PROVENANCE_INVALID");
  }
  if (`${JSON.stringify(provenance)}\n` !== raw) fail("PROVENANCE_NOT_CANONICAL");
  expectedProvenanceKeys(provenance);
  const source = provenance.source;
  const prep = provenance.preparation;
  const derived = prep.derived_csv;
  if (
    provenance.schema_version !== POINTMATCH_PREP_PROVENANCE_SCHEMA ||
    !VERSION.test(provenance.dataset_version) || !RFC3339_UTC.test(provenance.prepared_at) ||
    !SAFE_LABEL.test(source.label) || typeof source.authority !== "string" ||
    source.authority.length < 1 || source.authority.length > 256 || !SOURCE_URL.test(source.url) ||
    !RFC3339_UTC.test(source.retrieved_at) ||
    !SAFE_LABEL.test(source.release_evidence_id) || !SAFE_LABEL.test(source.terms_evidence_id) ||
    !SHA256_HEX.test(source.content_sha256) || !Number.isSafeInteger(source.bytes) || source.bytes < 1 ||
    !Number.isSafeInteger(source.rows) || source.rows < 1 || source.csv_files !== 67 ||
    !Number.isSafeInteger(source.uncompressed_csv_bytes) || source.uncompressed_csv_bytes < 1 ||
    !DATE.test(source.effective_date) ||
    source.common_header_sha256 !== createHash("sha256").update(POINTMATCH_SOURCE_HEADER.join(","), "utf8").digest("hex") ||
    !SAFE_LABEL.test(prep.preparation_evidence_id) || !SHA256_HEX.test(prep.config_sha256) ||
    derived.filename !== DERIVED_FILENAME || !SHA256_HEX.test(derived.content_sha256) ||
    !Number.isSafeInteger(derived.bytes) || derived.bytes < 1 ||
    !Number.isSafeInteger(derived.rows) || derived.rows < 1 ||
    derived.header_sha256 !== createHash("sha256").update(POINTMATCH_DERIVED_HEADER.join(","), "utf8").digest("hex")
  ) {
    fail("PROVENANCE_INVALID");
  }
  let provenanceUrl;
  try {
    provenanceUrl = new URL(source.url);
  } catch {
    fail("PROVENANCE_INVALID");
  }
  if (provenanceUrl.username || provenanceUrl.password || provenanceUrl.hash || provenanceUrl.port) {
    fail("PROVENANCE_INVALID");
  }
  const preparedAt = exactUtcTimestamp(provenance.prepared_at, "PROVENANCE_INVALID", "prepared_at");
  let releaseDate = null;
  if (source.release_date_status === "STATED_BY_SOURCE") {
    releaseDate = exactUtcDate(source.release_date, "PROVENANCE_INVALID", "release_date");
  } else if (source.release_date_status !== "NOT_STATED_BY_SOURCE" || source.release_date !== null) {
    fail("PROVENANCE_INVALID");
  }
  const retrievedAt = exactUtcTimestamp(source.retrieved_at, "PROVENANCE_INVALID", "retrieved_at");
  const effectiveDate = exactUtcDate(source.effective_date, "PROVENANCE_INVALID", "effective_date");
  if (
    preparedAt < retrievedAt ||
    (releaseDate !== null && (retrievedAt < releaseDate || effectiveDate < releaseDate))
  ) {
    fail("PROVENANCE_INVALID");
  }
  const rows = await validateDerivedCsv(resolvedBundle, provenance);
  for (const field of [
    "duplicate_groups_collapsed", "duplicate_rows_collapsed", "conflict_groups_quarantined",
    "conflict_rows_quarantined", "unit_specific_rows", "primary_rows",
  ]) {
    if (!Number.isSafeInteger(prep[field]) || prep[field] < 0) fail("PROVENANCE_INVALID");
  }
  if (
    prep.unit_specific_rows + prep.primary_rows !== rows ||
    rows + prep.duplicate_rows_collapsed + prep.conflict_rows_quarantined !== provenance.source.rows ||
    provenance.source.csv_files !== 67 || provenance.source.effective_date.length !== 10 ||
    prep.normalized_conflict_policy !== "OMIT_ENTIRE_GROUP_NO_RAW_QUARANTINE" ||
    prep.normalization_semantics !== "normalizedAddressKey" || prep.match_status !== "EXACT" ||
    prep.pending_effective_date !== null || prep.special_case_code !== null || prep.region !== "FL"
  ) {
    fail("PROVENANCE_INVALID");
  }
  return {
    sourceRows: provenance.source.rows,
    derivedRows: rows,
    duplicateRowsCollapsed: prep.duplicate_rows_collapsed,
    conflictRowsQuarantined: prep.conflict_rows_quarantined,
  };
}

export async function preparePointMatchSource({ configPath, outputDir, __testHooks = null }) {
  const configIntegrity = await safeReadConfig(configPath);
  const { config } = configIntegrity;
  const testHooks = validatedTestHooks(__testHooks);
  const resolvedOutput = await verifyPrivateFilesystemPath(outputDir, {
    code: "OUTPUT_PATH_NOT_PRIVATE",
    expected: "MISSING",
  });
  const archivePath = path.resolve(path.dirname(configIntegrity.path), config.source.path);
  let tempDirectory = null;
  let stagedArchive = null;
  try {
    tempDirectory = await createPrivateTempDirectory(resolvedOutput);
    stagedArchive = await stageBoundArchive({ config, sourcePath: archivePath, tempDirectory });
    await invokeTestHook(testHooks, "afterArchiveStaged");
    const prepared = await prepareArchive({
      config,
      archiveHandle: stagedArchive.handle,
      archiveIntegrity: stagedArchive,
      tempDirectory,
    });
    await invokeTestHook(testHooks, "afterArchivePrepared");
    await discardStagedArchive(stagedArchive);
    const archiveIntegrity = stagedArchive;
    stagedArchive = null;
    const provenance = canonicalProvenance(config, configIntegrity, archiveIntegrity, prepared);
    const provenancePath = path.join(tempDirectory, PROVENANCE_FILENAME);
    const provenanceHandle = await open(provenancePath, "wx");
    await provenanceHandle.writeFile(provenance, "utf8");
    await provenanceHandle.close();
    await validatePreparedPointMatchBundle(tempDirectory);
    await verifySourceUnchanged(archiveIntegrity, config);
    await verifyConfigUnchanged(configIntegrity);
    await verifyPrivateFilesystemPath(configIntegrity.path, { code: "CONFIG_PATH_CHANGED", expected: "FILE" });
    await verifyPrivateFilesystemPath(archiveIntegrity.path, { code: "SOURCE_PATH_CHANGED", expected: "FILE" });
    await verifyPrivateFilesystemPath(path.dirname(resolvedOutput), { code: "OUTPUT_PATH_CHANGED", expected: "DIRECTORY" });
    await verifyPrivateFilesystemPath(tempDirectory, { code: "OUTPUT_PATH_CHANGED", expected: "DIRECTORY" });
    await verifyPrivateFilesystemPath(resolvedOutput, { code: "OUTPUT_PATH_CHANGED", expected: "MISSING" });
    await verifyFinalBundleLayout(tempDirectory, "OUTPUT_PATH_CHANGED");
    await rename(tempDirectory, resolvedOutput);
    tempDirectory = null;
    return {
      sourceRows: prepared.sourceRows,
      derivedRows: prepared.derivedRows,
      duplicateRowsCollapsed: prepared.duplicateRowsCollapsed,
      conflictRowsQuarantined: prepared.conflictRowsQuarantined,
    };
  } finally {
    if (stagedArchive?.handle !== null && stagedArchive?.handle !== undefined) {
      try { await stagedArchive.handle.close(); } catch { /* best effort before bounded cleanup */ }
    }
    if (tempDirectory !== null) {
      try {
        const verified = await verifyPrivateFilesystemPath(tempDirectory, {
          code: "OUTPUT_CLEANUP_PATH_INVALID",
          expected: "DIRECTORY",
        });
        await rm(verified, { recursive: true, force: false });
      } catch {
        // Fail closed without widening cleanup scope.
      }
    }
  }
}
