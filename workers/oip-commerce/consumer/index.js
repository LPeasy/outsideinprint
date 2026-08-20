import { handleQueueBatch } from "../src/queue.js";
import { expireUnusedPhysicalLinks } from "../src/maintenance.js";

export default {
  queue(batch, env) {
    return handleQueueBatch(batch, env);
  },
  scheduled(_controller, env) {
    return expireUnusedPhysicalLinks(env, Math.floor(Date.now() / 1000));
  },
};
