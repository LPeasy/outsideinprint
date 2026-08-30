import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const README_URL = new URL("../workers/oip-commerce/README.md", import.meta.url);
const WRANGLER_URL = new URL("../workers/oip-commerce/wrangler.toml.example", import.meta.url);

const TASK_2_HEADING = "### Task 2 — infrastructure deployment only";
const TASK_3_HEADING = "### Task 3 — staged webhook hardening, subscriptions, and signature binding";
const NEXT_HEADING = "### Physical activation blockers";

const LOGICAL_TARGET_IDENTITIES = [
  "oip-commerce-sandbox:SANDBOX:SQUARE_WEBHOOK_SIGNATURE_KEY",
  "oip-commerce:PRODUCTION:SQUARE_WEBHOOK_SIGNATURE_KEY",
];

const TASK_2_NOTIFICATION_SETTINGS = [
  "Sandbox: `SQUARE_WEBHOOK_NOTIFICATION_URL=https://oip-commerce-sandbox.pages.dev/api/square/webhook`",
  "Production: `SQUARE_WEBHOOK_NOTIFICATION_URL=https://downloads.outsideinprint.org/api/square/webhook`",
];

const NEGATED_OPERATION = /\b(?:absent|do not|leaves?|must not|never|no|without|zero)\b/i;

function countOccurrences(source, marker) {
  return source.split(marker).length - 1;
}

function assertNoPositiveOperation(source, pattern, message) {
  for (const line of source.split(/\r?\n/u)) {
    if (NEGATED_OPERATION.test(line)) {
      continue;
    }
    assert.doesNotMatch(line, pattern, `${message}: ${line.trim()}`);
  }
}

