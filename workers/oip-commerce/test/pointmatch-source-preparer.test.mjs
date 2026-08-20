import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  POINTMATCH_DERIVED_HEADER,
  POINTMATCH_PREP_CONFIG_SCHEMA,
  POINTMATCH_SOURCE_HEADER,
  PointMatchSourcePrepError,
  preparePointMatchSource,
  validatePreparedPointMatchBundle,
} from "../tools/lib/pointmatch-source-preparer.mjs";

const COUNTY_IDS = Array.from(
  { length: 67 },
  (_, index) => String((index * 2) + 1).padStart(3, "0"),
);
const EFFECTIVE_SOURCE_VALUE = "01/01/2025";

function crcTable() {
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

const CRC_TABLE = crcTable();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function fictionalZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.isBuffer(entry.raw) ? entry.raw : Buffer.from(entry.raw, "utf8");
    const compressed = deflateRawSync(raw, { level: 9 });
    const checksum = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function sourceRow({
  number,
  streetName,
  streetSuffix = "ROAD",
  unitType = "",
  unitNumber = "",
  city,
  zip5,
  countyId,
  effective = EFFECTIVE_SOURCE_VALUE,
}) {
  return [
    number, "", streetName, streetSuffix, "", unitType, unitNumber, city, zip5, "0000",
    "0", "0", `FEATURE-${countyId}`, countyId, `COUNTY-${countyId}`, `PLACE-${countyId}`,
    "", "", effective, "",
  ];
}

function csvFor(rows, header = POINTMATCH_SOURCE_HEADER) {
  return `${header.join(",")}\r\n${rows.map((row) => row.join(",")).join("\r\n")}\r\n`;
}

function fictionalRelease({ headerForCounty = null, mutateRows = null, omitLastCounty = false } = {}) {
  const entries = [];
  const allRows = [];
  const countyIds = omitLastCounty ? COUNTY_IDS.slice(0, -1) : COUNTY_IDS;
  for (let index = 0; index < countyIds.length; index += 1) {
    const countyId = countyIds[index];
    const rows = [sourceRow({
      number: String(1000 + index),
      streetName: `FIXTURE${countyId}`,
      unitType: index === 3 ? "UNIT" : "",
      unitNumber: index === 3 ? "7" : "",
      city: `TESTCITY${countyId}`,
      zip5: String(32000 + index),
      countyId,
    })];
    if (index === 0) {
      rows.push(sourceRow({
        number: "1000",
        streetName: "FIXTURE001",
        streetSuffix: "RD",
        city: "TESTCITY001",
        zip5: "32000",
        countyId,
      }));
    }
    if (index === 1 || index === 2) {
      rows.push(sourceRow({
        number: "999",
        streetName: "AMBIGUOUS",
        city: "CONFLICTCITY",
        zip5: "32999",
        countyId,
      }));
    }
    if (typeof mutateRows === "function") mutateRows(rows, index);
    allRows.push(...rows);
    const header = index === headerForCounty ? [...POINTMATCH_SOURCE_HEADER.slice(0, -1), "DRIFT"] : POINTMATCH_SOURCE_HEADER;
    entries.push({ name: `county-${countyId}.csv`, raw: csvFor(rows, header) });
  }
  entries.push({ name: "supplemental-statewide.zip", raw: "fictional supplemental payload" });
  return { archive: fictionalZip(entries), rows: allRows.length };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function configFor(archive, rows) {
  return {
    schema_version: POINTMATCH_PREP_CONFIG_SCHEMA,
    dataset_version: "fictional-pointmatch-prep-a",
    prepared_at: "2026-01-03T12:00:00Z",
    source: {
      label: "fictional-pointmatch-release",
      path: "release.zip",
      expected_sha256: sha256(archive),
      expected_bytes: archive.length,
      expected_rows: rows,
      effective_date: "2026-01-01",
      effdate_format: "MM/DD/YYYY",
      csv_encoding: "utf-8",
      authority: "Fictional Test Authority",
      url: "https://example.invalid/fictional-pointmatch",
      release_date: null,
      release_date_status: "NOT_STATED_BY_SOURCE",
      retrieved_at: "2026-01-02T12:00:00Z",
      release_evidence_id: "TEST-RELEASE-001",
      terms_evidence_id: "TEST-TERMS-001",
    },
    preparation: {
      preparation_evidence_id: "TEST-PREPARATION-001",
      max_archive_bytes: 1024 * 1024,
      max_entry_uncompressed_bytes: 1024 * 1024,
      max_total_uncompressed_bytes: 8 * 1024 * 1024,
      max_records_per_chunk: 7,
      max_chunks: 16,
    },
  };
}

async function writeFixture(root, release = fictionalRelease(), mutateConfig = null) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "release.zip"), release.archive);
  const config = configFor(release.archive, release.rows);
  if (typeof mutateConfig === "function") mutateConfig(config);
  const configPath = path.join(root, "config.json");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { configPath, config, release };
}

