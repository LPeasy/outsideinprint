import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { releasePlan } from "./disney_release_schedule.mjs";

const REGISTRY_PATH = "scripts/ci/scheduled-releases.json";
const WORKFLOW_PATH = ".github/workflows/deploy.yml";
const BEGIN = "    # BEGIN GENERATED SCHEDULED RELEASES";
const END = "    # END GENERATED SCHEDULED RELEASES";
const HASH = /^[a-f0-9]{64}$/;
const fields = (value, allowed, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(label + " must be an object.");
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw Error("Unknown " + label + " field: " + key);
};
const require = (condition, message) => { if (!condition) throw Error(message); };
const text = value => typeof value === "string" && value.trim().length > 0;
export const sha256 = value => createHash("sha256").update(value).digest("hex");
const readHead = path => execFileSync("git", ["show", "HEAD:" + path], { maxBuffer: 32 * 1024 * 1024 });
const readIndex = path => execFileSync("git", ["show", ":" + path], { maxBuffer: 32 * 1024 * 1024 });

export function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object")
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

function parseYaml(value) {
  const doc = YAML.parseDocument(value.toString(), { version: "1.2", uniqueKeys: true });
  require(!doc.errors.length && !doc.warnings.length, "Invalid or unsupported YAML in a scheduled source.");
  return doc.toJS();
}

function sourcePath(path) {
  require(text(path) && !/[\\:\r\n\0]/.test(path) && !path.startsWith("/") &&
    path.split("/").every(part => part && part !== "." && part !== ".."), "Invalid repository source path.");
}

