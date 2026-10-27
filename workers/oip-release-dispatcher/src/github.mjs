import { sign } from "node:crypto";
import { readReceiptZip } from "./receipts.mjs";

const REPO = "LPeasy/outsideinprint", BASE = "https://api.github.com";
const require = (value, message) => { if (!value) throw Error(message); };
export async function boundedBody(response, limit) {
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw Error("GitHub response exceeds bound.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

export class GitHub {
  constructor(env, fetchImpl = fetch) { this.env = env; this.fetch = fetchImpl; }
  async api(path, { method = "GET", body, jwt = false, raw = false } = {}) {
    require(path.startsWith("/repos/" + REPO + "/") || /^\/app\/installations\/\d+\/access_tokens$/.test(path), "GitHub endpoint is outside the release scope.");
    const token = jwt ? this.jwt() : await this.token();
    let response;
    try { response = await this.fetch(BASE + path, { method, headers: { Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "OIP-Release-Dispatcher", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(20_000) }); }
    catch { throw Object.assign(Error("GitHub request could not be observed."), { transient: true }); }
    if (raw) return response;
    if (!response.ok) throw Object.assign(Error("GitHub " + method + " " + path.split("?")[0] + " returned HTTP " + response.status),
      { transient: response.status === 429 || response.status >= 500 });
    if (response.status === 204) return null;
    return JSON.parse((await boundedBody(response, 4 * 1024 * 1024)).toString());
  }
  jwt() {
    require(/^\d+$/.test(this.env.GITHUB_APP_ID ?? ""), "Missing GitHub App ID.");
    const now = Math.floor(Date.now() / 1000), encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const payload = encode({ alg: "RS256", typ: "JWT" }) + "." + encode({ iat: now - 60, exp: now + 540, iss: this.env.GITHUB_APP_ID });
    return payload + "." + sign("sha256", Buffer.from(payload), this.env.GITHUB_APP_PRIVATE_KEY).toString("base64url");
  }
  async token() {
    if (this.cachedToken && Date.parse(this.cachedToken.expires_at) > Date.now() + 60_000) return this.cachedToken.token;
    require(/^\d+$/.test(this.env.GITHUB_INSTALLATION_ID ?? ""), "Missing GitHub installation ID.");
    this.cachedToken = await this.api(`/app/installations/${this.env.GITHUB_INSTALLATION_ID}/access_tokens`, { jwt: true, method: "POST",
      body: { repositories: ["outsideinprint"], permissions: { actions: "write", contents: "read" } } });
    return this.cachedToken.token;
  }
  async snapshot() {
    const head = await this.api(`/repos/${REPO}/git/ref/heads/main`);
    require(head.ref === "refs/heads/main" && head.object.type === "commit" && /^[a-f0-9]{40}$/.test(head.object.sha), "GitHub main ref is invalid.");
    const sha = head.object.sha;
    const read = async path => {
      const file = await this.api(`/repos/${REPO}/contents/${path}?ref=${sha}`);
      require(file.type === "file" && file.encoding === "base64", "Expected a GitHub file.");
      return JSON.parse(Buffer.from(file.content, "base64").toString());
    };
    const [registry, config] = await Promise.all([read("scripts/ci/scheduled-releases.json"), read("scripts/ci/release-dispatcher.json")]);
    return { sha, registry, config };
  }
  async runs() {
    const since = encodeURIComponent(">=" + new Date(Date.now() - 86_400_000).toISOString());
    const result = await this.api(`/repos/${REPO}/actions/workflows/deploy.yml/runs?branch=main&per_page=100&created=${since}`);
    require(result.workflow_runs.length < 100, "Workflow run inventory needs operator reconciliation.");
    return result.workflow_runs.filter(run => run.head_branch === "main" && run.event !== "pull_request");
  }
  async dispatch(batch) {
    // GitHub returns 204, not a run ID. The durable nonce is written before
    // this POST and is reconciled against run-name on subsequent ticks.
    await this.api(`/repos/${REPO}/actions/workflows/deploy.yml/dispatches`, { method: "POST", body: { ref: "main", inputs: {
      full_checks: false, release_ids: JSON.stringify(batch.releases.map(item => item.id)), release_request_id: batch.requestId,
      release_expected_sha: batch.sha, release_probe: batch.probe } } });
  }
  async run(id) { return this.api(`/repos/${REPO}/actions/runs/${id}`); }
  async jobs(id) { const result = await this.api(`/repos/${REPO}/actions/runs/${id}/jobs?per_page=100`); require(result.total_count <= 100, "Too many workflow jobs."); return result.jobs; }
  async receipts(id, name) {
    const artifacts = await this.api(`/repos/${REPO}/actions/runs/${id}/artifacts?per_page=100`);
    const matches = artifacts.artifacts.filter(item => item.name === name && !item.expired);
    require(matches.length === 1 && matches[0].size_in_bytes <= 8 * 1024 * 1024, "Missing or ambiguous " + name + " artifact.");
    const artifact = matches[0];
    const redirect = await this.api(`/repos/${REPO}/actions/artifacts/${artifact.id}/zip`, { raw: true });
    require(redirect.status === 302, "Expected an artifact redirect.");
    const url = new URL(redirect.headers.get("location"));
    require(url.protocol === "https:" && !url.username && !url.password, "Unsafe artifact redirect.");
    // Never forward the GitHub credential to the signed storage URL.
    const response = await this.fetch(url.href, { redirect: "error", signal: AbortSignal.timeout(20_000) });
    require(response.ok, "Artifact download failed.");
    return readReceiptZip(await boundedBody(response, 8 * 1024 * 1024), artifact.digest);
  }
}
