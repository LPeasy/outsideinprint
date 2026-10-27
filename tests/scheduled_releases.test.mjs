import test from "node:test";
import assert from "node:assert/strict";
import {
  sha256, canonicalJson, validateEasternTimestamp, validateRegistry, prepareScheduledRelease,
  verifyScheduledRelease, verifyPendingScheduledReleases, scheduledCrons, selectScheduledReleases, renderScheduleBlock,
  syncScheduleBlock, assertScheduleWorkflow,
} from "../scripts/ci/scheduled_releases.mjs";

const at = "2026-11-01T09:00:00-05:00";
const source = date => Buffer.from(`---\ntitle: "A Guest Reflection"\npublishDate: "${date}"\ndraft: false\n---\nA distinct opening.\n`);
const spec = (id = "guest-reflection", releaseAt = at) => ({
  id, route: "/syd-and-oliver/a-guest-reflection/", releaseAt,
  bindings: [{ kind: "file", path: "content/essays/dialogues/a-guest-reflection.md" }],
  checks: [{ route: "/syd-and-oliver/a-guest-reflection/", title: "A Guest Reflection", containsText: ["A distinct opening."] }],
});
function fixture(input = spec()) {
  const files = { [input.bindings[0].path]: source(input.releaseAt) };
  const readGit = path => {
    assert.ok(path in files, "Unexpected source read: " + path);
    return files[path];
  };
  const release = prepareScheduledRelease(input, { readGit, clock: "2026-10-01T00:00:00Z" });
  return { release, files, readGit };
}
const options = releases => ({ registry: { schemaVersion: 1, releases }, disneyPlan: { releases: [] }, dispatcherConfig: { schemaVersion: 1, mode: "github" } });

test("cloud cutover removes per-release timers and suppresses late native events without removing maintenance", () => {
  const { release } = fixture();
  const plan = { ...options([release]), dispatcherConfig: { schemaVersion: 1, mode: "cloudflare" } };
  assert.deepEqual(scheduledCrons(plan), []);
  assert.deepEqual(selectScheduledReleases("", at, plan), { timed: false, generic: [], disney: [] });
  assert.deepEqual(selectScheduledReleases("0 14 1 11 *", at, plan), { timed: true, generic: [], disney: [] });
  const workflow = "on:\n  schedule:\n    - cron: 17 0 * * 1\n      timezone: America/New_York\n    - cron: 17 0 * * 0,2-6\n      timezone: America/New_York\n" + renderScheduleBlock(plan) + "\n";
  assert.doesNotThrow(() => assertScheduleWorkflow(workflow, plan));
});

test("Eastern offsets are date-specific, including the two explicit fall-back instants", () => {
  for (const value of ["2026-10-25T09:00:00-04:00", at, "2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"])
    assert.equal(validateEasternTimestamp(value), value);
  for (const value of ["2026-11-01T09:00:00-04:00", "2026-03-08T02:30:00-05:00", "2026-02-30T09:00:00-05:00", "2026-10-25T09:00:10-04:00", "2026-10-25T13:00:00Z"])
    assert.throws(() => validateEasternTimestamp(value), /Eastern|New_York|calendar date/);
});

test("UTC triggers group dates and select every matching release within absolute windows", () => {
  const a = fixture(spec("first", "2026-10-25T09:00:00-04:00")).release;
  const b = fixture(spec("second", "2026-10-25T09:00:00-04:00")).release;
  const c = fixture(spec("third", "2026-10-26T09:00:00-04:00")).release;
  const plan = options([a, b, c]);
  assert.deepEqual(scheduledCrons(plan), ["0 13 25,26 10 *"]);
  const pick = clock => selectScheduledReleases("0 13 25,26 10 *", clock, plan);
  assert.deepEqual(pick("2026-10-25T12:59:59Z").generic, []);
  assert.deepEqual(pick("2026-10-25T13:00:00Z").generic.map(item => item.id), ["first", "second"]);
  assert.deepEqual(pick("2026-10-26T13:00:00Z").generic.map(item => item.id), ["third"]);
  for (const clock of ["2026-10-27T13:00:00Z", "2027-10-25T13:00:00Z"])
    assert.deepEqual(pick(clock), { timed: true, generic: [], disney: [] });
  assert.throws(() => pick("invalid"), /clock/);
  assert.deepEqual(selectScheduledReleases("", "2026-10-25T13:00:00Z", plan), { timed: false, generic: [], disney: [] });
});