function canonicalRoute(value, { xml = false } = {}) {
  require(text(value) && value.startsWith("/") && !value.startsWith("//") && (value.endsWith("/") || (xml && value.endsWith(".xml"))) && !/[?#\\\s]/.test(value), "Expected a canonical route: " + value);
  const url = new URL(value, "https://outsideinprint.org");
  require(url.origin === "https://outsideinprint.org" && url.pathname === value, "Invalid canonical route: " + value);
}

function link(value) {
  if (typeof value === "string" && value.startsWith("/")) return canonicalRoute(value);
  let url;
  try { url = new URL(value); } catch { throw Error("Invalid expected link: " + value); }
  require(url.protocol === "https:" && !url.username && !url.password && !/[\s\\]/.test(value), "Expected an HTTPS link without credentials.");
}

function imageUrl(value) {
  require(text(value) && !/[?#%\\\s]/.test(value), "Image URL cannot contain encoded paths, queries, fragments, or whitespace.");
  const path = value.startsWith("https://outsideinprint.org/") ? value.slice("https://outsideinprint.org".length) : value;
  require(path.startsWith("/") && !path.startsWith("//"), "Image URL must use the canonical host or a root-relative path.");
  const url = new URL(path, "https://outsideinprint.org");
  require(url.origin === "https://outsideinprint.org" && url.pathname === path &&
    !path.split("/").some(part => part === "." || part === ".."), "Invalid or traversing image URL.");
}

function instant(value) {
  require(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), "Expected an explicit ISO timestamp.");
  const parsed = Date.parse(value), offset = value.slice(19);
  const minutes = offset === "Z" ? 0 : (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) * (offset[0] === "+" ? 1 : -1);
  require(new Date(parsed + minutes * 60000).toISOString().slice(0, 19) === value.slice(0, 19), "Invalid calendar date in ISO timestamp.");
  return parsed;
}

export function validateEasternTimestamp(value) {
  instant(value);
  require(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-0[45]:00$/.test(value), "releaseAt needs an explicit Eastern offset and a whole minute.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  require(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` === value.slice(0, 19), "releaseAt has an incorrect America/New_York wall time or UTC offset.");
  return value;
}

function galleryRecord(binding, readGit) {
  const records = parseYaml(readGit(binding.path))?.cartoons;
  require(Array.isArray(records), "Gallery source is missing cartoons.");
  const matches = records.filter(record => record?.slug === binding.slug);
  require(matches.length === 1, "Gallery binding is missing or ambiguous: " + binding.slug);
  return matches[0];
}

function bindingBytes(binding, readGit) {
  return binding.kind === "gallery" ? canonicalJson(galleryRecord(binding, readGit)) : readGit(binding.path);
}

function validatePrimary(release, readGit) {
  const primary = release.bindings[0];
  if (primary.kind === "gallery") {
    require(galleryRecord(primary, readGit).publishDate === release.releaseAt, "Primary Gallery publishDate differs from releaseAt.");
    return;
  }
  require(primary.path.startsWith("content/") && primary.path.endsWith(".md"), "First file binding must be the primary Markdown content source.");
  const match = readGit(primary.path).toString().match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  require(match, "Primary source requires YAML front matter.");
  const metadata = parseYaml(match[1]);
  require(metadata?.publishDate === release.releaseAt, "Primary source publishDate differs from releaseAt.");
  require(metadata.draft === false, "Primary scheduled source must have draft: false.");
}

export function validateRelease(release) {
  fields(release, ["id", "route", "releaseAt", "rebuildAt", "endsAt", "queuedCommit", "bindings", "images", "checks"], "release");
  require(typeof release.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(release.id), "Invalid release id.");
  canonicalRoute(release.route);
  validateEasternTimestamp(release.releaseAt);
  require(instant(release.endsAt) > instant(release.releaseAt), "endsAt must follow releaseAt.");
  require(instant(release.endsAt) - instant(release.releaseAt) <= 24 * 60 * 60 * 1000, "Release window cannot exceed 24 hours.");
  if (release.rebuildAt !== undefined) {
    validateEasternTimestamp(release.rebuildAt);
    require(instant(release.rebuildAt) > instant(release.releaseAt) && instant(release.rebuildAt) < instant(release.endsAt),
      "rebuildAt must follow releaseAt and precede endsAt.");
  }
  if (release.queuedCommit !== undefined) require(/^[a-f0-9]{40}$/.test(release.queuedCommit), "Invalid queuedCommit.");
  require(Array.isArray(release.bindings) && release.bindings.length > 0, "Release requires source bindings, with its primary source first.");
  const bindingIds = new Set();
  for (const binding of release.bindings) {
    fields(binding, ["kind", "path", "slug", "sha256"], "binding");
    require(["file", "gallery"].includes(binding.kind), "Unknown source binding kind.");
    sourcePath(binding.path);
    require(HASH.test(binding.sha256), "Invalid source SHA256.");
    if (binding.kind === "gallery") require(binding.path === "data/editorial_cartoons.yaml" && text(binding.slug), "Invalid Gallery binding.");
    else require(binding.slug === undefined, "File bindings cannot have a Gallery slug.");
    const key = binding.kind + ":" + binding.path + ":" + (binding.slug ?? "");
    require(!bindingIds.has(key), "Duplicate source binding."); bindingIds.add(key);
  }
  require(release.images === undefined || (Array.isArray(release.images) && release.images.length <= 64), "images must be an array of at most 64 entries.");
  const imageIds = new Set();
  for (const image of release.images ?? []) {
    fields(image, ["id", "sha256", "width", "height"], "image");
    require(text(image.id) && !imageIds.has(image.id) && HASH.test(image.sha256) &&
      Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0, "Invalid or duplicate approved image binding.");
    imageIds.add(image.id);
  }
  require(Array.isArray(release.checks) && release.checks.length > 0 && release.checks.length <= 32, "Release requires between 1 and 32 live checks.");
  for (const check of release.checks) {
    fields(check, ["route", "format", "title", "containsText", "links", "imageIds", "imageUrls"], "check");
    require(check.format === undefined || ["html", "xml"].includes(check.format), "Unknown live-check format.");
    canonicalRoute(check.route, { xml: check.format === "xml" });
    require(check.format !== "xml" || check.title === undefined, "XML checks cannot declare an HTML h1 title.");
    if (check.title !== undefined) require(text(check.title), "Expected title must be nonempty.");
    for (const name of ["containsText", "links", "imageIds", "imageUrls"]) {
      require(check[name] === undefined || (Array.isArray(check[name]) && check[name].every(text)), "Invalid live-check " + name + ".");
    }
    require(check.imageUrls === undefined || check.imageUrls.length <= 64, "A live check cannot exceed 64 imageUrls.");
    if (check.format === "xml") require(check.containsText?.length > 0 && !check.links?.length && !check.imageIds?.length && !check.imageUrls?.length,
      "XML checks require containsText and cannot declare HTML links or images.");
    for (const value of check.links ?? []) link(value);
    for (const value of check.imageUrls ?? []) imageUrl(value);
    for (const id of check.imageIds ?? []) require(imageIds.has(id), "Live image check has no approved binding: " + id);
  }
  require(release.checks.some(check => check.route === release.route && (text(check.title) || check.containsText?.length)), "Primary route requires an identifying title or text check.");
  return release;
}

export function validateRegistry(value) {
  fields(value, ["schemaVersion", "releases"], "registry");
  require(value.schemaVersion === 1 && Array.isArray(value.releases), "Unsupported scheduled-release registry.");
  const ids = new Set();
  for (const release of value.releases) {
    validateRelease(release);
    require(!ids.has(release.id), "Duplicate scheduled-release id: " + release.id); ids.add(release.id);
  }
  return value;
}

export const registry = validateRegistry(JSON.parse(fs.readFileSync(new URL("./scheduled-releases.json", import.meta.url), "utf8")));
export function validateDispatcherConfig(value) {
  fields(value, ["schemaVersion", "mode"], "dispatcher config");
  require(value.schemaVersion === 1 && ["github", "cloudflare"].includes(value.mode), "Invalid release dispatcher mode.");
  return value;
}
export const dispatcherConfig = validateDispatcherConfig(JSON.parse(fs.readFileSync(new URL("./release-dispatcher.json", import.meta.url), "utf8")));

function maintenanceCron(release) {
  if (release.releaseAt.slice(11, 16) !== "00:17") return null;
  const weekday = new Date(release.releaseAt.slice(0, 10) + "T12:00:00Z").getUTCDay();
  return weekday === 1 ? "17 0 * * 1" : "17 0 * * 0,2-6";
}

const triggerInstants = release => [release.releaseAt, ...(release.rebuildAt === undefined ? [] : [release.rebuildAt])];

function scheduleGroups({ registry: planned = registry, disneyPlan = releasePlan } = {}) {
  validateRegistry(planned);
  const groups = new Map();
  for (const [kind, entries] of [["generic", planned.releases], ["disney", disneyPlan.releases]]) {
    for (const release of entries) {
      for (const scheduledAt of triggerInstants(release)) {
        const date = new Date(validateEasternTimestamp(scheduledAt));
        if (maintenanceCron({ releaseAt: scheduledAt })) continue;
        const key = [date.getUTCMinutes(), date.getUTCHours(), date.getUTCMonth() + 1].join(" ");
        if (!groups.has(key)) groups.set(key, { minute: date.getUTCMinutes(), hour: date.getUTCHours(), month: date.getUTCMonth() + 1, days: new Set(), generic: [], disney: [] });
        const group = groups.get(key);
        group.days.add(date.getUTCDate()); group[kind].push({ release, scheduledAt });
      }
    }
  }
  return [...groups.values()].sort((a, b) => a.month - b.month || a.hour - b.hour || a.minute - b.minute).map(group => ({
    ...group, cron: `${group.minute} ${group.hour} ${[...group.days].sort((a, b) => a - b).join(",")} ${group.month} *`,
  }));
}

export function scheduledCrons(options) {
  const config = validateDispatcherConfig(options?.dispatcherConfig ?? dispatcherConfig);
  return config.mode === "cloudflare" ? [] : scheduleGroups(options).map(group => group.cron);
}

function boundedSelection(result) {
  require(result.generic.length <= 64, "Selected release batch cannot exceed 64 IDs.");
  return result;
}

export function selectScheduledReleases(schedule, clock, options) {
  if (["17 0 * * 1", "17 0 * * 0,2-6"].includes(schedule)) {
    const { registry: planned = registry, disneyPlan = releasePlan } = options ?? {};
    validateRegistry(planned);
    const now = Date.parse(clock);
    require(Number.isFinite(now), "Invalid release clock.");
    const due = release => triggerInstants(release).some(scheduledAt =>
      maintenanceCron({ releaseAt: scheduledAt }) === schedule && now >= instant(scheduledAt) && now < instant(release.endsAt));
    return boundedSelection({ timed: false, generic: planned.releases.filter(due), disney: disneyPlan.releases.filter(due) });
  }
  // A delayed native event from before cutover must not create a second
  // per-release build after Cloudflare has become the clock.
  if (schedule && (options?.dispatcherConfig ?? dispatcherConfig).mode === "cloudflare") return { timed: true, generic: [], disney: [] };
  const group = scheduleGroups(options).find(item => item.cron === schedule);
  if (!group) return { timed: false, generic: [], disney: [] };
  const now = Date.parse(clock);
  require(Number.isFinite(now), "Invalid release clock.");
  const due = ({ release, scheduledAt }) => now >= instant(scheduledAt) && now < instant(release.endsAt);
  return boundedSelection({ timed: true, generic: group.generic.filter(due).map(item => item.release), disney: group.disney.filter(due).map(item => item.release) });
}

export function verifyScheduledRelease(release, {
  readGit = readHead,
  assertAncestor = sha => execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"]),
} = {}) {
  validateRelease(release);
  if (release.queuedCommit !== undefined) {
    try { assertAncestor(release.queuedCommit); }
    catch { throw Error("Queued release commit is not in main ancestry: " + release.id); }
  }
  for (const binding of release.bindings)
    require(sha256(bindingBytes(binding, readGit)) === binding.sha256, "Approved source changed: " + binding.path + (binding.slug ? "#" + binding.slug : ""));
  validatePrimary(release, readGit);
  if (release.images?.length) {
    const manifest = JSON.parse(readGit("data/image-assets.json").toString());
    for (const image of release.images) {
      const asset = manifest.assets?.[image.id];
      require(asset && asset.sha256 === image.sha256 && asset.width === image.width && asset.height === image.height && asset.review_state === "approved", "Approved image changed: " + image.id);
    }
  }
}

export function verifyPendingScheduledReleases({ registry: planned = registry, clock = new Date().toISOString(), ...verification } = {}) {
  validateRegistry(planned);
  const now = Date.parse(clock);
  require(Number.isFinite(now), "Invalid pending-release clock.");
  const pending = planned.releases.filter(release => now < instant(release.endsAt));
  for (const release of pending) verifyScheduledRelease(release, verification);
  return pending.length;
}

export function prepareScheduledRelease(spec, { readGit = readIndex, clock = new Date().toISOString() } = {}) {
  const release = structuredClone(spec);
  validateEasternTimestamp(release.releaseAt);
  require(Number.isFinite(Date.parse(clock)) && instant(release.releaseAt) > Date.parse(clock), "Requested release time has passed.");
  release.endsAt ??= new Date(instant(release.releaseAt) + 24 * 60 * 60 * 1000).toISOString().replace(".000Z", "Z");
  require(Array.isArray(release.bindings) && release.bindings.length > 0, "Release requires source bindings.");
  for (const binding of release.bindings) {
    sourcePath(binding.path);
    require(["file", "gallery"].includes(binding.kind), "Unknown source binding kind.");
    if (binding.kind === "gallery") require(binding.path === "data/editorial_cartoons.yaml" && text(binding.slug), "Invalid Gallery binding.");
    const hash = sha256(bindingBytes(binding, readGit));
    require(binding.sha256 === undefined || binding.sha256 === hash, "Supplied source SHA256 differs from staged source.");
    binding.sha256 = hash;
  }
  if (release.images?.length) {
    const manifest = JSON.parse(readGit("data/image-assets.json").toString());
    release.images = release.images.map(image => {
      const asset = manifest.assets?.[image.id];
      require(asset?.review_state === "approved", "Staged image is not approved: " + image.id);
      for (const key of ["sha256", "width", "height"]) require(image[key] === undefined || image[key] === asset[key], "Supplied image binding differs from staged source: " + image.id);
      return { ...image, sha256: asset.sha256, width: asset.width, height: asset.height };
    });
  }
  validateRelease(release);
  validatePrimary(release, readGit);
  return release;
}

export function renderScheduleBlock(options) {
  const cloud = (options?.dispatcherConfig ?? dispatcherConfig).mode === "cloudflare";
  return [BEGIN, cloud ? "    # Cloudflare dispatches approved registry releases; maintenance crons remain above." :
    "    # Generated UTC instants; absolute registry windows prevent later-year releases.",
    ...scheduledCrons(options).flatMap(cron => ["    - cron: " + cron, "      timezone: UTC"]), END].join("\n");
}

export function syncScheduleBlock(workflow, options) {
  const normalized = workflow.replace(/\r\n/g, "\n");
  require(normalized.split(BEGIN).length === 2 && normalized.split(END).length === 2, "Workflow needs exactly one generated scheduled-release block.");
  const start = normalized.indexOf(BEGIN), end = normalized.indexOf(END) + END.length;
  require(end > start, "Invalid generated schedule markers.");
  return normalized.slice(0, start) + renderScheduleBlock(options) + normalized.slice(end);
}

export function assertScheduleWorkflow(workflow, options) {
  require(syncScheduleBlock(workflow, options) === workflow.replace(/\r\n/g, "\n"), "Scheduled registry and generated workflow cron block differ.");
  const expected = [
    { cron: "17 0 * * 1", timezone: "America/New_York" },
    { cron: "17 0 * * 0,2-6", timezone: "America/New_York" },
    ...scheduledCrons(options).map(cron => ({ cron, timezone: "UTC" })),
  ];
  require(canonicalJson(parseYaml(workflow)?.on?.schedule) === canonicalJson(expected), "Workflow schedules differ from maintenance and registered release triggers.");
}

function main(args) {
  const check = args.length === 1 && args[0] === "--check";
  const pending = args.length === 1 && args[0] === "--check-pending";
  require(check || pending || (args[0] === "--spec" && text(args[1]) && (args.length === 2 || (args.length === 3 && args[2] === "--write"))), "Usage: scheduled_releases.mjs --check | --check-pending | --spec <JSON> [--write]");
  const current = validateRegistry(JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")));
  if (pending) {
    const count = verifyPendingScheduledReleases({ registry: current });
    console.log(`Verified ${count} unexpired scheduled releases against HEAD.`);
    return;
  }
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  if (check) {
    assertScheduleWorkflow(workflow, { registry: current });
    console.log("Scheduled-release registry and generated workflow triggers agree.");
    return;
  }
  const release = prepareScheduledRelease(JSON.parse(fs.readFileSync(args[1], "utf8")));
  const next = validateRegistry({ schemaVersion: 1, releases: [...current.releases.filter(item => item.id !== release.id), release].sort((a, b) => a.releaseAt.localeCompare(b.releaseAt) || a.id.localeCompare(b.id)) });
  const updated = syncScheduleBlock(workflow, { registry: next });
  assertScheduleWorkflow(updated, { registry: next });
  if (args[2] === "--write") {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(next, null, 2) + "\n");
    fs.writeFileSync(WORKFLOW_PATH, updated);
  }
  console.log(JSON.stringify({ mode: args[2] === "--write" ? "written" : "preview", release, crons: scheduledCrons({ registry: next }) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
