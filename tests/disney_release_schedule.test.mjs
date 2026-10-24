import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { releasePlan, selectDisneyRelease, verifyQueuedRelease } from "../scripts/ci/disney_release_schedule.mjs";

test("release clock never advances and only selects the two authorized days", () => {
  const choose = clock => selectDisneyRelease(releasePlan.cron, clock).release?.slug;
  assert.equal(choose("2026-10-25T12:59:59Z"), undefined);
  assert.equal(choose("2026-10-25T13:00:00Z"), "disney-world-2010s");
  assert.equal(choose("2026-10-26T03:59:59Z"), "disney-world-2010s");
  assert.equal(choose("2026-10-26T04:00:00Z"), undefined);
  assert.equal(choose("2026-10-26T12:59:59Z"), undefined);
  assert.equal(choose("2026-10-26T13:00:00Z"), "disney-world-2020s");
  assert.equal(choose("2026-10-26T18:00:00Z"), "disney-world-2020s");
  for (const clock of ["2026-10-27T04:00:00Z", "2027-10-25T13:00:00Z", "2027-10-26T13:00:00Z"])
    assert.equal(choose(clock), undefined);
  assert.throws(() => choose("invalid"), /clock/);
});
test("existing daily and weekly checks are not treated as release triggers", () => {
  for (const cron of ["17 0 * * 1", "17 0 * * 0,2-6", ""])
    assert.deepEqual(selectDisneyRelease(cron, "2026-10-26T13:00:00Z"), { timed: false, release: null });
});
test("queued source, images, ancestry and explicit Gallery timestamp fail closed", () => {
  for (const planned of releasePlan.releases) {
    const raw = Buffer.from('publishDate: "' + planned.releaseAt + '"\nApproved fixture.');
    const release = { ...planned, sourceSha256: createHash("sha256").update(raw).digest("hex") };
    const files = {
      [release.sourcePath]: raw,
      "data/image-assets.json": Buffer.from(JSON.stringify({ assets: Object.fromEntries(release.images.map(image => [image.id, { ...image, review_state: "approved" }])) })),
      "data/editorial_cartoons.yaml": Buffer.from('cartoons:\n  - slug: through-the-gates\n    title: "Through the Gates"\n    publishDate: "2026-10-26T09:00:00-04:00"\n'),
    };
    const options = { readGit: path => files[path], assertAncestor: sha => assert.equal(sha, release.queuedCommit) };
    assert.doesNotThrow(() => verifyQueuedRelease(release, options));
    assert.throws(() => verifyQueuedRelease(release, { ...options, assertAncestor() { throw Error("unrelated"); } }), /ancestry/);
    assert.throws(() => verifyQueuedRelease(release, { ...options, readGit: path => path === release.sourcePath ? Buffer.from("changed") : files[path] }), /source changed/);
    assert.throws(() => verifyQueuedRelease({ ...release, releaseAt: "2026-10-27T09:00:00-04:00" }, options), /timestamp changed/);
    assert.throws(() => verifyQueuedRelease({ ...release, images: [{ ...release.images[0], sha256: "0".repeat(64) }] }, options), /image changed/);
    if (release.gallerySlug) {
      files["data/editorial_cartoons.yaml"] = Buffer.from(files["data/editorial_cartoons.yaml"].toString().replace('publishDate: "2026-10-26T09:00:00-04:00"', 'publishDate: "2026-10-26T08:00:00-04:00"'));
      assert.throws(() => verifyQueuedRelease(release, options), /Gallery release changed/);
    }
  }
});