test("legacy and generic collisions share one UTC cron while returning both record kinds", () => {
  const release = fixture(spec("new", "2026-10-25T09:00:00-04:00")).release;
  const legacy = { slug: "legacy", releaseAt: release.releaseAt, endsAt: release.endsAt };
  const plan = { ...options([release]), disneyPlan: { releases: [legacy] } };
  assert.deepEqual(scheduledCrons(plan), ["0 13 25 10 *"]);
  assert.deepEqual(selectScheduledReleases("0 13 25 10 *", "2026-10-25T13:00:00Z", plan), { timed: true, generic: [release], disney: [legacy] });
});

test("an authorized later rebuild preserves the release time and expires after its absolute window", () => {
  const { release, readGit } = fixture({ ...spec("book", "2026-10-27T09:00:00-04:00"), rebuildAt: "2026-10-27T09:30:00-04:00" });
  const plan = options([release]);
  assert.deepEqual(scheduledCrons(plan), ["0 13 27 10 *", "30 13 27 10 *"]);
  assert.equal(release.releaseAt, "2026-10-27T09:00:00-04:00");
  assert.doesNotThrow(() => verifyScheduledRelease(release, { readGit }));
  assert.deepEqual(selectScheduledReleases("0 13 27 10 *", "2026-10-27T13:00:00Z", plan).generic, [release]);
  const pick = clock => selectScheduledReleases("30 13 27 10 *", clock, plan).generic;
  assert.deepEqual(pick("2026-10-27T13:29:59Z"), []);
  assert.deepEqual(pick("2026-10-27T13:30:00Z"), [release]);
  assert.deepEqual(pick(release.endsAt), []);
  assert.deepEqual(pick("2027-10-27T13:30:00Z"), []);
});

test("rebuild instants require the correct Eastern offset and stay strictly inside the release window", () => {
  const { release } = fixture(spec("book", "2026-10-27T09:00:00-04:00"));
  for (const rebuildAt of ["2026-10-27T08:30:00-04:00", release.releaseAt, "2026-10-28T09:00:00-04:00", "2026-10-27T09:30:00-05:00"])
    assert.throws(() => validateRegistry(options([{ ...release, rebuildAt }]).registry), /rebuildAt|Eastern|New_York/);
});

test("a rebuild at maintenance time reuses that trigger without changing primary eligibility", () => {
  const { release } = fixture({ ...spec("book", "2026-10-26T09:00:00-04:00"), rebuildAt: "2026-10-27T00:17:00-04:00" });
  const plan = options([release]);
  assert.deepEqual(scheduledCrons(plan), ["0 13 26 10 *"]);
  assert.deepEqual(selectScheduledReleases("17 0 * * 0,2-6", "2026-10-27T04:16:59Z", plan).generic, []);
  assert.deepEqual(selectScheduledReleases("17 0 * * 0,2-6", "2026-10-27T04:17:00Z", plan).generic, [release]);
  assert.deepEqual(selectScheduledReleases("17 0 * * 0,2-6", "2027-10-27T04:17:00Z", plan).generic, []);
});

test("00:17 Eastern releases reuse daily or Monday maintenance without suppressing it", () => {
  const sunday = fixture(spec("sunday", "2026-10-25T00:17:00-04:00")).release;
  const monday = fixture(spec("monday", "2026-10-26T00:17:00-04:00")).release;
  const plan = options([sunday, monday]);
  assert.deepEqual(scheduledCrons(plan), []);
  assert.deepEqual(selectScheduledReleases("17 0 * * 0,2-6", "2026-10-25T04:17:00Z", plan), { timed: false, generic: [sunday], disney: [] });
  assert.deepEqual(selectScheduledReleases("17 0 * * 1", "2026-10-26T04:17:00Z", plan), { timed: false, generic: [monday], disney: [] });
  assert.deepEqual(selectScheduledReleases("17 0 * * 1", "2027-10-25T04:17:00Z", plan), { timed: false, generic: [], disney: [] });
});