async function allFiles(root) {
  return (await readdir(root)).sort();
}

async function expectClosed(operation, code, outputDir, forbidden = []) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof PointMatchSourcePrepError);
    assert.equal(error.code, code);
    for (const value of forbidden) assert.equal(error.message.includes(value), false);
    return true;
  });
  await assert.rejects(readFile(path.join(outputDir, "pointmatch-prep-provenance.json"), "utf8"), { code: "ENOENT" });
}

async function createDirectoryAlias(target, alias, t) {
  try {
    await symlink(target, alias, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    if (["EACCES", "EPERM", "ENOSYS", "ENOTSUP"].includes(error?.code)) {
      t.diagnostic(`Directory alias test unavailable: ${error.code}`);
      return false;
    }
    throw error;
  }
}

test("PointMatch source prep deterministically composes, sorts, collapses, and quarantines", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-pointmatch-prep-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const fixture = await writeFixture(path.join(root, "input"));
  const first = path.join(root, "bundle-one");
  const second = path.join(root, "bundle-two");

  const expected = {
    sourceRows: 70,
    derivedRows: 67,
    duplicateRowsCollapsed: 1,
    conflictRowsQuarantined: 2,
  };
  assert.deepEqual(await preparePointMatchSource({ configPath: fixture.configPath, outputDir: first }), expected);
  assert.deepEqual(await preparePointMatchSource({ configPath: fixture.configPath, outputDir: second }), expected);
  assert.deepEqual(await validatePreparedPointMatchBundle(first), expected);
  assert.deepEqual(await allFiles(first), ["pointmatch-derived.csv", "pointmatch-prep-provenance.json"]);
  for (const filename of await allFiles(first)) {
    assert.deepEqual(await readFile(path.join(first, filename)), await readFile(path.join(second, filename)));
  }

  const derived = await readFile(path.join(first, "pointmatch-derived.csv"), "utf8");
  assert.equal(derived.split("\n")[0], POINTMATCH_DERIVED_HEADER.join(","));
  assert.equal(derived.includes("999 AMBIGUOUS ROAD"), false);
  assert.equal(derived.includes("1003 FIXTURE007 ROAD,UNIT 7"), true);
  const provenanceRaw = await readFile(path.join(first, "pointmatch-prep-provenance.json"), "utf8");
  const provenance = JSON.parse(provenanceRaw);
  assert.equal(provenanceRaw, `${JSON.stringify(provenance)}\n`);
  assert.equal(provenance.preparation.duplicate_groups_collapsed, 1);
  assert.equal(provenance.preparation.conflict_groups_quarantined, 1);
  assert.equal(provenance.preparation.unit_specific_rows, 1);
  for (const forbidden of ["AMBIGUOUS", "FIXTURE001", "TESTCITY001", root]) {
    assert.equal(provenanceRaw.includes(forbidden), false);
  }
});