function assertProvisioningOrder(source) {
  const orderedMarkers = [
    "Task 2 records two distinct environment-specific logical SQUARE_WEBHOOK_SIGNATURE_KEY targets",
    "leaves both Cloudflare provider bindings and signature-key values absent",
    "Task 3 creates exactly one Sandbox and one Production webhook subscription",
    "owner creates each matching provider binding by entering its signature key after its subscription exists",
  ];

  let previousIndex = -1;
  for (const marker of orderedMarkers) {
    const currentIndex = source.indexOf(marker);
    assert.notEqual(currentIndex, -1, `missing provisioning marker: ${marker}`);
    assert.equal(countOccurrences(source, marker), 1, `duplicate provisioning marker: ${marker}`);
    assert.ok(currentIndex > previousIndex, `provisioning marker out of order: ${marker}`);
    previousIndex = currentIndex;
  }

  const absentStateIndex = source.indexOf(orderedMarkers[1]);
  for (const identity of LOGICAL_TARGET_IDENTITIES) {
    const identityIndex = source.indexOf(identity);
    assert.notEqual(identityIndex, -1, `missing deterministic logical target identity: ${identity}`);
    assert.equal(countOccurrences(source, identity), 1, `duplicate logical target identity: ${identity}`);
    assert.ok(identityIndex < absentStateIndex, `logical target identity must precede absent provider state: ${identity}`);
  }

  const task2Start = source.indexOf(`\n${TASK_2_HEADING}`);
  const task3Start = source.indexOf(`\n${TASK_3_HEADING}`);
  const task3End = source.indexOf(`\n${NEXT_HEADING}`, task3Start);
  assert.ok(task2Start > previousIndex, "Task 2 section must follow the boundary paragraph");
  assert.ok(task3Start > task2Start, "Task 3 webhook step must follow Task 2 provisioning steps");
  assert.ok(task3End > task3Start, "Task 3 section must end before physical activation controls");

  const task2Steps = source.slice(task2Start, task3Start);
  const task3Steps = source.slice(task3Start, task3End);

  for (const setting of TASK_2_NOTIFICATION_SETTINGS) {
    assert.equal(countOccurrences(task2Steps, setting), 1, `missing or duplicate Task 2 notification setting: ${setting}`);
  }

  const notificationIndex = task2Steps.indexOf(TASK_2_NOTIFICATION_SETTINGS[0]);
  const customDomainIndex = task2Steps.indexOf("Associate `downloads.outsideinprint.org` with the Production Cloudflare Pages project");
  const cnameIndex = task2Steps.indexOf("Configure the external-DNS CNAME for `downloads.outsideinprint.org`");
  const consumerIndex = task2Steps.indexOf("Deploy the consumer's `*/5 * * * *` scheduled trigger");
  const completionIndex = task2Steps.indexOf("Complete Task 2 by verifying");
  assert.ok(notificationIndex !== -1, "Task 2 notification settings must be explicit");
  assert.ok(customDomainIndex > notificationIndex, "Production custom-domain association must follow fixed Task 2 notification settings");
  assert.ok(cnameIndex > customDomainIndex, "external DNS CNAME must follow the Pages custom-domain association");
  assert.ok(consumerIndex > cnameIndex, "consumer deployment must finish before the Task 3 boundary");
  assert.ok(completionIndex > consumerIndex, "Task 2 acceptance must follow consumer deployment");
  assert.match(task2Steps, /one separately created, domain-restricted, sending-only key per environment/);
  assert.match(task2Steps, /Keep the Sandbox and Production Resend keys separate/);

  assertNoPositiveOperation(
    task2Steps,
    /\b(?:create|register|subscribe)\b[^\n]*\b(?:Square\s+)?webhook(?:\s+subscription)?\b/i,
    "Task 2 must not create or register a Square webhook subscription",
  );
  assertNoPositiveOperation(
    task2Steps,
    /(?:\b(?:create|configure|set|enter|bind|place|store|write)\b[^\n]*(?:SQUARE_WEBHOOK_SIGNATURE_KEY|signature[-_ ]key)|(?:SQUARE_WEBHOOK_SIGNATURE_KEY|signature[-_ ]key)[^\n]*\b(?:create|configure|set|enter|bind|place|store|write)\b)/i,
    "Task 2 must not create a signature-key provider binding or enter its value",
  );
  assertNoPositiveOperation(
    task2Steps,
    /\b(?:create|configure|set|enter|bind|place|store|write)\b[^\n]*\b(?:Cloudflare|provider)\b[^\n]*\bbinding\b/i,
    "Task 2 must not create a Cloudflare signature-key provider binding",
  );

  assert.match(task3Steps, /Create exactly one idempotent, disabled Square subscription/);
  assert.match(
    task3Steps,
    /After that disabled subscription definitely exists, the owner directly transfers its returned signature key into the matching Pages production environment as `SQUARE_WEBHOOK_SIGNATURE_KEY`/,
  );
  assert.match(task3Steps, /Deploy Pages exactly once from the packet-bound clean target commit\/tree and production branch/);
  assert.match(task3Steps, /update only the same subscription ID to `enabled=true` and run exactly one Square `order\.updated` subscription test/);
  assert.doesNotMatch(task3Steps, /SQUARE_WEBHOOK_NOTIFICATION_URL\s*=/i);
  assertNoPositiveOperation(
    task3Steps,
    /\b(?:change|configure|set|write)\b[^\n]*SQUARE_WEBHOOK_NOTIFICATION_URL/i,
    "Task 3 must not change Task 2 notification configuration",
  );
  assertNoPositiveOperation(
    task3Steps,
    /\b(?:associate|configure|create|set|write)\b[^\n]*\b(?:CNAME|D1|DNS|Pages|Queue|R2|Resend|Worker)\b/i,
    "Task 3 must not mutate Task 2 infrastructure",
  );
}

function assertWranglerSignatureBoundary(source) {
  assert.match(
    source,
    /# Task 3 only\. Keep both the provider binding and value absent throughout Task 2:\r?\n# SQUARE_WEBHOOK_SIGNATURE_KEY/,
  );
  assert.doesNotMatch(source, /^\s*SQUARE_WEBHOOK_SIGNATURE_KEY\s*=/mu);
}