test("registration binds staged bytes, defaults to a bounded day, and never rewrites the spec", () => {
  const input = spec();
  const saved = structuredClone(input);
  const { release, readGit } = fixture(input);
  assert.deepEqual(input, saved);
  assert.equal(release.bindings[0].sha256, sha256(source(at)));
  assert.equal(release.endsAt, "2026-11-02T14:00:00Z");
  assert.doesNotThrow(() => verifyScheduledRelease(release, { readGit, assertAncestor() { assert.fail("Absent commit must not require ancestry"); } }));
  assert.throws(() => prepareScheduledRelease(input, { readGit, clock: "2026-11-01T14:00:00Z" }), /passed/);
  assert.throws(() => prepareScheduledRelease({ ...input, bindings: [{ ...input.bindings[0], sha256: "0".repeat(64) }] }, { readGit, clock: "2026-10-01T00:00:00Z" }), /staged source/);
});

test("source edits, draft or timestamp changes, and supplied unrelated ancestry fail closed", () => {
  const { release, files, readGit } = fixture();
  const withCommit = { ...release, queuedCommit: "a".repeat(40) };
  assert.doesNotThrow(() => verifyScheduledRelease(withCommit, { readGit, assertAncestor(sha) { assert.equal(sha, withCommit.queuedCommit); } }));
  assert.throws(() => verifyScheduledRelease(withCommit, { readGit, assertAncestor() { throw Error("unrelated"); } }), /ancestry/);
  files[release.bindings[0].path] = Buffer.from(source(at).toString().replace("distinct", "changed"));
  assert.throws(() => verifyScheduledRelease(release, { readGit }), /source changed/);
  const changed = { ...release, bindings: [{ ...release.bindings[0], sha256: sha256(files[release.bindings[0].path]) }], releaseAt: "2026-11-01T10:00:00-05:00" };
  assert.throws(() => verifyScheduledRelease(changed, { readGit }), /publishDate/);
  files[release.bindings[0].path] = Buffer.from(source(at).toString().replace("draft: false", "draft: true"));
  assert.throws(() => prepareScheduledRelease(spec(), { readGit, clock: "2026-10-01T00:00:00Z" }), /draft/);
});

test("Gallery-only releases bind one canonical record and tolerate unrelated entries", () => {
  const record = { slug: "sunrise", title: "Sunrise", publishDate: at, image: "editorial/sunrise" };
  const input = { id: "sunrise", route: "/gallery/", releaseAt: at,
    bindings: [{ kind: "gallery", path: "data/editorial_cartoons.yaml", slug: "sunrise" }],
    checks: [{ route: "/gallery/", containsText: ["Sunrise"] }] };
  let records = [record];
  const readGit = () => Buffer.from(JSON.stringify({ cartoons: records }));
  const release = prepareScheduledRelease(input, { readGit, clock: "2026-10-01T00:00:00Z" });
  assert.equal(release.bindings[0].sha256, sha256(canonicalJson(record)));
  records = [{ slug: "unrelated", title: "Other art" }, { image: record.image, publishDate: at, title: "Sunrise", slug: "sunrise" }];
  assert.doesNotThrow(() => verifyScheduledRelease(release, { readGit }));
  records[1].title = "Changed";
  assert.throws(() => verifyScheduledRelease(release, { readGit }), /source changed/);
  records = [record, record];
  assert.throws(() => verifyScheduledRelease(release, { readGit }), /ambiguous/);
});

