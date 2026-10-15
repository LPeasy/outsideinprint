# Buttondown follow-up: Worker signup blocked by firewall

Sent to Buttondown support on October 15, 2026 after explicit owner authorization. The private delivery receipt remains outside Git. A provider diagnosis is pending; no signup retry or firewall change followed the send.

We are testing an isolated Cloudflare Worker for Outside In Print newsletter signups. New requests explicitly use `type: "unactivated"`, a stable idempotency key, the existing newsletter tag, native UTM fields, and a random reference in metadata. Our first controlled Worker signup at **2026-10-15 16:18:25 UTC** returned **HTTP 400**, code **`subscriber_blocked`**, with this detail:

> This subscriber was blocked by your firewall.

Error metadata was empty. The newsletter's observed auditing mode is `aggressive`. We have not retried the signup, changed the firewall, or switched the public forms. The public forms retain their existing Buttondown path.

The Worker successfully fetched the complete nine-record subscriber list. The stored rejected POST confirms the correct newsletter, designated test address, `unactivated` type and signup-reference metadata, with a Cloudflare source IP and no visitor-IP field. `CF-Connecting-IP`, `x-real-ip`, `True-Client-IP`, and `Forwarded` were absent. These comparisons stayed in memory; we retained no raw IP addresses or header maps.

Visitor-IP forwarding and `X-Buttondown-Bypass-Firewall` have **not** been approved or enabled. We want to preserve double opt-in and anti-spam protection.

Please confirm:

1. What supported configuration permits legitimate public signup requests from a Cloudflare Worker under these constraints? Was this rejection caused by shared proxy-IP reputation, the test address, or another firewall condition?
2. Does the idempotency key cache this HTTP 400 `subscriber_blocked` response? After correcting the cause, will the same key reevaluate the request, and what is the cache retention period? If a fresh key is required, what supported verification should precede that deliberate new attempt? Exact subscriber lookup returned 404 after the rejection; we have not retried.
3. What is this newsletter's effective daily `POST /v1/subscribers` allowance, its reset window, and whether duplicate requests, same-key retries, and pending resubscriptions consume it? The documented default is 100 requests/day; observed GET headers show only the separate general limit. The account/newsletter API exposes no creation-quota field, and API request details do not include response rate-limit headers.

We can provide the request identifier privately if needed. Subscriber identities, credentials, and raw API bodies are deliberately excluded from this document.