test("PointMatch source prep cannot consume swap-and-restored archive bytes after binding", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-pointmatch-prep-test-"));
  const original = fictionalRelease();
  const alternate = fictionalRelease({
    mutateRows(rows, index) {
      if (index === 10) rows[0][2] = "SWAPPED021";
    },
  });
  const fixture = await writeFixture(path.join(root, "input"), original);
  const originalPath = path.join(root, "input", "release.zip");
  const heldPath = path.join(root, "input", "release.original.zip");
  const output = path.join(root, "bundle");
  let originalHeld = false;
  t.after(async () => {
    if (originalHeld) {
      await rm(originalPath, { force: true });
      await rename(heldPath, originalPath);
    }
    await rm(root, { recursive: true, force: true });
  });

  const result = await preparePointMatchSource({
    configPath: fixture.configPath,
    outputDir: output,
    __testHooks: {
      async afterArchiveStaged() {
        await rename(originalPath, heldPath);
        originalHeld = true;
        await writeFile(originalPath, alternate.archive);
      },
      async afterArchivePrepared() {
        await rm(originalPath, { force: false });
        await rename(heldPath, originalPath);
        originalHeld = false;
      },
    },
  });

  assert.equal(result.sourceRows, original.rows);
  const derived = await readFile(path.join(output, "pointmatch-derived.csv"), "utf8");
  assert.equal(derived.includes("FIXTURE021"), true);
  assert.equal(derived.includes("SWAPPED021"), false);
  const provenance = JSON.parse(
    await readFile(path.join(output, "pointmatch-prep-provenance.json"), "utf8"),
  );
  assert.equal(provenance.source.content_sha256, sha256(original.archive));
});

test("PointMatch source prep rejects mismatched unit pairs without exposing source values", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-pointmatch-prep-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const release = fictionalRelease({
    mutateRows(rows, index) {
      if (index === 8) {
        rows[0][5] = "UNIT";
        rows[0][6] = "";
      }
    },
  });
  const fixture = await writeFixture(path.join(root, "input"), release);
  const output = path.join(root, "bundle");
  await expectClosed(
    () => preparePointMatchSource({ configPath: fixture.configPath, outputDir: output }),
    "SOURCE_UNIT_PAIR_MISMATCH",
    output,
    ["FIXTURE017", "TESTCITY017"],
  );

  const unknownTypeRelease = fictionalRelease({
    mutateRows(rows, index) {
      if (index === 4) {
        rows[0][5] = "OTHER";
        rows[0][6] = "9";
      }
    },
  });
  const unknownType = await writeFixture(path.join(root, "unknown-type"), unknownTypeRelease);
  const unknownTypeOutput = path.join(root, "unknown-type-output");
  await expectClosed(
    () => preparePointMatchSource({ configPath: unknownType.configPath, outputDir: unknownTypeOutput }),
    "SOURCE_UNIT_TYPE_INVALID",
    unknownTypeOutput,
    ["OTHER", "FIXTURE009", "TESTCITY009"],
  );
});

