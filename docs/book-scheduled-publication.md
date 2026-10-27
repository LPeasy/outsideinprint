# Scheduled direct e-book publication

This contract extends the existing bookstore and private EPUB delivery service to
an owner-authorized future book release. The public site uses the shared cloud
schedule in [scheduled publication](scheduled-publication.md). Commerce is deployed
separately before release; no local computer is needed at the release instant.

## Prepare the approved edition

- Freeze the approved EPUB, cover and sample bytes, price, metadata and image-use
  record. Preserve the full EPUB in private storage, never in the public Git repo.
- Use truthful identifier metadata. An unassigned ISBN must remain unassigned;
  the historical per-title ISBN procedures are not evidence of an assignment.
- Add the bookstore product, managed cover, product page and approved reading
  sample. Both public pages use the same future `publishDate`. Retain the current
  featured book and existing offers unless the owner requests a change.
- For an authorized feature at release, set the shop index's optional
  `featured_book_on_release` to the new book key. It replaces `featured_book`
  only when that book exists among Hugo's published shop pages; the current
  feature stays in place beforehand. Bind the index and feature templates to
  the release registration and verify the featured title in its bookstore check.
- Register a matching server-owned product in `workers/oip-commerce/src/catalog.js`
  with its fixed SKU, USD price, private R2 key and download filename.
- For a timed offer, set `releaseNotBefore` to the approved instant. Bind the book's
  canonical product page and any required prior publications in
  `requiredPublications`, with their identifying headings. These are fixed
  first-party URLs, never customer input.

## Private commerce readiness

Create or verify the exact production Square item variation and price, upload the
approved EPUB to a new private object key, then read it back and compare its hash.
Preserve all other titles and configuration. Add the exact variation mapping and
enabled SKU to both production deployments only after this title's package and
provider setup are verified. Deploy the reviewed consumer before Pages, preserving
existing secret bindings, monitoring, fulfillment and other gates. Store provider
IDs, complete before/after settings and deployment receipts privately.

The checkout gate runs before Square calls and before returning a cached checkout
link. It requires the actual time to reach `releaseNotBefore` and all listed pages
to return canonical, identifying HTML. Its requests and response sizes are bounded;
timeouts, redirects, missing pages and mismatched pages leave sales closed. It does
not send test emails or make purchases. Existing issued Square links remain under
Square's control, so do not create a live link for the new SKU before release.

## Queue and verify

Finish the targeted storefront/sample source checks and the release-gate tests.
Review the original cover and register its approved managed image. A new schedule
does not require a second EPUB build or a whole-library local image audit.

After private commerce readiness passes, stage the intended website payload and
register it with `scripts/ci/scheduled_releases.mjs`. Bind the exact product/sample
sources, catalog, cover and required prior-publication sources. Declare the book,
sample, bookstore and dependency page checks. Use the normal checked PR, reviewed
diff and owner-authorized auto-merge flow. Confirm the queue deployment and
pre-release dormancy before marking the package Scheduled.

The timed GitHub build publishes eligible product/sample pages. Verify the exact
production commit/time receipt and bounded scheduled-page checks. The server-side
gate independently refuses sales until its required pages are live. This is a
current-publication check, not a substitute for the GitHub deployment receipt.
Record Published only from actual release evidence. Failed setup or deployment
requires diagnosis; do not silently retry or claim readiness from the calendar.

No subscriber email, purchase, refund, test fulfillment, new infrastructure or
change to another title is authorized by this contract.
