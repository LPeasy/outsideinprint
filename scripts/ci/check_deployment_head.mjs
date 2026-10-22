import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const validSha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const validRepository = value => typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
const validRef = value => typeof value === "string" && /^refs\/(?:heads|tags)\/[^\s]{1,240}$/.test(value);

class DeploymentHeadError extends Error {}

export async function checkDeploymentHead({ sha, ref, repository, token, fetchImpl = fetch }) {
  if (!validSha(sha) || !validRepository(repository) || !validRef(ref)) {
    throw new DeploymentHeadError("Deployment identity must contain a full commit SHA, repository, and Git ref.");
  }
  if (ref !== "refs/heads/main") {
    return { current: false, status: "not-main", headSha: null, reason: "Only the main branch may deploy." };
  }
  if (typeof token !== "string" || !token.trim()) {
    throw new DeploymentHeadError("An authenticated GitHub read token is required.");
  }

  let response;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${repository}/git/ref/heads/main`, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new DeploymentHeadError("Unable to read current main from GitHub.");
  }
  if (!response?.ok) {
    const status = Number.isInteger(response?.status) ? ` (HTTP ${response.status})` : "";
    throw new DeploymentHeadError(`GitHub main-ref read failed${status}.`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new DeploymentHeadError("GitHub main-ref response is not valid JSON.");
  }
  if (data?.ref !== "refs/heads/main" || data?.object?.type !== "commit" || !validSha(data?.object?.sha)) {
    throw new DeploymentHeadError("GitHub main-ref response does not identify a valid main commit.");
  }
  const current = data.object.sha === sha;
  return {
    current,
    status: current ? "current" : "superseded",
    headSha: data.object.sha,
    reason: current ? "Workflow commit matches current main." : "A newer main commit superseded this workflow; deployment is skipped.",
  };
}

export async function runDeploymentHeadGuard({ env = process.env, fetchImpl = fetch, reportPath = env.OIP_DEPLOYMENT_HEAD_REPORT || ".deploy-reports/deployment-head.json", now = () => new Date() } = {}) {
  const requireCurrent = env.OIP_REQUIRE_CURRENT === "true";
  const receipt = {
    schemaVersion: 1,
    checkedAtUtc: now().toISOString(),
    repository: validRepository(env.GITHUB_REPOSITORY) ? env.GITHUB_REPOSITORY : null,
    workflowSha: validSha(env.GITHUB_SHA) ? env.GITHUB_SHA : null,
    workflowRef: validRef(env.GITHUB_REF) ? env.GITHUB_REF : null,
    requireCurrent,
  };
  let failed = false;
  try {
    Object.assign(receipt, await checkDeploymentHead({
      sha: env.GITHUB_SHA,
      ref: env.GITHUB_REF,
      repository: env.GITHUB_REPOSITORY,
      token: env.GH_TOKEN,
      fetchImpl,
    }));
    if (requireCurrent && !receipt.current) {
      failed = true;
      receipt.reason = "Current main differs from this workflow commit; latest-publication verification failed.";
    }
  } catch (error) {
    failed = true;
    Object.assign(receipt, { current: false, status: "error", headSha: null, reason: error instanceof DeploymentHeadError ? error.message : "Deployment freshness check failed." });
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(receipt, null, 2) + "\n");
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `current=${receipt.current}\nstatus=${receipt.status}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `Deployment freshness: **${receipt.status}**\n\n${receipt.reason}\n\nWorkflow commit: \`${receipt.workflowSha ?? "invalid"}\`\n\nCurrent main: \`${receipt.headSha ?? "unavailable"}\`\n`);
  }
  return { receipt, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { receipt, failed } = await runDeploymentHeadGuard();
  console.log(receipt.reason);
  if (failed) process.exitCode = 1;
}
