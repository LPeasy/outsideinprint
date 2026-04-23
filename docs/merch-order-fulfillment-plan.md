# Merch Order Fulfillment Plan

Date: 2026-04-23

Status: Future work only. This system is not implemented or live.

## Summary

Outside In Print currently uses static Hugo shop pages and Stripe Payment Links for merch checkout. There is no automated order intake, no private order workspace, and no shipping-label generation workflow in the repo today.

When this work starts, the recommended architecture is:

`Stripe Payment Links -> Cloudflare Worker webhook bridge -> local-only /orders/ export -> draft shipping label and packing slip generation`

This keeps checkout on Stripe, keeps customer shipping data out of tracked site content, and gives the operator a local fulfillment workspace for manual packing and shipment.

## Current State Snapshot

- The public shop is a static Hugo surface.
- Checkout is expected to stay on Stripe Payment Links.
- Manual fulfillment remains the operating model.
- No hosted webhook receiver exists yet.
- No `/orders/` folder contract exists yet.
- No label generation or shipping-carrier integration exists yet.

## Recommended Architecture

### Recommended COA

Use Stripe Payment Links for checkout, then receive completed orders through a small hosted Cloudflare Worker that verifies Stripe webhook events and normalizes them into a private order record. A local sync command then exports new ready orders into a gitignored `/orders/` folder, where draft shipping labels and packing slips are generated for manual fulfillment.

Why this is the default:

- Stripe recommends webhook-driven fulfillment for Checkout.
- GitHub Pages is static hosting, so the site itself cannot safely receive Stripe webhooks.
- The operator wants a local private order workspace instead of storing shipping details in tracked repo files.
- v1 should reduce manual copy/paste work without automating postage purchase.

### Alternate COAs

1. Hosted webhook bridge plus real shipping API label purchase
   - Higher automation.
   - Better fit if order volume grows.
   - More secrets, more moving parts, and more failure modes than v1 needs.

2. Local Stripe sync only
   - Lower implementation effort.
   - Works without any hosted component.
   - Less aligned with Stripe's recommended webhook-first fulfillment model.

## Implementation Contract

### Stripe Checkout and Payment Links

- Keep Stripe Payment Links as the storefront checkout surface.
- Configure links to collect:
  - shipping address
  - customer name
  - customer phone number
  - U.S.-only shipping countries unless the fulfillment scope expands later
- Use Stripe metadata only for non-PII internal identifiers:
  - `oip_product_slug`
  - `oip_variant`
  - `oip_fulfillment_profile`
  - optional `oip_inventory_bucket`
- Do not store shipping data in Stripe metadata.
- If stock limits matter, use Payment Link inventory limits where practical.

### Hosted Webhook Bridge

- Default stack: Cloudflare Worker.
- Required webhook endpoint:
  - `POST /stripe/webhook`
- Required event handling:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
- Required behavior:
  - verify Stripe webhook signatures
  - dedupe on `event.id`
  - separately dedupe or lock on `checkout_session_id`
  - fetch the Checkout Session with line items
  - confirm payment status before creating a fulfillable order
  - return quickly and avoid heavy work inside the webhook request path

### Local `/orders/` Workspace

This folder must remain local-only and gitignored when implementation begins.

Recommended folder contract:

- `/orders/_config/shipping-profile.json`
- `/orders/_state/sync-state.json`
- `/orders/<year>/<order-id>/order.json`
- `/orders/<year>/<order-id>/stripe-session.json`
- `/orders/<year>/<order-id>/packing-slip.md`
- `/orders/<year>/<order-id>/label-draft.pdf`
- `/orders/<year>/<order-id>/carrier-import.csv`

Required local commands:

- `sync_shop_orders.ps1`
- `complete_shop_order.ps1`

### Order Record Contract

`order.json` should include:

- `order_id`
- `created_at`
- `status`
- `stripe.event_id`
- `stripe.session_id`
- `stripe.payment_link_id`
- `customer.name`
- `customer.email`
- `customer.phone`
- `shipping.name`
- `shipping.address`
- `items[]` with `product_slug`, `variant`, `quantity`, `unit_amount`, and `currency`
- `totals.subtotal`
- `totals.amount_total`
- `fulfillment.exported_at`
- `fulfillment.fulfilled_at`

### Fulfillment Flow

1. Customer completes purchase through a Stripe Payment Link.
2. Stripe sends webhook events to the Cloudflare Worker.
3. The Worker verifies, dedupes, and stores a normalized order record.
4. A local sync command exports ready orders into `/orders/`.
5. The local workflow generates:
   - a draft 4x6 shipping label PDF marked `POSTAGE NOT PURCHASED`
   - a packing slip
   - a carrier-import CSV
6. The operator buys postage manually, packs the order, and marks it fulfilled locally.

## Privacy and Safety Rules

- `/orders/` must stay local-only and must not be committed.
- Customer shipping details must not be stored in tracked site content, front matter, `data/`, or other committed repo files.
- Do not treat a success page redirect as the source of truth for fulfillment.
- Do not store card data or payment method details in repo files.

## Prerequisites for Later Implementation

- Stripe Payment Links must be configured to collect shipping information.
- A hosted Cloudflare Worker project must exist for Stripe webhook intake.
- Secret management must be defined for Stripe webhook signing secrets and Stripe API access.
- `.gitignore` must be updated to exclude `/orders/` before any local order exports are created.
- A shipping profile contract must be defined for sender and return-address data.

## Sources Reviewed

- Stripe Checkout fulfillment: <https://docs.stripe.com/checkout/fulfillment>
- Stripe Payment Links customization: <https://docs.stripe.com/payment-links/customize>
- Stripe webhooks: <https://docs.stripe.com/webhooks>
- Stripe metadata: <https://docs.stripe.com/metadata>
- Stripe metadata use cases: <https://docs.stripe.com/metadata/use-cases>
- GitHub Pages static hosting: <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
- Shippo shipments: <https://docs.goshippo.com/docs/Shipments/Shipments>
- Shippo label purchase example: <https://docs.goshippo.com/docs/carriers/integration_guides/apg/purchase_label/>

## Deferred Work Note

This document is the canonical saved plan for merch order intake and fulfillment automation. It exists so future work can resume without re-deriving the architecture, tradeoffs, and privacy constraints. Until implementation starts, treat this as design intent only.
