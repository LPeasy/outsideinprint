import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPrivateBundle,
  FloridaTaxImportError,
  validatePrivateBundle,
} from "../tools/lib/florida-tax-importer.mjs";
import {
  canonicalFloridaRateTable,
  canonicalPointMatchIndex,
  normalizedAddressKey,
} from "../src/florida-tax.js";
import { hmacSha256Hex } from "../src/crypto.js";

const COUNTY_FIPS = Array.from(
  { length: 67 },
  (_, index) => `12${String((index * 2) + 1).padStart(3, "0")}`,
);
const POINTMATCH_HEADER = [
  "fixture_primary", "fixture_unit", "fixture_city", "fixture_state", "fixture_zip5",
  "fixture_county_fips", "fixture_match", "fixture_pending", "fixture_special",
  "fixture_unit_policy", "fixture_lookup_scope",
];
const RATE_HEADER = ["fixture_county_fips", "fixture_state_rate", "fixture_surtax", "fixture_combined"];
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIRECTORY = path.resolve(TEST_DIRECTORY, "..");
const SITE_DIRECTORY = path.resolve(WORKER_DIRECTORY, "../..");

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceBinding(raw, label, relativePath, rows) {
  return {
    label,
    path: relativePath,
    expected_sha256: sha256(raw),
    expected_bytes: Buffer.byteLength(raw, "utf8"),
    expected_rows: rows,
  };
}

function fictionalPointMatchCsv(rows = null) {
  const records = rows || [
    [
      "999999 FIXTURE ONLY ROAD", "", "FICTIONVILLE", "Florida", "32000", "12001",
      "E", "", "", "N", "BASE",
    ],
    [
      "888888 SYNTHETIC AVENUE", "UNIT 7", "EXAMPLE BOROUGH", "Florida", "32001", "12003",
      "E", "", "", "U", "UNIT",
    ],
    [
      "777777 TEST CASE BOULEVARD", "", "MOCK CITY", "Florida", "32001", "12003",
      "N", "2026-05-01", "PENDING_REVIEW", "N", "BASE",
    ],
  ];
  return `${POINTMATCH_HEADER.join(",")}\n${records.map((row) => row.join(",")).join("\n")}\n`;
}

function fictionalRateCsv({ omitLast = false } = {}) {
  const rows = COUNTY_FIPS.map((fips, index) => {
    const surtax = (index % 3) * 25;
    return [fips, 600, surtax, 600 + surtax].join(",");
  });
  if (omitLast) rows.pop();
  return `${RATE_HEADER.join(",")}\n${rows.join("\n")}\n`;
}

