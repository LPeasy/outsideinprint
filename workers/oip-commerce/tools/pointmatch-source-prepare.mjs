#!/usr/bin/env node

import {
  digestPointMatchArchive,
  PointMatchSourcePrepError,
  preparePointMatchSource,
  validatePreparedPointMatchBundle,
} from "./lib/pointmatch-source-preparer.mjs";

function usage() {
  return [
    "Usage:",
    "  pointmatch-source-prepare.mjs digest --input <private-archive.zip>",
    "  pointmatch-source-prepare.mjs prepare --config <private-config.json> --output <new-private-directory>",
    "  pointmatch-source-prepare.mjs validate --bundle <private-directory>",
  ].join("\n");
}

function exactArguments(values, names) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("CLI_ARGUMENT_INVALID");
    }
    const name = flag.slice(2);
    if (!names.includes(name) || Object.hasOwn(result, name)) throw new Error("CLI_ARGUMENT_INVALID");
    result[name] = value;
  }
  if (Object.keys(result).length !== names.length || names.some((name) => !Object.hasOwn(result, name))) {
    throw new Error("CLI_ARGUMENT_INVALID");
  }
  return result;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "digest") {
    const args = exactArguments(rest, ["input"]);
    const result = await digestPointMatchArchive(args.input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === "prepare") {
    const args = exactArguments(rest, ["config", "output"]);
    const result = await preparePointMatchSource({ configPath: args.config, outputDir: args.output });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === "validate") {
    const args = exactArguments(rest, ["bundle"]);
    const result = await validatePreparedPointMatchBundle(args.bundle);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error("CLI_ARGUMENT_INVALID");
}

try {
  await main();
} catch (error) {
  if (error instanceof PointMatchSourcePrepError) {
    process.stderr.write(`${error.message}\n`);
  } else if (error?.message === "CLI_ARGUMENT_INVALID") {
    process.stderr.write(`${usage()}\n`);
  } else {
    process.stderr.write("POINTMATCH_PREPARATION_FAILED\n");
  }
  process.exitCode = 1;
}
