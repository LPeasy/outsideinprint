# Physical Book Fulfillment Runbook

Date: 2026-08-15

Status: Tracked-safe operating procedure. No live shipment, refund, Square mutation, or inventory release is authorized by this document.

## Scope and handoff boundary

This runbook covers a direct website paperback order after the commerce worker records the physical checkout as `PAID_REVIEW_READY`. It applies only to a Square-hosted website checkout paid by card or wallet and fulfilled from `OIP Online` through USPS Media Mail.

`PAID_REVIEW_READY` is a review handoff, not permission to ship. It means the worker has retrieved a completed Square Payment and its Order, reconciled their bound amounts and final address, found the expected Square sale inventory adjustments, rechecked Square inventory, and moved the exact D1 reservations to `SOLD_VERIFIED`. The operator must still complete every applicable gate below from current evidence.

Do not use this workflow for Square POS, a market sale, cash, an EPUB, reader support, an Amazon order, pickup, an international order, or a replacement shipment. Never combine a web order with a POS or cash transaction. A web refund returns through the original Square payment; it is not paid from the POS drawer.

## Privacy and evidence boundary

- Read the recipient's street address only in the authenticated Square Order and the private postage/label workflow. Do not copy a raw customer street address into Git, source files, D1, logs, analytics, terminal output, screenshots, tickets, chat, or bookkeeping descriptions.
- Keep labels, carrier receipts, Square exports, customer messages, photographs, and exact identifiers in the encrypted private commerce records. Use only an opaque evidence ID in tracked-safe records.
- Keep the destination state and county, without a street address, in the sales-tax and bookkeeping subledgers. The worker's address HMAC may be retained; the HMAC secret may not be exported with the evidence packet.
- Treat a printed label or packing document bearing customer information as private. Secure spoiled copies and destroy them when no longer needed.
- Preserve the private order, payment, shipment, refund, inventory, accounting, tax, and reconciliation evidence for seven years. Purge only through the separately approved retention workflow.

## 1. Open the private fulfillment case

Create or open one encrypted case under an opaque evidence ID. Record the case-opened time and the two-business-day ship-by date measured from completed payment, excluding weekends and federal holidays.

Bind the case privately to:

- Square Order and Payment IDs;
- the worker request key and relevant webhook event ID;
- source `WEB`;
- each SKU, catalog variation/version, quantity, and approved unit price;
- merchandise, mandatory shipping, tax, total, fee, and payout fields as they become available;
- destination state and county without a street address; and
- the exact private inventory movement and bookkeeping evidence IDs.

Stop if the case is already assigned, already shipped, already refunded, disputed, duplicated, or linked to a POS/cash record. One paid web order gets one fulfillment case.

## 2. Verify the worker handoff

Before opening the label workflow, verify all of the following from the production commerce records:

- the binding status is exactly `PAID_REVIEW_READY` and `hold_reason` is empty;
- every bound reservation tuple matches the order SKU/catalog-object/quantity tuple and is exactly `SOLD_VERIFIED`;
- no open `fulfillment_reviews` row, failed or stuck webhook event, refund, dispute, or payment block affects the Payment or Order; and
- the Order and Payment IDs in the case match the binding. Do not substitute an email address, receipt number, or browser success page for these IDs.

`LINK_CREATED`, `PAYMENT_PROCESSING`, `HELD`, `REFUNDED`, `DISPUTED`, `EXPIRED`, `ACTIVE`, `ORPHANED_REVIEW`, `PAID_PENDING`, or `RELEASED` is a no-ship state. Do not manually promote a row or bypass a hold.

## 3. Re-read Square before shipping

Use the authenticated Square Dashboard or an approved private evidence export. Read the current Payment and its exact linked Order again; do not rely only on the webhook payload or the earlier worker result.

### Payment gate

Confirm:

- status is `COMPLETED`;
- the Payment links to the same Order and `OIP Online` location;
- tender is card or wallet, currency is USD, and the total equals the Order total and bound total;
- tip is zero; and
- refunded amount is zero, with no active dispute or suspicious-payment review.

### Order and final-address gate

Confirm:

- the Order remains the expected website order and contains exactly one `SHIPMENT` fulfillment;
- catalog SKUs, variations/versions, quantities, prices, discounts, the `USPS Media Mail` service charge, Florida tax when applicable, and total match the private case;
- the shipment recipient contains a complete U.S. address supported by the approved checkout policy; and
- the recipient printed on the label will be identical to the final Square Order recipient. If Square also shows a Payment shipping address, it must agree.

Do not silently correct or redirect an address. If the customer requests an address change after `PAID_REVIEW_READY`, place the case on hold and use the refund/new-checkout path so tax, jurisdiction, fraud, address-HMAC, and carrier evidence stay bound to one destination.