function configFor(pointMatchRaw, rateRaw) {
  return {
    schema_version: "oip-florida-tax-import-config-v1",
    dataset: {
      version: "fictional-pointmatch-2026-a",
      schema_version: "oip-pointmatch-hmac-v1",
      shard_prefix: "pointmatch",
      effective_from: "2026-01-01",
      effective_through: "2026-12-31",
      stale_after: "2026-06-30",
      imported_at: "2026-01-02T12:30:00Z",
      source: {
        authority: "Fictional Test Authority",
        url: "https://example.invalid/fictional-pointmatch-release",
        release_date: "2026-01-01",
        release_date_status: "STATED_BY_SOURCE",
        retrieved_at: "2026-01-02T12:00:00Z",
        release_evidence_id: "TEST-RELEASE-POINTMATCH-001",
        terms_evidence_id: "TEST-TERMS-POINTMATCH-001",
        preparation_evidence_id: "TEST-PREP-POINTMATCH-001",
      },
      header: POINTMATCH_HEADER,
      inputs: [sourceBinding(pointMatchRaw, "fictional-pointmatch-part-1", "pointmatch.csv", 3)],
      fields: {
        address_line_1: { column: "fixture_primary" },
        address_line_2: { column: "fixture_unit" },
        locality: { column: "fixture_city" },
        region: { column: "fixture_state" },
        zip5: { column: "fixture_zip5" },
        county_fips: { column: "fixture_county_fips" },
        match_status: { column: "fixture_match" },
        pending_effective_date: { column: "fixture_pending" },
        special_case_code: { column: "fixture_special" },
        unit_policy: { column: "fixture_unit_policy" },
        lookup_scope: { column: "fixture_lookup_scope" },
      },
      value_maps: {
        region: { Florida: "FL" },
        match_status: { E: "EXACT", N: "NONEXACT" },
        unit_policy: { N: "NOT_JURISDICTION_DEPENDENT", U: "UNIT_SPECIFIC" },
        lookup_scope: { BASE: "PRIMARY", UNIT: "UNIT" },
      },
      limits: {
        max_input_bytes: 1024 * 1024,
        max_records_per_shard: 1000,
        max_shard_bytes: 1024 * 1024,
      },
    },
    rates: {
      version: "fictional-rates-2026-a",
      effective_from: "2026-01-01",
      effective_through: "2026-12-31",
      stale_after: "2026-06-30",
      imported_at: "2026-01-02T12:30:00Z",
      source: {
        authority: "Fictional Test Authority",
        url: "https://example.invalid/fictional-rate-release",
        release_date: "2026-01-01",
        release_date_status: "STATED_BY_SOURCE",
        retrieved_at: "2026-01-02T12:15:00Z",
        release_evidence_id: "TEST-RELEASE-RATES-001",
        terms_evidence_id: "TEST-TERMS-RATES-001",
        preparation_evidence_id: "TEST-PREP-RATES-001",
      },
      header: RATE_HEADER,
      input: sourceBinding(rateRaw, "fictional-rate-table", "rates.csv", 67),
      fields: {
        county_fips: { column: "fixture_county_fips" },
        state_rate: { column: "fixture_state_rate" },
        surtax_rate: { column: "fixture_surtax" },
        combined_rate: { column: "fixture_combined" },
      },
      units: {
        state_rate: "BASIS_POINTS",
        surtax_rate: "BASIS_POINTS",
        combined_rate: "BASIS_POINTS",
      },
      max_input_bytes: 1024 * 1024,
    },
  };
}

async function writeFixture(root, { pointMatchRaw = fictionalPointMatchCsv(), rateRaw = fictionalRateCsv(), mutateConfig } = {}) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "pointmatch.csv"), pointMatchRaw, "utf8");
  await writeFile(path.join(root, "rates.csv"), rateRaw, "utf8");
  const config = configFor(pointMatchRaw, rateRaw);
  if (typeof mutateConfig === "function") mutateConfig(config);
  const configPath = path.join(root, "config.json");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { config, configPath };
}

async function allFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await allFiles(root, child));
    else files.push(child.replaceAll("\\", "/"));
  }
  return files;
}

async function assertBundlesEqual(left, right) {
  const leftFiles = await allFiles(left);
  const rightFiles = await allFiles(right);
  assert.deepEqual(leftFiles, rightFiles);
  for (const relative of leftFiles) {
    assert.deepEqual(await readFile(path.join(left, relative)), await readFile(path.join(right, relative)), relative);
  }
}

async function expectClosed(operation, code, outputDir, forbidden = []) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof FloridaTaxImportError);
    assert.equal(error.code, code);
    for (const value of forbidden) assert.equal(error.message.includes(value), false);
    return true;
  });
  await assert.rejects(readFile(path.join(outputDir, "provenance-manifest.json"), "utf8"), { code: "ENOENT" });
}

async function runLocalSqliteImport(bundleDir, databasePath) {
  const wrapper = path.join(SITE_DIRECTORY, "tools", "bin", "generated", "python.cmd");
  const helper = path.join(TEST_DIRECTORY, "helpers", "apply_sqlite_import.py");
  const argumentsList = [
    helper,
    path.join(WORKER_DIRECTORY, "migrations", "0001_initial.sql"),
    path.join(WORKER_DIRECTORY, "migrations", "0002_physical_checkout.sql"),
    path.join(bundleDir, "d1-import.sql"),
    databasePath,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(wrapper, argumentsList, {
      cwd: SITE_DIRECTORY,
      shell: true,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 64 * 1024) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 64 * 1024) child.kill();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Local SQLite import helper failed (${code}): ${stderr.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error("Local SQLite import helper returned invalid output."));
      }
    });
  });
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

