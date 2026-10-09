import { pathToFileURL } from "node:url";

export function assertReleaseReady(needs, selected = undefined) {
  if (!needs || typeof needs !== "object" || Array.isArray(needs) || !Object.keys(needs).length) {
    throw new Error("Missing prerequisite results.");
  }
  selected ??= Object.fromEntries(Object.keys(needs).map((name) => [name, true]));
  const names = Object.keys(selected);
  if (names.length !== Object.keys(needs).length || names.some((name) => !Object.hasOwn(needs, name))) {
    throw new Error("Prerequisite selection and results differ.");
  }
  for (const name of names) {
    if (typeof selected[name] !== "boolean") throw new Error("Selection must use boolean values.");
    const result = needs[name]?.result;
    if (selected[name] ? result !== "success" : !["success", "skipped"].includes(result)) {
      throw new Error("Release blocked by " + name + ": " + (result ?? "missing"));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertReleaseReady(JSON.parse(process.env.OIP_NEEDS_JSON),
      process.env.OIP_SELECTED_JSON ? JSON.parse(process.env.OIP_SELECTED_JSON) : undefined);
    console.log("All selected release prerequisites passed.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