### Inventory gate

Confirm:

- the exact Square `IN_STOCK` to `SOLD` adjustment exists for each variation, quantity, location, and the configured Order-or-Payment transaction-ID meaning;
- the worker reservation is `SOLD_VERIFIED` and current Square stock is not negative;
- the private accounting inventory ledger contains enough accepted sellable copies; and
- the operator can physically pick the exact number of clean, accepted copies. Proof-only, rejected, damaged, promotional, or already allocated copies do not qualify.

If any value changed or cannot be proved, stop. Preserve the mismatch under the case evidence ID and follow the exception table below.

## 4. Pick, inspect, pack, and weigh

1. Pick by SKU and quantity. Compare title, edition, ISBN, and copy count to the Square Order.
2. Inspect each copy for the accepted sellable condition. Replace a damaged shelf copy before packing and record the private inventory adjustment.
3. Include only the approved books and Media-Mail-eligible packing or transaction material. Do not add merchandise, advertising, or another item that could invalidate USPS Media Mail eligibility.
4. Protect corners and covers; seal the parcel for normal carrier handling.
5. Weigh the final sealed parcel on the verified scale and record the packed weight privately.
6. Confirm the charged shipping band matches the paid quantity:
   - one book: `$4.99`;
   - two or three books: `$5.99`; and
   - four through six books: `$7.49`.
7. Buy the actual USPS Media Mail postage for the final packed weight. The label must show the exact final Square recipient and the approved private return address.

The customer is not charged again because actual postage or packaging exceeds the collected shipping amount. Ship the valid paid order, record the variance, and place the affected shipping band under review before another order uses it. If the contents are not Media Mail eligible or no compliant service is available under the approved order terms, hold and refund instead of substituting an unapproved service.

## 5. Final no-ship check

Immediately before USPS handoff, confirm and initial privately:

- Payment still `COMPLETED`, with no refund, dispute, or Square hold;
- Order, final address, label, SKUs, and quantities agree;
- worker status `PAID_REVIEW_READY`; reservations `SOLD_VERIFIED`;
- copies are sellable and packed count is correct;
- USPS Media Mail eligibility, packed weight, postage, and tracking are recorded;
- the package is within the two-business-day handling target, or an exception/contact record exists; and
- no other case has claimed the Order, tracking number, or physical copies.

If any check fails, do not tender the package to USPS.

## 6. Tender, prove, and update Square

Tender the parcel to USPS within two business days after completed payment. Obtain carrier acceptance evidence, not merely a locally printed label. Preserve privately:

- label and tracking number;
- packed weight, service, postage, and packaging cost;
- USPS purchase receipt and acceptance scan or counter receipt;
- tendered time and ship-from location evidence; and
- any carrier exception or later delivery evidence needed for support.

Only after carrier acceptance, use Square's current shipment control to add the USPS tracking number and mark the fulfillment shipped/completed. Send the Square shipment or receipt update when the control is available. Verify the customer-facing record shows the correct items, merchandise subtotal, mandatory shipping, Florida tax when applicable, total, merchant identity, and support route. Do not change prices, tax, tender, or recipient during this update.

Record the Square update time and outcome privately. If the update result is ambiguous, do not click it again automatically. Preserve the screen-independent evidence available from Square, keep the package's carrier proof authoritative for physical tender, and escalate the Square status for review.

## 7. Book and reconcile the shipment privately

Square is the operational quantity source. The encrypted private inventory ledger remains the cost and accounting source. Preserve the exact Square exports and post the private entries using the approved chart of accounts:

- sale: debit `1110 Square Clearing`; credit `4040 Direct Physical Book Revenue`, `4070 Shipping Revenue`, and `2200 Sales and Other Taxes Payable`;
- Square fee: debit `6400 Bank and Merchant Fees`; credit `1110 Square Clearing`;
- payout: debit `1010 Operating Checking`; credit `1110 Square Clearing`;
- sold-copy cost: debit `5000 Production and Fulfillment Costs`; credit `1210 Finished Book Inventory` at weighted-average landed cost by SKU; and
- actual postage and packaging: debit `5000 Production and Fulfillment Costs`; credit the actual private cash/bank/payable source. Do not net this cost against `4070 Shipping Revenue`.

Do not invent a fee or payout before Square and bank evidence exists. The gross sale, fee, payout, tax liability, inventory movement, carrier cost, and deposit must reconcile to zero difference. Include the Florida taxable or out-of-state classification and DR-15 bridge treatment without copying a street address into the ledger.

Before ordinary customer fulfillment begins, `1110 Square Clearing` must have the separately evidenced activation and first-settlement behavior. If an unexpected paid order exists before that control is complete, preserve the sale and customer-service deadline, escalate the bookkeeping exception, and do not fabricate an accounting entry.