test("private importer emits deterministic resolver-compatible artifacts without raw source values", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-fl-import-test-"));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^oip-fl-import-test-/u);
    await rm(resolved, { recursive: true, force: true });
  });
  const pointMatchRaw = fictionalPointMatchCsv();
  const rateRaw = fictionalRateCsv();
  const { configPath } = await writeFixture(path.join(root, "input"), { pointMatchRaw, rateRaw });
  const secret = randomBytes(48).toString("base64url");
  const first = path.join(root, "bundle-one");
  const second = path.join(root, "bundle-two");

  assert.deepEqual(
    await buildPrivateBundle({ configPath, outputDir: first, secret }),
    { outputDir: first, datasetRows: 3, shardCount: 2, rateRows: 67 },
  );
  await buildPrivateBundle({ configPath, outputDir: second, secret });
  await assertBundlesEqual(first, second);
  assert.deepEqual(await validatePrivateBundle(first), { datasetRows: 3, shardCount: 2, rateRows: 67 });

  const indexRaw = await readFile(
    path.join(first, "pointmatch", "fictional-pointmatch-2026-a", "index.json"),
    "utf8",
  );
  const index = JSON.parse(indexRaw);
  assert.equal(indexRaw, canonicalPointMatchIndex(index));
  assert.deepEqual(index.shards.map((entry) => entry.zip5), ["32000", "32001"]);

  const shardRaw = await readFile(
    path.join(first, "pointmatch", "fictional-pointmatch-2026-a", "zip5", "32000.json"),
    "utf8",
  );
  const shard = JSON.parse(shardRaw);
  const expectedKey = normalizedAddressKey({
    address_line_1: "999999 FIXTURE ONLY ROAD",
    address_line_2: "",
    locality: "FICTIONVILLE",
    administrative_district_level_1: "FL",
    postal_code: "32000",
  }, { includeUnit: false });
  const expectedHmac = await hmacSha256Hex(secret, `oip-pointmatch:v1:${expectedKey}`);
  assert.equal(shard.records[0].address_hmac, expectedHmac);

  const ratesRaw = await readFile(path.join(first, "florida-rates.json"), "utf8");
  const rates = JSON.parse(ratesRaw);
  assert.equal(ratesRaw, canonicalFloridaRateTable(rates.rate_version, rates.rows));
  assert.equal(rates.rows.length, 67);

  const aggregateOutput = (
    await Promise.all((await allFiles(first)).map((relative) => readFile(path.join(first, relative), "utf8")))
  ).join("\n");
  for (const forbidden of [
    "999999 FIXTURE ONLY ROAD",
    "888888 SYNTHETIC AVENUE",
    "FICTIONVILLE",
    "EXAMPLE BOROUGH",
    secret,
  ]) {
    assert.equal(aggregateOutput.includes(forbidden), false);
  }
  await writeFile(path.join(first, "unexpected-private-input.csv"), "fixture-only\n", "utf8");
  await assert.rejects(() => validatePrivateBundle(first), (error) => {
    assert.equal(error.code, "BUNDLE_LAYOUT_INVALID");
    return true;
  });
});

