import { createHash } from "node:crypto";
import { canonicalJson, registry, validateRegistry } from "./scheduled_releases.mjs";

export const releaseFingerprint = release => createHash("sha256").update(canonicalJson(release)).digest("hex");

// This is an admission check, not an authorization to change the registry.
export function selectRequestedReleases(value, clock, planned = registry) {
  validateRegistry(planned);
  const ids = JSON.parse(value);
  if (!Array.isArray(ids) || !ids.length || ids.length > 64 ||
      ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length)
    throw Error("release_ids must be a nonempty JSON array of at most 64 unique registered IDs.");
  const now = Date.parse(clock);
  if (!Number.isFinite(now)) throw Error("Invalid release clock.");
  return ids.map(id => {
    const release = planned.releases.find(item => item.id === id);
    if (!release) throw Error("Unregistered release ID: " + id);
    if (now < Date.parse(release.releaseAt) || now >= Date.parse(release.endsAt))
      throw Error("Requested release is outside its approved window: " + id);
    return release;
  });
}

export function validateDispatchRequest({ event, ids = "", requestId = "", expectedSha = "", probe = false }) {
  const supplied = Boolean(ids || requestId || expectedSha || probe);
  if (!supplied) return false;
  if (event !== "workflow_dispatch" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(requestId) ||
      !/^[0-9a-f]{40}$/.test(expectedSha) || !ids)
    throw Error("Release dispatch requires workflow_dispatch, registered release_ids, a UUID request ID and expected main SHA.");
  return true;
}
