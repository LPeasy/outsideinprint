import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { assertExpectedPublicationIdentity } from "./verify_deployment.mjs";

export function writePublicationIdentity(manifestPath, outputPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assertExpectedPublicationIdentity(manifest.commitSha, manifest.generatedAtUtc);
  // Preserve the original precision and spelling across the Actions job boundary.
  fs.appendFileSync(outputPath, "generated_at=" + manifest.generatedAtUtc + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writePublicationIdentity(process.argv[2], process.env.GITHUB_OUTPUT);
}
