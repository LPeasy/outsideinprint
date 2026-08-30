import { runOperationalSchedule } from "../src/monitoring.js";
import { handleConsumerQueueBatch } from "../src/queue.js";

export default {
  queue(batch, env) {
    return handleConsumerQueueBatch(batch, env);
  },
  scheduled(_controller, env) {
    return runOperationalSchedule(env, Math.floor(Date.now() / 1000));
  },
};