test("private importer preserves explicitly unstated release dates for dataset and rates", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-fl-import-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const fixture = await writeFixture(path.join(root, "input"), {
    mutateConfig: (config) => {
      for (const source of [config.dataset.source, config.rates.source]) {
        source.release_date = null;
        source.release_date_status = "NOT_STATED_BY_SOURCE";
      }
    },
  });
  const secret = randomBytes(48).toString("base64url");
  const first = path.join(root, "bundle-one");
  const second = path.join(root, "bundle-two");

  await buildPrivateBundle({ configPath: fixture.configPath, outputDir: first, secret });
  await buildPrivateBundle({ configPath: fixture.configPath, outputDir: second, secret });
  await assertBundlesEqual(first, second);
  assert.deepEqual(await validatePrivateBundle(first), { datasetRows: 3, shardCount: 2, rateRows: 67 });

  const provenanceRaw = await readFile(path.join(first, "provenance-manifest.json"), "utf8");
  const provenance = JSON.parse(provenanceRaw);
  for (const source of [provenance.dataset.source, provenance.rates.source]) {
    assert.equal(source.release_date, null);
    assert.equal(source.release_date_status, "NOT_STATED_BY_SOURCE");
  }
  assert.equal(provenanceRaw, JSON.stringify(provenance));
});

test("source release-date contract rejects config and bundle status mismatches", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-fl-import-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const cases = [
    {
      label: "dataset-missing-status",
      code: "POINTMATCH_SOURCE_INVALID",
      mutateConfig: (config) => delete config.dataset.source.release_date_status,
    },
    {
      label: "dataset-stated-null",
      code: "POINTMATCH_SOURCE_INVALID",
      mutateConfig: (config) => {
        config.dataset.source.release_date = null;
      },
    },
    {
      label: "dataset-release-after-retrieval",
      code: "POINTMATCH_SOURCE_DATE_ORDER_INVALID",
      mutateConfig: (config) => {
        config.dataset.source.release_date = "2026-01-03";
      },
    },
    {
      label: "rates-not-stated-with-date",
      code: "RATE_SOURCE_INVALID",
      mutateConfig: (config) => {
        config.rates.source.release_date_status = "NOT_STATED_BY_SOURCE";
      },
    },
    {
      label: "rates-release-after-retrieval",
      code: "RATE_SOURCE_DATE_ORDER_INVALID",
      mutateConfig: (config) => {
        config.rates.source.release_date = "2026-01-03";
      },
    },
  ];
  for (const fixtureCase of cases) {
    await t.test(fixtureCase.label, async () => {
      const fixture = await writeFixture(path.join(root, fixtureCase.label), {
        mutateConfig: fixtureCase.mutateConfig,
      });
      const outputDir = path.join(root, `${fixtureCase.label}-bundle`);
      await expectClosed(
        () => buildPrivateBundle({
          configPath: fixture.configPath,
          outputDir,
          secret: randomBytes(48).toString("base64url"),
        }),
        fixtureCase.code,
        outputDir,
      );
    });
  }

  const validFixture = await writeFixture(path.join(root, "valid-input"), {
    mutateConfig: (config) => {
      for (const source of [config.dataset.source, config.rates.source]) {
        source.release_date = null;
        source.release_date_status = "NOT_STATED_BY_SOURCE";
      }
    },
  });
  const bundle = path.join(root, "valid-bundle");
  await buildPrivateBundle({
    configPath: validFixture.configPath,
    outputDir: bundle,
    secret: randomBytes(48).toString("base64url"),
  });
  const provenancePath = path.join(bundle, "provenance-manifest.json");
  const originalRaw = await readFile(provenancePath, "utf8");

  const datasetMismatch = JSON.parse(originalRaw);
  datasetMismatch.dataset.source.release_date_status = "STATED_BY_SOURCE";
  await writeFile(provenancePath, JSON.stringify(datasetMismatch), "utf8");
  await assert.rejects(() => validatePrivateBundle(bundle), (error) => {
    assert.equal(error.code, "BUNDLE_SOURCE_INVALID");
    assert.equal(error.field, "release_date");
    return true;
  });

  const rateMismatch = JSON.parse(originalRaw);
  rateMismatch.rates.source.release_date = "2026-01-01";
  await writeFile(provenancePath, JSON.stringify(rateMismatch), "utf8");
  await assert.rejects(() => validatePrivateBundle(bundle), (error) => {
    assert.equal(error.code, "BUNDLE_SOURCE_INVALID");
    assert.equal(error.field, "release_date");
    return true;
  });
});