test("managed image source hashes, dimensions, approval, and declared live IDs stay bound", () => {
  const input = spec();
  input.images = [{ id: "illustration/guest" }];
  input.checks[0].imageIds = ["illustration/guest"];
  const asset = { sha256: "b".repeat(64), width: 800, height: 600, review_state: "approved" };
  let manifest = { assets: { "illustration/guest": asset } };
  const readGit = path => path === "data/image-assets.json" ? Buffer.from(JSON.stringify(manifest)) : source(at);
  const release = prepareScheduledRelease(input, { readGit, clock: "2026-10-01T00:00:00Z" });
  assert.doesNotThrow(() => verifyScheduledRelease(release, { readGit }));
  for (const changed of [{ ...asset, sha256: "c".repeat(64) }, { ...asset, width: 801 }, { ...asset, review_state: "pending" }]) {
    manifest = { assets: { "illustration/guest": changed } };
    assert.throws(() => verifyScheduledRelease(release, { readGit }), /image changed/);
  }
  assert.throws(() => validateRegistry({ schemaVersion: 1, releases: [{ ...release, images: [] }] }), /no approved binding/);
});

test("registration rejects traversal, unknown fields, ambiguous ids and missing identifying checks", () => {
  const { release } = fixture();
  for (const path of ["../secret", "C:/secret", "/etc/passwd", "content\\item.md"])
    assert.throws(() => validateRegistry({ schemaVersion: 1, releases: [{ ...release, bindings: [{ ...release.bindings[0], path }] }] }), /path/);
  assert.throws(() => validateRegistry({ schemaVersion: 1, releases: [release, release] }), /Duplicate/);
  assert.throws(() => validateRegistry({ schemaVersion: 1, releases: [{ ...release, autorun: true }] }), /Unknown/);
  assert.throws(() => validateRegistry({ schemaVersion: 1, releases: [{ ...release, checks: [{ route: release.route }] }] }), /identifying/);
});

test("RSS and sitemap checks can declare safe XML routes without changing the primary page contract", () => {
  const input = spec();
  input.checks.push({ route: "/index.xml", format: "xml", containsText: ["https://outsideinprint.org" + input.route] },
    { route: "/sitemap.xml", format: "xml", containsText: ["https://outsideinprint.org" + input.route] });
  const { release } = fixture(input);
  assert.doesNotThrow(() => validateRegistry({ schemaVersion: 1, releases: [release] }));
  const altered = check => ({ schemaVersion: 1, releases: [{ ...release, checks: [release.checks[0], check] }] });
  assert.throws(() => validateRegistry(altered({ route: "/index.xml", format: "xml", title: "Invalid h1" })), /HTML h1/);
  assert.throws(() => validateRegistry(altered({ route: "/index.xml", format: "xml", containsText: [] })), /require containsText/);
  assert.throws(() => validateRegistry(altered({ route: "/index.xml", format: "xml", containsText: ["Expected"], links: [release.route] })), /HTML links/);
  for (const route of ["//other.example/index.xml", "/index.xml?preview=1", "/sitemap.xml#fragment", "/../index.xml"])
    assert.throws(() => validateRegistry(altered({ route, format: "xml", containsText: ["Expected"] })), /canonical route/);
  assert.throws(() => validateRegistry({ schemaVersion: 1, releases: [{ ...release, route: "/index.xml" }] }), /canonical route/);
});

test("generated workflow block detects drift and preserves the daily and Monday schedules", () => {
  const plan = options([fixture().release]);
  const make = block => `on:\n  schedule:\n    - cron: 17 0 * * 1\n      timezone: America/New_York\n    - cron: 17 0 * * 0,2-6\n      timezone: America/New_York\n${block}\npermissions:\n  contents: read\n`;
  const expected = make(renderScheduleBlock(plan));
  assert.doesNotThrow(() => assertScheduleWorkflow(expected, plan));
  const stale = expected.replace("0 14 1 11 *", "0 15 1 11 *");
  assert.throws(() => assertScheduleWorkflow(stale, plan), /differ/);
  assert.equal(syncScheduleBlock(stale, plan), expected);
  assert.throws(() => assertScheduleWorkflow(expected.replace("17 0 * * 1", "18 0 * * 1"), plan), /maintenance/);
  assert.throws(() => syncScheduleBlock("on: push\n", plan), /exactly one/);
});

test("release windows cannot outlive the next daily instance of a grouped UTC cron", () => {
  const { release } = fixture();
  assert.throws(() => validateRegistry({ schemaVersion: 1, releases: [{ ...release, endsAt: "2026-11-02T14:00:01Z" }] }), /24 hours/);
  assert.doesNotThrow(() => validateRegistry({ schemaVersion: 1, releases: [release] }));
});

