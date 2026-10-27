import { fingerprint, verifyAdmission, verifyProduction } from "./receipts.mjs";

const require = (value, message) => { if (!value) throw Error(message); };
export function operations(registry, now) {
  require(registry?.schemaVersion === 1 && Array.isArray(registry.releases), "Invalid release registry.");
  const ids = new Set(), result = [];
  for (const release of registry.releases) {
    require(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(release.id) && !ids.has(release.id), "Invalid or duplicate release ID.");
    ids.add(release.id);
    const start = Date.parse(release.releaseAt), end = Date.parse(release.endsAt);
    require(Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 86_400_000 &&
      Array.isArray(release.bindings) && release.bindings.length > 0, "Invalid release window or bindings.");
    const times = [release.releaseAt, ...(release.rebuildAt ? [release.rebuildAt] : [])];
    for (const at of times) {
      const instant = Date.parse(at);
      require(Number.isFinite(instant) && instant >= start && instant < end, "Invalid rebuild instant.");
      if (now >= instant && now < end) result.push({ key: `op:${release.id}:${at}`, id: release.id, at,
        fingerprint: fingerprint(release), endsAt: release.endsAt });
    }
  }
  return result.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}

export class Dispatcher {
  constructor(storage, github, { now = () => Date.now(), uuid = () => crypto.randomUUID() } = {}) {
    this.store = storage; this.github = github; this.now = now; this.uuid = uuid;
  }
  async finish(batch, status, evidence = {}) {
    const record = { ...batch, status, ...evidence, checkedAtUtc: new Date(this.now()).toISOString() };
    for (const op of batch.operations ?? []) await this.store.put(op.key, { ...op, status, requestId: batch.requestId, ...evidence });
    await this.store.put("request:" + batch.requestId, record);
    await this.store.delete("active");
    if (batch.probe && status === "verified") await this.store.put("canary", record);
    return record;
  }
  async reconcile(batch, snapshot) {
    let run;
    if (batch.runId) run = await this.github.run(batch.runId);
    else {
      const matches = (await this.github.runs()).filter(item => item.display_title === "OIP release " + batch.requestId && item.event === "workflow_dispatch");
      if (matches.length > 1) return this.finish(batch, "blocked", { error: "Duplicate dispatch nonce requires investigation." });
      run = matches[0];
      if (!run) {
        if (this.now() - batch.createdAt > 30 * 60_000)
          return this.finish(batch, "blocked", { error: "Dispatch outcome remains uncertain after 30 minutes; do not resend." });
        return { status: "awaiting-run", requestId: batch.requestId };
      }
      batch.runId = run.id;
      await this.store.put("active", batch);
    }
    if (run.status !== "completed") return { status: "in-flight", runId: run.id };
    const admission = (await this.github.receipts(run.id, "release-dispatch"))["admission.json"];
    if (verifyAdmission(admission, batch, run) === "superseded") return this.finish(batch, "superseded", { runId: run.id });
    const jobs = await this.github.jobs(run.id);
    if (!batch.probe) {
      // A successful first main-head guard that intentionally skipped Pages
      // can follow the newer main. A failed build/live check must stop.
      const deploy = jobs.find(job => job.name === "deploy");
      const actualDeploy = deploy?.steps?.find(step => step.name === "Deploy");
      if (run.conclusion === "success" && actualDeploy?.conclusion === "skipped" && snapshot.sha !== run.head_sha)
        return this.finish(batch, "superseded", { runId: run.id });
    }
    if (run.conclusion !== "success") return this.finish(batch, "blocked", { runId: run.id, error: "Workflow concluded " + run.conclusion + "; investigate without retrying." });
    if (batch.probe) {
      require(!jobs.some(job => job.name === "site" && job.conclusion !== "skipped") &&
        !jobs.some(job => job.name === "deploy" && job.conclusion !== "skipped") &&
        jobs.some(job => job.name === "release-ready" && job.conclusion === "success"), "Probe ran a publishing job or missed its gate.");
      return this.finish(batch, "verified", { runId: run.id, runUrl: run.html_url, commitSha: run.head_sha });
    }
    const receipts = await this.github.receipts(run.id, "deployment-diagnostics");
    const evidence = verifyProduction({ receipts, batch, run, jobs });
    return this.finish(batch, "verified", evidence);
  }
  async tick() {
    const control = await this.store.get("control") ?? { enabled: false };
    const active = await this.store.get("active"), probe = await this.store.get("probe");
    if (!control.enabled && !active && !probe) return { status: "inactive" };
    const snapshot = await this.github.snapshot();
    require(snapshot.config?.schemaVersion === 1 && ["github", "cloudflare"].includes(snapshot.config.mode), "Invalid dispatcher cutover config.");
    if (active) {
      try { return await this.reconcile(active, snapshot); }
      catch (error) {
        // Retrying an observation is safe. Retrying a workflow is not.
        if (error.transient) throw error;
        return this.finish(active, "blocked", { runId: active.runId, error: error.message });
      }
    }
    if (!probe && (!control.enabled || snapshot.config.mode !== "cloudflare")) return { status: "shadow" };
    const due = operations(snapshot.registry, this.now());
    if (!probe && control.activatedAtUtc) {
      for (const release of snapshot.registry.releases) {
        if (Date.parse(release.endsAt) > this.now() || Date.parse(release.endsAt) <= Date.parse(control.activatedAtUtc)) continue;
        for (const at of [release.releaseAt, ...(release.rebuildAt ? [release.rebuildAt] : [])]) {
          const key = `op:${release.id}:${at}`;
          if (!await this.store.get(key)) {
            const record = { id: release.id, at, fingerprint: fingerprint(release), status: "expired", error: "Approved window expired without a verified release; operator action required." };
            await this.store.put(key, record);
            return { ...record, status: "blocked" };
          }
        }
      }
    }
    let selected = [];
    if (probe) {
      require(Array.isArray(probe.ids) && probe.ids.length > 0 && probe.ids.length <= 64 && new Set(probe.ids).size === probe.ids.length, "Invalid probe IDs.");
      selected = probe.ids.map(id => {
        const op = due.find(item => item.id === id);
        require(op, "Probe requires a currently eligible registered release: " + id);
        return op;
      });
    } else {
      for (const op of due) {
        const previous = await this.store.get(op.key);
        if (previous && previous.fingerprint !== op.fingerprint) {
          await this.store.put(op.key, { ...previous, status: "blocked", error: "Registered release changed after dispatch; operator review required." });
          continue;
        }
        if (!previous || previous.status === "superseded") selected.push(op);
      }
    }
    // One explicit rebuild remains a distinct approved operation. Do not send
    // two operations for the same release in one workflow request.
    selected = selected.filter((op, index) => selected.findIndex(item => item.id === op.id) === index).slice(0, 64);
    if (!selected.length) return { status: "idle" };
    const runs = await this.github.runs();
    if (runs.some(run => run.status !== "completed")) return { status: "waiting-for-github" };
    const batch = { requestId: this.uuid(), sha: snapshot.sha, probe: Boolean(probe), createdAt: this.now(),
      operations: probe ? [] : selected, releases: selected.map(op => ({ id: op.id, fingerprint: op.fingerprint })) };
    // Durable intent precedes the only dispatch POST. A process restart or
    // uncertain response reconciles by nonce; it never repeats that POST.
    await this.store.put("active", batch);
    if (probe) await this.store.delete("probe");
    for (const op of batch.operations) await this.store.put(op.key, { ...op, status: "dispatching", requestId: batch.requestId });
    try { await this.github.dispatch(batch); }
    catch { await this.store.put("active", { ...batch, outcome: "uncertain" }); }
    return { status: "dispatched", requestId: batch.requestId, probe: batch.probe };
  }
}