test("private importer rejects header drift before producing a bundle", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-fl-import-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const raw = fictionalPointMatchCsv().replace("fixture_primary", "unexpected_primary");
  const { configPath } = await writeFixture(path.join(root, "input"), { pointMatchRaw: raw });
  const outputDir = path.join(root, "bundle");
  await expectClosed(
    () => buildPrivateBundle({ configPath, outputDir, secret: randomBytes(48).toString("base64url") }),
    "CSV_HEADER_MISMATCH",
    outputDir,
    ["999999 FIXTURE ONLY ROAD"],
  );
});

test("generated D1 SQL runs inside a wrapper-owned local SQLite transaction", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Repository-local Python wrapper is Windows-specific.");
    return;
  }
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-fl-import-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const fixture = await writeFixture(path.join(root, "input"));
  const outputDir = path.join(root, "bundle");
  await buildPrivateBundle({
    configPath: fixture.configPath,
    outputDir,
    secret: randomBytes(48).toString("base64url"),
  });
  const sql = await readFile(path.join(outputDir, "d1-import.sql"), "utf8");
  assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/imu);
  assert.deepEqual(
    await runLocalSqliteImport(outputDir, path.join(root, "local.sqlite3")),
    { jurisdiction_manifests: 1, rate_manifests: 1, rate_rows: 67 },
  );
});

test("private importer rejects unsafe primary/unit semantics without logging row values", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-fl-import-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    [
      "999999 FIXTURE ONLY ROAD", "UNIT 9", "FICTIONVILLE", "Florida", "32000", "12001",
      "E", "", "", "N", "BASE",
    ],
  ];
  const raw = fictionalPointMatchCsv(rows);
  const { configPath } = await writeFixture(path.join(root, "input"), {
    pointMatchRaw: raw,
    mutateConfig: (config) => {
      config.dataset.inputs[0].expected_rows = 1;
    },
  });
  const outputDir = path.join(root, "bundle");
  await expectClosed(
    () => buildPrivateBundle({ configPath, outputDir, secret: randomBytes(48).toString("base64url") }),
    "POINTMATCH_UNIT_SEMANTICS_INVALID",
    outputDir,
    ["999999 FIXTURE ONLY ROAD", "UNIT 9"],
  );
});

test("private importer rejects ZIP5 disorder and an incomplete 67-county rate set", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-fl-import-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const unsortedRows = [
    ["888888 SYNTHETIC AVENUE", "", "EXAMPLE BOROUGH", "Florida", "32001", "12003", "E", "", "", "N", "BASE"],
    ["999999 FIXTURE ONLY ROAD", "", "FICTIONVILLE", "Florida", "32000", "12001", "E", "", "", "N", "BASE"],
  ];
  const unsortedRaw = fictionalPointMatchCsv(unsortedRows);
  const firstFixture = await writeFixture(path.join(root, "unsorted-input"), {
    pointMatchRaw: unsortedRaw,
    mutateConfig: (config) => {
      config.dataset.inputs[0].expected_rows = 2;
    },
  });
  const firstOutput = path.join(root, "unsorted-bundle");
  await expectClosed(
    () => buildPrivateBundle({
      configPath: firstFixture.configPath,
      outputDir: firstOutput,
      secret: randomBytes(48).toString("base64url"),
    }),
    "POINTMATCH_INPUT_NOT_ZIP_SORTED",
    firstOutput,
  );

  const shortRates = fictionalRateCsv({ omitLast: true });
  const secondFixture = await writeFixture(path.join(root, "short-rate-input"), {
    rateRaw: shortRates,
    mutateConfig: (config) => {
      config.rates.input.expected_rows = 67;
    },
  });
  const secondOutput = path.join(root, "short-rate-bundle");
  await expectClosed(
    () => buildPrivateBundle({
      configPath: secondFixture.configPath,
      outputDir: secondOutput,
      secret: randomBytes(48).toString("base64url"),
    }),
    "RATE_COUNTY_SET_INCOMPLETE",
    secondOutput,
  );
});

