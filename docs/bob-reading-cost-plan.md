# Bob reading: initial cost and spending controls

Verified 2026-10-14. This is a production-preparation recommendation, not a deployment, subscription purchase, or account-setting change. USD figures exclude tax and unrelated account workloads.

## Recommended starting budget

Use configurable **$0.50 per UTC day and $5 per UTC calendar month for OpenAI**, enforced by Bob before dispatch. Whichever cap runs out first stops new model calls. Keep collection browsing and previews available. These are OpenAI caps, not a cap on Cloudflare charges.

Use a dedicated OpenAI project and add an enforced monthly provider limit as secondary protection, plus warning alerts. Current documentation distinguishes alerts, which allow traffic to continue, from explicit hard limits, which return 429 errors. Enforcement can lag and recorded spend can slightly exceed the hard limit. Do not describe all project budgets as alert-only or assume the account's hard limit is already enabled. [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits)

## Recorded usage and expected scale

Nine non-reused prior response receipts contain 18,660 input and 655 output tokens: means of 2,073 input and 73 output tokens per call. At current GPT-6 Luna Standard short-input rates, the sample costs $0.0021935 if all input is ordinary uncached input, or $0.0026600 if all input is charged at the higher cache-write rate. That is approximately **$0.24–$0.30 per 1,000 comparable calls** before cache savings. A $5 monthly allowance corresponds to roughly 16,900–20,500 comparable calls; this is a small-sample illustration, not a traffic guarantee. [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)

Rates per million tokens: ordinary input $0.10; cache read $0.01; cache write $0.125; output $0.50. No tools, search, image generation, or other billable features are enabled by this plan. The coordinator freshly checked the pricing page. Unknown failed-call usage is not treated as free. Reused test cases and a separate diagnostic were excluded from the average; a billed empty result was included. Sanitized calculations are in the preview's `output/production-cost-review/token-cost-evidence.json`.

## Enforce a conservative reservation

Before each paid call, atomically reserve against both durable daily and monthly ledgers:

`reserveUSD = inputTokenUpperBound * 0.125 / 1_000_000 + maxOutputTokens * 0.50 / 1_000_000`

Round upward in integer monetary units. Include instructions, schema, candidates, reference, history, and framing in the input bound. A character-count/4 estimate is not a hard upper bound. This candidate counts every UTF-8 byte of the full serialized request and adds 4,096 tokens for framing, rejecting payloads over 65,536 bytes. With `max_output_tokens: 500`, the largest allowed request reserves **$0.008954**. That permits 55 such fully charged reservations/day or 558/month; ordinary successful calls release excess reservations after trustworthy usage is available. This is deliberately more conservative than the measured per-call cost above.

Reservations must survive concurrency, restarts, timeouts, and UTC boundaries. Settle each reservation once. Retain it when billing is unknown, including abort/timeout or malformed output without valid usage. Release unused amounts only when validated usage proves a lower charge; retain the conservative input rate if cache categories are absent. Check caps including outstanding reservations, meter manual retries separately, and keep a kill switch. The ledger controls Bob's requests only; protect the dedicated key from other consumers. Model or price changes require a rate/bound review.

## Cloudflare plan choice

SQLite Durable Objects work on Workers Free. Start there only if the deployed bundle fits the 10ms Worker CPU limit under representative worst-case retrieval. Otherwise recommend Workers Paid: **$5/account/month minimum**, shared across the account, with overage billed separately. With the OpenAI cap, paid hosting suggests about **$10/month before Cloudflare overages/tax**, not an all-provider hard maximum. Current plan/account usage has not been inspected. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

| Resource | Free allowance | Paid allowance and overage |
|---|---:|---:|
| Worker requests | 100,000/day | 10 million/month; $0.30/additional million |
| Worker CPU | 10ms/invocation | 30 million ms/month; $0.02/additional million ms |
| DO requests | 100,000/day | 1 million/month; $0.15/additional million |
| DO active duration | 13,000 GB-s/day | 400,000 GB-s/month; $12.50/additional million GB-s |
| SQLite rows read | 5 million/day | 25 billion/month; $0.001/additional million |
| SQLite rows written | 100,000/day | 50 million/month; $1/additional million |
| SQLite storage | 5GB/account | 5GB-month; $0.20/additional GB-month |

Free Durable Object operations fail at the relevant allowance; daily limits reset at 00:00 UTC. Duration is active wall-clock billing, including non-hibernating waits. Keep the budget object as a brief reserve/settle service rather than holding it open throughout OpenAI requests. Bound ledger growth and avoid raw prompts/IPs in operational storage. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

Use `wrangler dev` with local storage and mocked outbound OpenAI calls for quota/concurrency tests. Pin Wrangler and its compatibility date. Current docs prefer a SQLite Durable Object declaration in `exports`; legacy `migrations` with `new_sqlite_classes` remains documented for compatible older configurations. They are mutually exclusive. Validate the chosen format with the pinned toolchain. [DO local development](https://developers.cloudflare.com/durable-objects/get-started/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

No paid model call, credential read, deployment, or account mutation was made for this cost review.