test("PointMatch source prep binds header, effective value, archive digest, file count, and county set", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-pointmatch-prep-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const drift = await writeFixture(path.join(root, "drift"), fictionalRelease({ headerForCounty: 5 }));
  await expectClosed(
    () => preparePointMatchSource({ configPath: drift.configPath, outputDir: path.join(root, "drift-output") }),
    "CSV_HEADER_MISMATCH",
    path.join(root, "drift-output"),
  );

  const dateRelease = fictionalRelease({
    mutateRows(rows, index) {
      if (index === 6) rows[0][18] = "01/01/2027";
    },
  });
  const date = await writeFixture(path.join(root, "date"), dateRelease);
  await expectClosed(
    () => preparePointMatchSource({ configPath: date.configPath, outputDir: path.join(root, "date-output") }),
    "SOURCE_ADDRESS_EFFECTIVE_DATE_INVALID",
    path.join(root, "date-output"),
    ["01/01/2027"],
  );

  const short = await writeFixture(path.join(root, "short"), fictionalRelease({ omitLastCounty: true }));
  await expectClosed(
    () => preparePointMatchSource({ configPath: short.configPath, outputDir: path.join(root, "short-output") }),
    "SOURCE_CSV_FILE_COUNT_MISMATCH",
    path.join(root, "short-output"),
  );

  const rebound = await writeFixture(path.join(root, "rebound"));
  await writeFile(path.join(root, "rebound", "release.zip"), Buffer.concat([rebound.release.archive, Buffer.from("x")]));
  await expectClosed(
    () => preparePointMatchSource({ configPath: rebound.configPath, outputDir: path.join(root, "rebound-output") }),
    "SOURCE_BINDING_MISMATCH",
    path.join(root, "rebound-output"),
  );

  const corruptRelease = fictionalRelease();
  const corruptArchive = Buffer.from(corruptRelease.archive);
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const centralOffset = corruptArchive.indexOf(centralSignature);
  assert.ok(centralOffset > 0);
  corruptArchive[centralOffset + 16] ^= 0xff;
  const corrupt = await writeFixture(
    path.join(root, "corrupt"),
    { archive: corruptArchive, rows: corruptRelease.rows },
  );
  await expectClosed(
    () => preparePointMatchSource({ configPath: corrupt.configPath, outputDir: path.join(root, "corrupt-output") }),
    "ZIP_ENTRY_INTEGRITY_MISMATCH",
    path.join(root, "corrupt-output"),
  );
});

test("PointMatch bundle validation detects derived changes and unexpected files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-pointmatch-prep-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const fixture = await writeFixture(path.join(root, "input"));
  const first = path.join(root, "bundle-one");
  await preparePointMatchSource({ configPath: fixture.configPath, outputDir: first });
  await writeFile(path.join(first, "pointmatch-derived.csv"), "tampered\n", "utf8");
  await assert.rejects(() => validatePreparedPointMatchBundle(first), (error) => {
    assert.ok(error instanceof PointMatchSourcePrepError);
    assert.equal(error.code, "CSV_HEADER_MISMATCH");
    return true;
  });

  const second = path.join(root, "bundle-two");
  await preparePointMatchSource({ configPath: fixture.configPath, outputDir: second });
  await writeFile(path.join(second, "unexpected.txt"), "fixture only\n", "utf8");
  await assert.rejects(() => validatePreparedPointMatchBundle(second), (error) => {
    assert.equal(error.code, "BUNDLE_LAYOUT_INVALID");
    return true;
  });
});

test("PointMatch source prep rejects repository-visible and aliased private paths", async (t) => {
  const repositoryOutput = path.resolve("workers/oip-commerce/pointmatch-prep-visible-test-output");
  await assert.rejects(
    () => preparePointMatchSource({ configPath: path.resolve("workers/oip-commerce/package.json"), outputDir: repositoryOutput }),
    (error) => {
      assert.equal(error.code, "CONFIG_PATH_NOT_PRIVATE");
      return true;
    },
  );

  const root = await mkdtemp(path.join(os.tmpdir(), "oip-pointmatch-prep-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const input = path.join(root, "actual-input");
  const fixture = await writeFixture(input);
  const alias = path.join(root, "input-alias");
  if (!await createDirectoryAlias(input, alias, t)) {
    t.skip("Directory symlink/junction creation is unavailable on this platform.");
    return;
  }
  const output = path.join(root, "bundle");
  await expectClosed(
    () => preparePointMatchSource({ configPath: path.join(alias, "config.json"), outputDir: output }),
    "CONFIG_PATH_NOT_PRIVATE",
    output,
  );

  const actualOutputParent = path.join(root, "actual-output-parent");
  await mkdir(actualOutputParent);
  const outputAlias = path.join(root, "output-alias");
  assert.equal(await createDirectoryAlias(actualOutputParent, outputAlias, t), true);
  await expectClosed(
    () => preparePointMatchSource({
      configPath: fixture.configPath,
      outputDir: path.join(outputAlias, "bundle"),
    }),
    "OUTPUT_PATH_NOT_PRIVATE",
    path.join(outputAlias, "bundle"),
  );
});