test("bundle validator detects shard changes and build rejects a rebound source", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-fl-import-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const fixture = await writeFixture(path.join(root, "input"));
  const outputDir = path.join(root, "bundle");
  await buildPrivateBundle({
    configPath: fixture.configPath,
    outputDir,
    secret: randomBytes(48).toString("base64url"),
  });
  const shardPath = path.join(
    outputDir,
    "pointmatch",
    "fictional-pointmatch-2026-a",
    "zip5",
    "32000.json",
  );
  await writeFile(shardPath, `${await readFile(shardPath, "utf8")} `, "utf8");
  await assert.rejects(() => validatePrivateBundle(outputDir), (error) => {
    assert.equal(error.code, "BUNDLE_SHARD_DIGEST_MISMATCH");
    return true;
  });

  const reboundRoot = path.join(root, "rebound-input");
  const rebound = await writeFixture(reboundRoot);
  await writeFile(path.join(reboundRoot, "pointmatch.csv"), `${fictionalPointMatchCsv()}\n`, "utf8");
  const reboundOutput = path.join(root, "rebound-bundle");
  await expectClosed(
    () => buildPrivateBundle({
      configPath: rebound.configPath,
      outputDir: reboundOutput,
      secret: randomBytes(48).toString("base64url"),
    }),
    "POINTMATCH_SOURCE_BINDING_MISMATCH",
    reboundOutput,
  );
});

test("private path checks reject symlink or junction ancestors for config, input, output, and bundle", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oip-fl-import-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const inputRoot = path.join(root, "actual-input");
  const fixture = await writeFixture(inputRoot);
  const inputAlias = path.join(root, "input-alias");
  if (!await createDirectoryAlias(inputRoot, inputAlias, t)) {
    t.skip("Directory symlink/junction creation is unavailable on this platform.");
    return;
  }
  const secret = randomBytes(48).toString("base64url");

  const configAliasOutput = path.join(root, "config-alias-bundle");
  await expectClosed(
    () => buildPrivateBundle({
      configPath: path.join(inputAlias, "config.json"),
      outputDir: configAliasOutput,
      secret,
    }),
    "CONFIG_PATH_NOT_PRIVATE",
    configAliasOutput,
  );

  const mappedConfig = structuredClone(fixture.config);
  mappedConfig.dataset.inputs[0].path = path.join(inputAlias, "pointmatch.csv");
  mappedConfig.rates.input.path = path.join(inputRoot, "rates.csv");
  const mappedConfigPath = path.join(root, "mapped-config.json");
  await writeFile(mappedConfigPath, `${JSON.stringify(mappedConfig, null, 2)}\n`, "utf8");
  const inputAliasOutput = path.join(root, "input-alias-bundle");
  await expectClosed(
    () => buildPrivateBundle({ configPath: mappedConfigPath, outputDir: inputAliasOutput, secret }),
    "POINTMATCH_SOURCE_PATH_NOT_PRIVATE",
    inputAliasOutput,
  );

  const actualOutputParent = path.join(root, "actual-output-parent");
  await mkdir(actualOutputParent);
  const outputParentAlias = path.join(root, "output-parent-alias");
  assert.equal(await createDirectoryAlias(actualOutputParent, outputParentAlias, t), true);
  const aliasedOutput = path.join(outputParentAlias, "bundle");
  await expectClosed(
    () => buildPrivateBundle({ configPath: fixture.configPath, outputDir: aliasedOutput, secret }),
    "OUTPUT_PATH_NOT_PRIVATE",
    aliasedOutput,
  );

  const bundle = path.join(root, "actual-bundle");
  await buildPrivateBundle({ configPath: fixture.configPath, outputDir: bundle, secret });
  const bundleAlias = path.join(root, "bundle-alias");
  assert.equal(await createDirectoryAlias(bundle, bundleAlias, t), true);
  await assert.rejects(() => validatePrivateBundle(bundleAlias), (error) => {
    assert.equal(error.code, "BUNDLE_PATH_NOT_PRIVATE");
    return true;
  });
});
