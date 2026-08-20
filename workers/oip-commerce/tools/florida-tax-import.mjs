#!/usr/bin/env node

import path from "node:path";

import {
  buildPrivateBundle,
  digestFile,
  FloridaTaxImportError,
  validatePrivateBundle,
} from "./lib/florida-tax-importer.mjs";

const HELP = `Private Florida jurisdiction/rate bundle tool

Usage:
  florida-tax-import.mjs digest --input <private-source.csv>
  florida-tax-import.mjs build --config <private-config.json> --output <new-private-directory>
  florida-tax-import.mjs validate --bundle <private-directory>

Build reads ADDRESS_LOOKUP_HMAC_SECRET from the process environment. The secret is
never accepted as an argument and is never written or printed. Output must not exist.`;

function parseOptions(argumentsList, allowed) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(name) || typeof value !== "string" || value.length === 0 || options[name]) {
      throw new FloridaTaxImportError("CLI_ARGUMENT_INVALID");
    }
    options[name] = value;
  }
  if (Object.keys(options).length !== allowed.size || [...allowed].some((name) => !options[name])) {
    throw new FloridaTaxImportError("CLI_ARGUMENT_INVALID");
  }
  return options;
}

async function main() {
  const [command, ...argumentsList] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (argumentsList.some((argument) => /^--?(?:secret|key|hmac)/iu.test(argument))) {
    throw new FloridaTaxImportError("SECRET_ARGUMENT_FORBIDDEN");
  }
  if (argumentsList.length % 2 !== 0) throw new FloridaTaxImportError("CLI_ARGUMENT_INVALID");

  if (command === "digest") {
    const options = parseOptions(argumentsList, new Set(["--input"]));
    const result = await digestFile(path.resolve(options["--input"]));
    process.stdout.write(`${JSON.stringify({ sha256: result.sha256, bytes: result.bytes })}\n`);
    return;
  }
  if (command === "build") {
    const options = parseOptions(argumentsList, new Set(["--config", "--output"]));
    const secret = process.env.ADDRESS_LOOKUP_HMAC_SECRET;
    delete process.env.ADDRESS_LOOKUP_HMAC_SECRET;
    if (typeof secret !== "string") throw new FloridaTaxImportError("HMAC_SECRET_MISSING");
    const result = await buildPrivateBundle({
      configPath: path.resolve(options["--config"]),
      outputDir: path.resolve(options["--output"]),
      secret,
    });
    process.stdout.write(
      `Private bundle validated: ${result.datasetRows} jurisdiction rows, ` +
      `${result.shardCount} ZIP5 shards, ${result.rateRows} rate rows.\n`,
    );
    return;
  }
  if (command === "validate") {
    const options = parseOptions(argumentsList, new Set(["--bundle"]));
    const result = await validatePrivateBundle(path.resolve(options["--bundle"]));
    process.stdout.write(
      `Private bundle valid: ${result.datasetRows} jurisdiction rows, ` +
      `${result.shardCount} ZIP5 shards, ${result.rateRows} rate rows.\n`,
    );
    return;
  }
  throw new FloridaTaxImportError("CLI_COMMAND_INVALID");
}

main().catch((error) => {
  if (error instanceof FloridaTaxImportError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("IMPORT_FAILED_CLOSED\n");
  }
  process.exitCode = 1;
});
