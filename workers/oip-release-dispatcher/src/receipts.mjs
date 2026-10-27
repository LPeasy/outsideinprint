import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const canonicalJson = value => Array.isArray(value) ? "[" + value.map(canonicalJson).join(",") + "]" :
  value && typeof value === "object" ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}" : JSON.stringify(value);
export const fingerprint = release => createHash("sha256").update(canonicalJson(release)).digest("hex");
const require = (value, message) => { if (!value) throw Error(message); };

// Read only small JSON receipts, never extract paths or inflate other entries.
export function readReceiptZip(input, digest) {
  const zip = Buffer.from(input);
  require(zip.length <= 8 * 1024 * 1024, "Receipt archive exceeds 8 MiB.");
  require(/^sha256:[0-9a-f]{64}$/.test(digest ?? "") &&
    "sha256:" + createHash("sha256").update(zip).digest("hex") === digest, "Artifact digest differs.");
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  require(end >= 0 && zip.readUInt16LE(end + 4) === 0 && zip.readUInt16LE(end + 6) === 0, "Invalid receipt ZIP.");
  const count = zip.readUInt16LE(end + 10);
  require(count > 0 && count <= 512, "Receipt ZIP entry count is invalid.");
  let offset = zip.readUInt32LE(end + 16);
  const wanted = new Set(["admission.json", "live-manifest.json", "deployment-head.json", "deployment-head-final.json", "scheduled-releases.json"]);
  const result = {};
  for (let i = 0; i < count; i++) {
    require(offset + 46 <= zip.length && zip.readUInt32LE(offset) === 0x02014b50, "Invalid ZIP directory.");
    const flags = zip.readUInt16LE(offset + 8), method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20), length = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28), extraLength = zip.readUInt16LE(offset + 30), commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;
    require(!name.includes("\\") && !name.startsWith("/") && !name.split("/").includes(".."), "Unsafe artifact entry.");
    const base = name.split("/").at(-1);
    if (!wanted.has(base)) continue;
    require(!result[base] && !(flags & 1) && [0, 8].includes(method) && length <= 2 * 1024 * 1024, "Invalid or duplicate JSON receipt.");
    require(local + 30 <= zip.length && zip.readUInt32LE(local) === 0x04034b50, "Invalid local ZIP header.");
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    require(start + size <= zip.length, "Truncated artifact entry.");
    const bytes = method === 8 ? inflateRawSync(zip.subarray(start, start + size), { maxOutputLength: 2 * 1024 * 1024 }) : zip.subarray(start, start + size);
    require(bytes.length === length, "Receipt length differs.");
    result[base] = JSON.parse(bytes.toString("utf8"));
  }
  return result;
}

export function verifyAdmission(admission, batch, run) {
  require(admission?.schemaVersion === 1 && admission.requestId === batch.requestId &&
    admission.expectedSha === batch.sha && admission.commitSha === run.head_sha && admission.probe === batch.probe,
  "Admission identity differs.");
  if (admission.status === "superseded") return "superseded";
  require(admission.status === "admitted" && run.head_sha === batch.sha &&
    canonicalJson(admission.releases) === canonicalJson(batch.releases), "Admitted release bindings differ.");
  return "admitted";
}

export function verifyCanonical({ receipts, batch, jobs }) {
  const step = name => jobs.flatMap(job => job.steps ?? []).some(item => item.name === name && item.conclusion === "success");
  for (const name of ["Deploy", "Verify canonical publication manifest", "Confirm published commit still matches current main", "Verify canonical routes and SEO"])
    require(step(name), "Required production step did not succeed: " + name);
  const live = receipts["live-manifest.json"];
  require(live?.expectedSha === batch.sha && live.observed?.commitSha === batch.sha &&
    typeof live.expectedGeneratedAt === "string" && live.expectedGeneratedAt === live.observed.generatedAtUtc && !live.error,
  "Canonical commit or original generation timestamp differs.");
  for (const name of ["deployment-head.json", "deployment-head-final.json"]) {
    const guard = receipts[name];
    require(guard?.current === true && guard.status === "current" && guard.workflowSha === batch.sha && guard.headSha === batch.sha &&
      guard.repository === "LPeasy/outsideinprint" && guard.workflowRef === "refs/heads/main", "Current-main guard differs.");
  }
  return live;
}

export function verifyProduction({ receipts, batch, run, jobs }) {
  const live = verifyCanonical({ receipts, batch, jobs }), report = receipts["scheduled-releases.json"];
  require(jobs.flatMap(job => job.steps ?? []).some(step => step.name === "Verify scheduled releases" && step.conclusion === "success"), "Required scheduled release step did not succeed.");
  require(report?.status === "passed" && report.commitSha === batch.sha && report.generatedAtUtc === live.expectedGeneratedAt &&
    report.runUrl === run.html_url, "Scheduled release receipt identity differs.");
  require(canonicalJson(report.releases.map(item => item.id).sort()) === canonicalJson(batch.releases.map(item => item.id).sort()), "Receipt release membership differs.");
  for (const item of report.releases)
    require(item.status === "passed" && item.commitSha === batch.sha && item.generatedAtUtc === live.expectedGeneratedAt, "A scheduled release did not pass.");
  return { runId: run.id, runUrl: run.html_url, commitSha: batch.sha, generatedAtUtc: live.expectedGeneratedAt, checkedAtUtc: report.checkedAtUtc };
}