## 8. Exceptions and no-ship paths

| Condition | Required action |
|---|---|
| `PAYMENT_PROCESSING`, missing final recipient, or inventory adjustment still propagating | Wait for the approved Queue retry. Do not ship or manually change the state. |
| `HELD`, open review, address/jurisdiction/tax/amount/catalog mismatch, or negative/ambiguous inventory | Freeze the case. Reconcile current Square, worker, tax, and physical inventory evidence. Release only through a separately controlled resolution; otherwise refund. |
| `REFUNDED`, any refund before shipment, or canceled payment | Do not ship. Confirm the Square refund, reverse applicable tax, and reconcile inventory. |
| `DISPUTED` or suspected fraud | Do not ship unless the separately approved dispute resolution explicitly clears the order. Preserve all proof. |
| Customer requests a different address | Do not overwrite the bound address or hand-edit the label. Refund the unshipped order and require a new checkout. |
| Physical copy missing, damaged, wrong edition, or not accepted inventory | Substitute only another accepted copy of the same SKU. If unavailable, cancel/refund the affected order; never ship a proof or damaged copy. |
| Media Mail eligibility cannot be confirmed | Do not ship under Media Mail. Hold and refund unless a separate approved service path applies. |
| Actual postage plus packaging exceeds the charged band | Honor the paid order, record the variance, and review/increase the band before the next affected sale. Do not rebill the customer. |
| Two-business-day target will be missed | Record the reason, contact the customer through the approved support channel, and offer the available ship-or-refund resolution. |
| Square shipment update outcome is unknown | Do not retry blindly. Preserve carrier acceptance and Square evidence, then reconcile the current Order state. |

## 9. Returns, damage, wrong items, loss, and refunds

Route every request through `support@outsideinprint.org` and bind it to the original Square Order/Payment and private case.

### Unshipped cancellation

Cancel and refund through the original Square payment. Do not ship after initiating the refund. Confirm the tax reversal and Square inventory state; correct the private inventory movement only from evidence.

### Voluntary return

- Require contact and return authorization within 30 days after delivery.
- The buyer pays return postage. Do not refund original shipping.
- Inspect the returned copy before refund or restock.
- For an accepted resaleable copy, refund the book price and associated sales tax to the original payment method. Restore Square inventory and the private inventory ledger only after physical inspection.
- For a non-resaleable copy, do not restore inventory. Preserve the inspection/disposition evidence and apply the published refund terms.

### Damaged, lost, or wrong item

- Require a report within the published 14-day window and the Square Order ID; obtain package/book photographs for damage or a wrong item.
- When confirmed, replace from accepted inventory if available or refund the affected item and applicable original shipping. OIP pays reasonable return postage when a confirmed damaged or wrong item must be returned.
- A replacement creates no new revenue. Record the replacement inventory movement and its weighted-average cost to `5000`; add carrier cost separately. If a wrong copy returns in resaleable condition, restore only that exact SKU after inspection.

### Refund and inventory entries

For the approved refund, debit `4090 Sales Returns and Refunds` and debit `2200 Sales and Other Taxes Payable` for reversed tax; credit `1110 Square Clearing`. Record Square's actual fee treatment separately from evidence. Restore a resaleable returned copy by debiting `1210 Finished Book Inventory` and crediting `5000 Production and Fulfillment Costs` at the cost relieved on the original sale. Never restock a lost, customer-retained, non-resaleable, or unreceived copy.

After any refund or dispute, verify that the worker binding, Square Order/Payment, private order subledger, inventory movement, tax bridge, fee, payout, and bank settlement remain consistent. A refund does not authorize a cash or POS-drawer payment.

## 10. Close the case

Close only after the encrypted evidence packet contains:

- current Payment, Order, refund/dispute, and Square fulfillment evidence;
- worker binding/reservation/review status and relevant event evidence;
- exact SKU, catalog version, quantity, accepted-copy movement, and weighted-average cost;
- final address and customer contact evidence stored privately, with only state/county and address HMAC outside the address record;
- packed weight, Media Mail label, postage, tracking, receipt, carrier acceptance, and ship time;
- customer receipt/shipment-notification outcome;
- gross sale, physical revenue, shipping revenue, tax, fee, payout, carrier cost, COGS, inventory, and bank reconciliation;
- return, damage, replacement, refund, or dispute evidence when applicable; and
- one packet digest, opaque evidence ID, covered dates, retention date, and verified private-vault recovery status.

The case status must say what actually happened: shipped, refunded before shipment, returned/restocked, returned/not restocked, replaced, lost/claim open, disputed, or unresolved. Never close an uncertain outcome as successful.
