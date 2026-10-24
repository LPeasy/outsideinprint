import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const releasePlan = JSON.parse(fs.readFileSync(new URL("./disney-releases.json", import.meta.url), "utf8"));

// The cron has no year. Only the two owner-authorized 2026 windows may build.
export function selectDisneyRelease(schedule, clock) {
  if (schedule !== releasePlan.cron) return { timed: false, release: null };
  const instant = Date.parse(clock);
  if (!Number.isFinite(instant)) throw new Error("Invalid release clock.");
  return { timed: true, release: releasePlan.releases.find(release =>
    instant >= Date.parse(release.releaseAt) && instant < Date.parse(release.endsAt)) ?? null };
}

export function verifyQueuedRelease(release, {
  readGit = path => execFileSync("git", ["show", "HEAD:" + path]),
  assertAncestor = sha => execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"]),
} = {}) {
  try { assertAncestor(release.queuedCommit); }
  catch { throw new Error("Queued release commit is not in main ancestry: " + release.slug); }
  const source = readGit(release.sourcePath);
  if (createHash("sha256").update(source).digest("hex") !== release.sourceSha256)
    throw new Error("Approved source changed: " + release.slug);
  if (!source.toString().includes('publishDate: "' + release.releaseAt + '"'))
    throw new Error("Release timestamp changed: " + release.slug);
  const manifest = JSON.parse(readGit("data/image-assets.json").toString());
  for (const image of release.images) {
    const asset = manifest.assets[image.id];
    if (!asset || asset.sha256 !== image.sha256 || asset.review_state !== "approved" ||
        asset.width !== image.width || asset.height !== image.height)
      throw new Error("Approved image changed: " + image.id);
  }
  if (release.gallerySlug) {
    const gallery = readGit("data/editorial_cartoons.yaml").toString();
    const block = gallery.split(/\r?\n(?=  - slug: )/).find(text => text.startsWith("  - slug: " + release.gallerySlug + "\n"));
    if (!block || !block.includes('publishDate: "' + release.releaseAt + '"') ||
        !block.includes('title: "' + release.heroTitle + '"'))
      throw new Error("Gallery release changed: " + release.slug);
  }
}