test("commerce provisioning records Task 2 logical targets before Task 3 provider binding creation", async () => {
  assertProvisioningOrder(await readFile(README_URL, "utf8"));
});

test("commerce provisioning rejects a drifted Task 2 logical target identity", async () => {
  const source = await readFile(README_URL, "utf8");
  const staleSource = source.replace(
    LOGICAL_TARGET_IDENTITIES[0],
    "oip-commerce-sandbox:PRODUCTION:SQUARE_WEBHOOK_SIGNATURE_KEY",
  );
  assert.throws(() => assertProvisioningOrder(staleSource));
});

test("commerce provisioning rejects a drifted Task 2 notification URL", async () => {
  const source = await readFile(README_URL, "utf8");
  const staleSource = source.replace(
    TASK_2_NOTIFICATION_SETTINGS[0],
    "Sandbox: `SQUARE_WEBHOOK_NOTIFICATION_URL=https://downloads.outsideinprint.org/api/square/webhook`",
  );
  assert.throws(() => assertProvisioningOrder(staleSource));
});

test("commerce provisioning rejects signature-key entry in Task 2", async () => {
  const source = await readFile(README_URL, "utf8");
  const staleSource = source.replace(
    "   - `SQUARE_LOCATION_ID`",
    "   - `SQUARE_LOCATION_ID`\n   - `SQUARE_WEBHOOK_SIGNATURE_KEY` — enter during Task 2",
  );
  assert.throws(() => assertProvisioningOrder(staleSource));
});

test("commerce provisioning rejects webhook creation in Task 2", async () => {
  const source = await readFile(README_URL, "utf8");
  const staleSource = source.replace(
    "\n8. Configure Resend's verified sender",
    "\n8. Create the Production webhook subscription now.\n8. Configure Resend's verified sender",
  );
  assert.throws(() => assertProvisioningOrder(staleSource));
});

test("commerce provisioning rejects Cloudflare provider binding creation in Task 2", async () => {
  const source = await readFile(README_URL, "utf8");
  const staleSource = source.replace(
    "\n8. Configure Resend's verified sender",
    "\n8. Create the Cloudflare provider binding during Task 2.\n8. Configure Resend's verified sender",
  );
  assert.throws(() => assertProvisioningOrder(staleSource));
});

test("commerce provisioning rejects moving the Task 3 boundary before Task 2 DNS and consumer deployment", async () => {
  const source = await readFile(README_URL, "utf8");
  const withoutHeading = source.replace(`\n${TASK_3_HEADING}\n`, "\n");
  const staleSource = withoutHeading.replace(
    "\n10. Associate `downloads.outsideinprint.org`",
    `\n${TASK_3_HEADING}\n\n10. Associate \`downloads.outsideinprint.org\``,
  );
  assert.throws(() => assertProvisioningOrder(staleSource));
});

test("commerce provisioning rejects setting the notification binding during Task 3", async () => {
  const source = await readFile(README_URL, "utf8");
  const staleSource = source.replace(
    TASK_3_HEADING,
    `${TASK_3_HEADING}\n\n0. Set SQUARE_WEBHOOK_NOTIFICATION_URL during Task 3.\n`,
  );
  assert.throws(() => assertProvisioningOrder(staleSource));
});

test("wrangler example keeps the signature provider binding absent until Task 3", async () => {
  assertWranglerSignatureBoundary(await readFile(WRANGLER_URL, "utf8"));
});

test("wrangler example rejects an active Task 2 signature-key assignment", async () => {
  const source = await readFile(WRANGLER_URL, "utf8");
  const staleSource = source.replace(
    "# SQUARE_WEBHOOK_SIGNATURE_KEY",
    'SQUARE_WEBHOOK_SIGNATURE_KEY = "forbidden-task2-placeholder"',
  );
  assert.throws(() => assertWranglerSignatureBoundary(staleSource));
});