test("schema and selection share verifier limits without capping retained registry history", () => {
  const { release } = fixture();
  const registryFor = item => ({ schemaVersion: 1, releases: [item] });
  assert.doesNotThrow(() => validateRegistry(registryFor({ ...release, checks: Array.from({ length: 32 }, () => release.checks[0]) })));
  assert.throws(() => validateRegistry(registryFor({ ...release, checks: Array.from({ length: 33 }, () => release.checks[0]) })), /32 live checks/);
  const images = Array.from({ length: 65 }, (_, index) => ({ id: "image/" + index, sha256: "a".repeat(64), width: 1, height: 1 }));
  assert.doesNotThrow(() => validateRegistry(registryFor({ ...release, images: images.slice(0, 64) })));
  assert.throws(() => validateRegistry(registryFor({ ...release, images })), /64 entries/);
  const releases = Array.from({ length: 65 }, (_, index) => ({ ...release, id: "release-" + index }));
  assert.doesNotThrow(() => validateRegistry(options(releases).registry));
  assert.throws(() => selectScheduledReleases("0 14 1 11 *", "2026-11-01T14:00:00Z", options(releases)), /64 IDs/);
  releases[64] = { ...releases[64], releaseAt: "2026-11-02T09:00:00-05:00", endsAt: "2026-11-03T14:00:00Z" };
  assert.equal(selectScheduledReleases("0 14 1,2 11 *", "2026-11-01T14:00:00Z", options(releases)).generic.length, 64);
});

test("static image checks accept canonical URLs with file bindings and reject unsafe or XML uses", () => {
  const input = spec();
  const staticPath = "static/images/almanack/issue.jpg";
  input.bindings.push({ kind: "file", path: staticPath });
  input.checks[0].imageUrls = ["/images/almanack/issue.jpg", "https://outsideinprint.org/images/almanack/issue.jpg"];
  const bytes = Buffer.from("fixture image bytes");
  const release = prepareScheduledRelease(input, { clock: "2026-10-01T00:00:00Z", readGit: path => path === staticPath ? bytes : source(at) });
  assert.equal(release.bindings[1].sha256, sha256(bytes));
  const withUrls = imageUrls => ({ schemaVersion: 1, releases: [{ ...release, checks: [{ ...release.checks[0], imageUrls }] }] });
  assert.doesNotThrow(() => validateRegistry(withUrls(release.checks[0].imageUrls)));
  for (const value of ["https://other.example/image.jpg", "http://outsideinprint.org/image.jpg", "https://user@outsideinprint.org/image.jpg", "//outsideinprint.org/image.jpg", "/images/../image.jpg", "/images/%2e%2e/image.jpg", "/image.jpg?x=1", "/image.jpg#x"])
    assert.throws(() => validateRegistry(withUrls([value])), /Image URL|image URL/);
  assert.throws(() => validateRegistry(withUrls(Array(65).fill("/image.jpg"))), /64 imageUrls/);
  assert.throws(() => validateRegistry({ schemaVersion: 1, releases: [{ ...release, checks: [...release.checks,
    { route: "/index.xml", format: "xml", containsText: ["Expected"], imageUrls: ["/image.jpg"] }] }] }), /HTML links or images/);
});

test("pending source verification ignores expired history and rejects changed future content", () => {
  const future = fixture();
  const old = fixture(spec("expired", "2026-10-25T09:00:00-04:00")).release;
  const expired = { ...old, bindings: [{ ...old.bindings[0], path: "content/essays/expired.md" }] };
  const config = { registry: { schemaVersion: 1, releases: [expired, future.release] },
    clock: "2026-11-01T13:00:00Z", readGit: future.readGit };
  assert.equal(verifyPendingScheduledReleases(config), 1);
  future.files[future.release.bindings[0].path] = Buffer.from("An edit after registration.");
  assert.throws(() => verifyPendingScheduledReleases(config), /Approved source changed/);
  assert.equal(verifyPendingScheduledReleases({ ...config, clock: future.release.endsAt }), 0);
});
