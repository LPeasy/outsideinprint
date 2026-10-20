import { runOperationalSchedule } from "../src/monitoring.js";
import { handleConsumerQueueBatch } from "../src/queue.js";
import { scrubExpiredPurchaseMeasurement } from "../src/purchase-measurement.js";

export default {
  queue(batch, env) {
    return handleConsumerQueueBatch(batch, env);
  },
  async scheduled(_controller, env) {
    const now = Math.floor(Date.now() / 1000);
    const privacy = await scrubExpiredPurchaseMeasurement(env, now);
    const monitoring = await runOperationalSchedule(env, now);
    if (privacy.state === "UNAVAILABLE") throw new Error("PURCHASE_MEASUREMENT_RETENTION_UNAVAILABLE");
    return monitoring;
  },
};
