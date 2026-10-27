import { timingSafeEqual } from "node:crypto";
import { GitHub } from "./github.mjs";
import { Dispatcher } from "./dispatcher.mjs";

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
        } else if (result.status === "verified" && (await store.get("attention"))?.status === "error") {
          await store.delete("attention");
        }
        return json(result);
      } catch (error) {
        const result = { status: "error", error: error.message, checkedAtUtc: new Date().toISOString() };
        await store.put("lastTick", result);
        if ((await store.get("attention"))?.status !== "blocked") await store.put("attention", result);
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
    if (url.pathname === "/admin/observe-probe" && request.method === "POST") {
      const { requestId } = await request.json();
      const batch = typeof requestId === "string" ? await store.get("request:" + requestId) : null;
      if (await store.get("active") || await store.get("probe") || !batch?.probe || batch.status !== "blocked" ||
        !Number.isSafeInteger(batch.runId) || batch.operations?.length !== 0)
        return json({ error: "Expected an existing blocked non-publishing probe with a known run." }, 409);
      // Re-read the existing run only. This route cannot dispatch a workflow.
      const github = new GitHub(this.env);
      const result = await new Dispatcher(store, github).reconcile(batch, await github.snapshot());
      if (result.status === "verified" && (await store.get("attention"))?.requestId === requestId) await store.delete("attention");
      return json(result);
    }
    if (url.pathname === "/admin/probe" && request.method === "POST") {
      if (await store.get("active") || await store.get("probe")) return json({ error: "A request is already pending." }, 409);
      const { ids } = await request.json();
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 64 || ids.some(id => typeof id !== "string")) return json({ error: "Expected registered IDs." }, 400);
      await store.put("probe", { ids });
      return json({ status: "probe-queued" }, 202);
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
