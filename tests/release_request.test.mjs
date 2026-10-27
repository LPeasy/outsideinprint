import test from "node:test";
import assert from "node:assert/strict";
import { selectRequestedReleases, validateDispatchRequest, releaseFingerprint } from "../scripts/ci/release_request.mjs";
import { prepareScheduledRelease } from "../scripts/ci/scheduled_releases.mjs";

const releaseAt = "2026-11-01T09:00:00-05:00";
const release = prepareScheduledRelease({ id: "future", route: "/essays/future/", releaseAt,
  bindings: [{ kind: "file", path: "content/essays/future.md" }],
  checks: [{ route: "/essays/future/", containsText: ["An opening."] }] },
{ clock: "2026-10-01T00:00:00Z", readGit: () => Buffer.from(`---\ntitle: Future\npublishDate: "${releaseAt}"\ndraft: false\n---\nAn opening.\n`) });
const planned = { schemaVersion: 1, releases: [release] };

test("API requests select registered releases at the actual instant, including DST", () => {
  assert.deepEqual(selectRequestedReleases('["future"]', "2026-11-01T14:00:00Z", planned), [release]);
  for (const clock of ["2026-11-01T13:59:59Z", release.endsAt])
    assert.throws(() => selectRequestedReleases('["future"]', clock, planned), /outside/);
  for (const ids of ['[]', '["missing"]', '["future","future"]', '{}', '[1]'])
    assert.throws(() => selectRequestedReleases(ids, releaseAt, planned));
});
test("a probe cannot bypass explicit dispatch identity or select an unregistered ID", () => {
  const request = { event: "workflow_dispatch", ids: '["future"]', requestId: "12345678-1234-4321-abcd-123456789012", expectedSha: "a".repeat(40), probe: true };
  assert.equal(validateDispatchRequest(request), true);
  assert.equal(validateDispatchRequest({ event: "push" }), false);
  for (const changed of [{ event: "push" }, { ids: "" }, { requestId: "bad" }, { expectedSha: "main" }])
    assert.throws(() => validateDispatchRequest({ ...request, ...changed }));
});
test("release fingerprints bind content, checks and time without depending on JSON key order", () => {
  assert.equal(releaseFingerprint(release), releaseFingerprint(Object.fromEntries(Object.entries(release).reverse())));
  assert.notEqual(releaseFingerprint(release), releaseFingerprint({ ...release, route: "/changed/" }));
});
