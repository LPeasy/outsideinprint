import {
  claimWebhookEvent,
  failWebhookEvent,
  finishWebhookEvent,
  getWebhookEvent,
  hasWebhookClaim,
} from "./database.js";
import { processSquareReference } from "./fulfillment.js";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function retryDelay(message) {
  const attempts = Number.isSafeInteger(message.attempts) ? message.attempts : 1;
  return Math.min(300, Math.max(5, 2 ** Math.min(8, attempts)));
}

export async function processQueueMessage(message, env) {
  const body = message?.body;
  if (
    !body ||
    typeof body.eventId !== "string" ||
    !/^[A-Za-z0-9_-]{1,192}$/u.test(body.eventId) ||
    typeof body.payloadHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(body.payloadHash)
  ) {
    message.ack();
    return { state: "INVALID_MESSAGE" };
  }
  const stored = await getWebhookEvent(env.DB, body.eventId);
  if (!stored || stored.payload_sha256 !== body.payloadHash) {
    message.ack();
    return { state: "MISSING_OR_CONFLICTING_EVENT" };
  }
  const now = nowSeconds();
  const claimToken = crypto.randomUUID();
  const claim = await claimWebhookEvent(env.DB, {
    id: stored.event_id,
    type: stored.event_type,
    objectId: stored.object_id,
    paymentId: stored.payment_id,
    payloadHash: stored.payload_sha256,
    createdAt: null,
    now,
    claimToken,
  });
  if (claim.state === "PROCESSED") {
    message.ack();
    return { state: "DUPLICATE" };
  }
  if (claim.state === "PROCESSING") {
    message.retry({ delaySeconds: 5 });
    return { state: "LEASED" };
  }
  if (claim.state === "HASH_MISMATCH") {
    message.ack();
    return { state: "CONFLICT" };
  }
  const assertClaim = async () => {
    if (!(await hasWebhookClaim(env.DB, stored.event_id, claimToken))) {
      throw new Error("WEBHOOK_CLAIM_LOST");
    }
  };
  try {
    await assertClaim();
    await processSquareReference(
      env,
      {
        eventId: stored.event_id,
        eventType: stored.event_type,
        objectId: stored.object_id,
        paymentId: stored.payment_id,
      },
      now,
      assertClaim,
    );
    await assertClaim();
    const finished = await finishWebhookEvent(env.DB, stored.event_id, claimToken, nowSeconds());
    if (!finished) throw new Error("WEBHOOK_CLAIM_LOST");
    message.ack();
    return { state: "PROCESSED" };
  } catch (error) {
    const code = error instanceof Error && error.message ? error.message.slice(0, 96) : "QUEUE_PROCESSING_FAILED";
    await failWebhookEvent(env.DB, stored.event_id, claimToken, code);
    message.retry({ delaySeconds: retryDelay(message) });
    return { state: "RETRY", code };
  }
}

export async function handleQueueBatch(batch, env) {
  for (const message of batch.messages) {
    await processQueueMessage(message, env);
  }
}
