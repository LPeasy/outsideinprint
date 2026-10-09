import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function assertPublishedManifest(manifest, expectedSha, expectedGeneratedAt) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? "") || !Number.isFinite(Date.parse(expectedGeneratedAt))) throw new Error("Expected publication identity is missing.");
  if (manifest?.commitSha !== expectedSha) throw new Error("Canonical host serves a different commit.");
  if (manifest?.generatedAtUtc !== expectedGeneratedAt) throw new Error("Canonical host serves a different build of this commit.");
}
export async function pollPublishedManifest({ expectedSha, expectedGeneratedAt, fetchManifest, delay, attempts = 6 }) {
  let observed, lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      observed = await fetchManifest();
      assertPublishedManifest(observed, expectedSha, expectedGeneratedAt);
      return observed;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(20_000);
    }
  }
  const error = new Error("Publication manifest did not propagate: " + lastError.message);
  error.observed = observed;
  throw error;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const expectedSha = process.env.OIP_EXPECTED_SHA;
  const expectedGeneratedAt = process.env.OIP_EXPECTED_GENERATED_AT;
  fs.mkdirSync(".deploy-reports", { recursive: true });
  try {
    const observed = await pollPublishedManifest({
      expectedSha, expectedGeneratedAt,
      fetchManifest: async () => {
        const url = "https://outsideinprint.org/.oip-build-manifest.json?build=" + encodeURIComponent(expectedGeneratedAt);
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
        if (!response.ok) throw new Error("Manifest HTTP " + response.status);
        return response.json();
      },
      delay: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    });
    fs.writeFileSync(".deploy-reports/live-manifest.json", JSON.stringify({ expectedSha, expectedGeneratedAt, observed }, null, 2));
    console.log("Canonical publication commit and generation timestamp verified.");
  } catch (error) {
    fs.writeFileSync(".deploy-reports/live-manifest.json", JSON.stringify({ expectedSha, expectedGeneratedAt, observed: error.observed, error: error.message }, null, 2));
    console.error(error.message);
    process.exitCode = 1;
  }
}
