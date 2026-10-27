import { timingSafeEqual } from "node:crypto";
import { GitHub } from "./github.mjs";
import { Dispatcher } from "./dispatcher.mjs";
import { canonicalJson, fingerprint, verifyCanonical } from "./receipts.mjs";

const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
function authorized(request, env) {
  const received = Buffer.from(request.headers.get("Authorization") ?? ""), expected = Buffer.from("Bearer " + (env.ADMIN_SECRET ?? ""));
  return env.ADMIN_SECRET?.length >= 40 && received.length === expected.length && timingSafeEqual(received, expected);
}

export class ReleaseCoordinator {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.queue = Promise.resolve(); }
  fetch(request) {
    const result = this.queue.then(() => this.handle(request));
    this.queue = result.catch(() => {});
    return result;
  }
  async handle(request) {
    const url = new URL(request.url), store = this.ctx.storage;
    if (url.pathname === "/tick") {
      try {
        const result = await new Dispatcher(store, new GitHub(this.env)).tick();
        await store.put("lastTick", { checkedAtUtc: new Date().toISOString(), ...result });
        if (result.status === "blocked") {
          await store.put("attention", result);
          console.error(JSON.stringify(result));
        }
        return json(result);
      } catch (error) {
        const result = { status: "error", error: error.message, checkedAtUtc: new Date().toISOString() };
        await store.put("lastTick", result);
        await store.put("attention", result);
        console.error(JSON.stringify(result));
        return json(result, 502);
      }
    }
    if (url.pathname === "/health") {
      const control = await store.get("control") ?? { enabled: false }, last = await store.get("lastTick");
      return json({ service: "oip-release-dispatcher", enabled: control.enabled, lastTickUtc: last?.checkedAtUtc ?? null,
        sourceCommitSha: this.env.SOURCE_COMMIT_SHA ?? null, attentionRequired: Boolean(await store.get("attention")) });
    }
    if (!authorized(request, this.env)) return json({ error: "Unauthorized" }, 401);
    if (url.pathname === "/admin/state" && request.method === "GET") {
      return json(Object.fromEntries(await store.list({ limit: 1000 })));
    }
    if (url.pathname === "/admin/probe" && request.method === "POST") {
      if (await store.get("active") || await store.get("probe")) return json({ error: "A request is already pending." }, 409);
      const { ids } = await request.json();
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 64 || ids.some(id => typeof id !== "string")) return json({ error: "Expected registered IDs." }, 400);
      await store.put("probe", { ids });
      return json({ status: "probe-queued" }, 202);
    }
    if (url.pathname === "/admin/reconcile" && request.method === "POST") {
      // Initial cutover may adopt a release verified before this dispatcher
      // existed. Keep its operator-supplied format evidence distinct from an
      // automatically verified dispatcher run. No source or calendar is edited.
      if (await store.get("active")) return json({ error: "A request is active." }, 409);
      const { report, runId } = await request.json();
      if (!Number.isSafeInteger(runId) || report?.status !== "passed" || !Array.isArray(report.releases) || !report.releases.length)
        return json({ error: "Expected a real passed format report and run ID." }, 400);
      const gh = new GitHub(this.env), snapshot = await gh.snapshot(), run = await gh.run(runId);
      if (run.status !== "completed" || run.conclusion !== "success" || run.head_branch !== "main" || report.runUrl !== run.html_url || report.commitSha !== run.head_sha)
        return json({ error: "Reconciliation run identity differs." }, 400);
      const ancestry = await gh.api(`/repos/LPeasy/outsideinprint/compare/${run.head_sha}...${snapshot.sha}`);
      if (!["ahead", "identical"].includes(ancestry.status) || ancestry.merge_base_commit?.sha !== run.head_sha)
        return json({ error: "Reconciliation commit is outside current main ancestry." }, 400);
      const receipts = await gh.receipts(runId, "deployment-diagnostics"), jobs = await gh.jobs(runId);
      const live = verifyCanonical({ receipts, jobs, batch: { sha: run.head_sha } });
      if (report.generatedAtUtc !== live.expectedGeneratedAt) return json({ error: "Reconciliation generation differs." }, 400);
      const pending = [];
      for (const result of report.releases) {
        const release = snapshot.registry.releases.find(item => item.id === result.id);
        const clean = bindings => bindings.map(({ kind, path, slug, sha256 }) => ({ kind, path, ...(slug ? { slug } : {}), sha256 }));
        if (!release || result.status !== "passed" || result.commitSha !== run.head_sha || result.generatedAtUtc !== report.generatedAtUtc ||
            !Number.isFinite(Date.parse(live.observed.buildClockUtc)) || Date.parse(live.observed.buildClockUtc) >= Date.parse(release.endsAt) ||
            canonicalJson(clean(result.bindings ?? [])) !== canonicalJson(clean(release.bindings)) ||
            canonicalJson(result.images ?? []) !== canonicalJson(release.images ?? [])) return json({ error: "Reconciliation source or image bindings differ." }, 400);
        for (const at of [release.releaseAt, ...(release.rebuildAt ? [release.rebuildAt] : [])]) {
          if (Date.parse(live.observed.buildClockUtc) < Date.parse(at)) continue;
          const key = `op:${release.id}:${at}`;
          if (await store.get(key)) return json({ error: "Operation already has a ledger record." }, 409);
          pending.push([key, { id: release.id, at, fingerprint: fingerprint(release), status: "reconciled", provenance: "operator-format-report",
            runId, runUrl: run.html_url, commitSha: run.head_sha, generatedAtUtc: report.generatedAtUtc, checkedAtUtc: result.checkedAtUtc,
            evidenceSha256: fingerprint(result) }]);
        }
      }
      for (const [key, value] of pending) await store.put(key, value);
      return json({ status: "reconciled", operations: pending.map(([key]) => key) });
    }
    if (url.pathname === "/admin/control" && request.method === "POST") {
      const { enabled } = await request.json();
      if (typeof enabled !== "boolean") return json({ error: "Expected enabled boolean." }, 400);
      const canary = await store.get("canary");
      if (enabled && (!canary || canary.status !== "verified")) return json({ error: "A verified non-publishing canary is required." }, 409);
      if (enabled && (await new GitHub(this.env).snapshot()).config.mode !== "cloudflare") return json({ error: "Cloudflare cutover is not merged." }, 409);
      const previous = await store.get("control");
      await store.put("control", { enabled, activatedAtUtc: previous?.activatedAtUtc ?? (enabled ? new Date().toISOString() : null),
        changedAtUtc: new Date().toISOString(), canaryRunId: canary?.runId });
      return json({ enabled });
    }
    return json({ error: "Not found" }, 404);
  }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(env.COORDINATOR.get(env.COORDINATOR.idFromName("LPeasy/outsideinprint")).fetch("https://coordinator/tick", { method: "POST" }).then(response => {
      if (!response.ok) throw Error("Release dispatcher requires attention; inspect authenticated state.");
    }));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/health" && !url.pathname.startsWith("/admin/")) return json({ error: "Not found" }, 404);
    if (url.pathname.startsWith("/admin/") && !authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    // The public surface cannot call /tick or choose a repository/workflow.
    return env.COORDINATOR.get(env.COORDINATOR.idFromName("LPeasy/outsideinprint")).fetch(request);
  },
};
