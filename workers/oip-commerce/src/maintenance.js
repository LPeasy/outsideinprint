import {
  listExpiredPhysicalLinks,
  markStaleUnboundPhysicalReservationsForReview,
  markPhysicalLinkExpired,
  recordFulfillmentReview,
  reconcileExpiredPhysicalReservations,
  releasePhysicalInventoryReservations,
} from "./database.js";
import { deletePaymentLink, getOrder } from "./square.js";

export async function expireUnusedPhysicalLinks(env, now, limit = 25, options = {}) {
  await options.beforeStep?.();
  await reconcileExpiredPhysicalReservations(env.DB, now);
  await options.beforeStep?.();
  const orphaned = await markStaleUnboundPhysicalReservationsForReview(env.DB, now);
  await options.beforeStep?.();
  const rows = await listExpiredPhysicalLinks(env.DB, now, limit);
  let expired = 0;
  let deferred = 0;
  let errors = 0;
  let reviewPersistenceFailed = false;
  for (const row of rows) {
    await options.beforeStep?.();
    let stage = "PHYSICAL_ORDER_READ";
    try {
      // Square has no payment-link expiry. A DRAFT order is unpaid. OPEN means a
      // payment may already have completed, so webhook processing wins the race.
      const beforeDelete = await getOrder(env, row.square_order_id);
      if (!["DRAFT", "CANCELED"].includes(beforeDelete.state)) {
        deferred += 1;
        continue;
      }
      let afterDelete = beforeDelete;
      if (beforeDelete.state === "DRAFT") {
        await options.beforeStep?.();
        stage = "PHYSICAL_LINK_DELETE";
        await deletePaymentLink(env, row.square_payment_link_id);
        await options.beforeStep?.();
        stage = "PHYSICAL_ORDER_RECHECK";
        afterDelete = await getOrder(env, row.square_order_id);
      }
      // Release inventory only after Square reports the cancellation as final.
      // A still-DRAFT response is retried by the next cron pass.
      if (afterDelete.state !== "CANCELED") {
        deferred += 1;
        continue;
      }
      await options.beforeStep?.();
      stage = "PHYSICAL_INVENTORY_RELEASE";
      await releasePhysicalInventoryReservations(env.DB, row.request_key, now);
      await options.beforeStep?.();
      stage = "PHYSICAL_EXPIRY_COMPLETION";
      if (await markPhysicalLinkExpired(env.DB, row.request_key, now)) {
        expired += 1;
      } else deferred += 1;
    } catch (error) {
      if (error?.message === "OPERATIONAL_HEARTBEAT_CLAIM_LOST") throw error;
      await options.onError?.(stage, error);
      // One Square/D1 failure must not starve cleanup for later checkout rows.
      errors += 1;
      try {
        await recordFulfillmentReview(env.DB, {
          eventId: `physical-expiry:${row.request_key}`,
          orderId: row.square_order_id,
          reasonCode: "PHYSICAL_LINK_EXPIRY_ERROR",
          details: { requestKey: row.request_key },
          now,
        });
      } catch (reviewError) {
        await options.onError?.("PHYSICAL_REVIEW_PERSISTENCE", reviewError);
        // Finish the remaining rows, then reject the scheduled run so the
        // missing review record is externally visible to Worker monitoring.
        reviewPersistenceFailed = true;
      }
    }
  }
  if (reviewPersistenceFailed) {
    throw new Error("PHYSICAL_EXPIRY_REVIEW_RECORD_FAILED");
  }
  return { examined: rows.length, expired, deferred, errors, orphaned };
}
