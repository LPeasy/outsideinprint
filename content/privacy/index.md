---
title: "Privacy Policy"
description: "How Outside In Print handles site use, newsletter subscriptions and campaign attribution, Studio inquiry emails, Steam storefront visits, orders, EPUB delivery, and reader support."
effective_date: "October 15, 2026"
type: "commerce-policy"
draft: false
show_citation: false
---

## Information involved

When you check out through Square, Square collects the payment and contact information needed to process the transaction. Outside In Print does not receive your full card number or card-security code.

For an EPUB order, the delivery service processes the email address supplied to Square long enough to send the secure download message. It stores limited fulfillment records, such as the Square order identifier, product SKU, delivery status, email hash, download-token hash, expiration, and download count.

When you use a standalone Bob's Almanack signup form, your browser sends the email address and newsletter signup information to Buttondown. When newsletter campaign attribution is enabled, the request passes through Outside In Print's signup service, hosted by Cloudflare. Otherwise, the form sends it directly to Buttondown. For a new subscription, the attribution service requests pending status and asks you to confirm through Buttondown's confirmation email. It counts a new confirmed subscription only after confirmation is established. Submitting a form alone does not confirm a subscription. The service also sends Buttondown approved campaign fields and a random signup reference to connect the request with its later confirmation.

Buttondown records subscription and confirmation details. Direct signup requests may also provide signup metadata such as the time, IP address, browser or device information, and referring page. Buttondown processes delivery information such as successful deliveries, bounces, complaints, and unsubscribes. If engagement measurement is enabled in Outside In Print's Buttondown settings, Buttondown may also process message-open or link-click information and associated email-client, browser, device, IP-address, or referrer metadata.

The attribution service keeps a private record of the random signup reference, Buttondown subscriber identifier, approved campaign code, cleaned landing-page path, subscription status, timestamps, confirmation evidence, and test-record classification. These identifiers are pseudonymous: they can be connected to a subscriber through Buttondown. The attribution database and application logs do not store email addresses, email hashes, IP addresses, full referring URLs, or raw signup and webhook bodies. Email addresses pass through the subscription transaction to Buttondown.

Before EPUB checkout, you may separately choose to receive Bob's Almanack, new-publication notices, both, or neither. These choices are optional and are not required to buy. If you select either choice, Outside In Print sends the email address, the selected preference tags, and the embedded-form signup fields to Buttondown, which sends a confirmation message and manages subscription preferences and unsubscribes. The same delivery and, when enabled, engagement information described above may apply. Transactional EPUB delivery through Resend remains separate from these optional emails.

For reader support, Outside In Print receives transaction identifiers, amount, status, and subscription status needed for reconciliation, cancellation support, and refunds. No reader-support amount is sent to site analytics.

When you enter information in the Studio inquiry form, the form does not send the inquiry-field contents to Outside In Print, a hosted form provider, or site analytics. Selecting “Prepare inquiry email” passes those contents to your configured email application or provider through a `mailto:` draft; that application or provider may store or sync the draft under its own privacy practices. Outside In Print receives the information only if you send the message and it reaches `support@outsideinprint.org`. The public Studio page does not accept uploaded source files.

## Site analytics

Outside In Print uses GoatCounter to understand aggregate site use and events such as a bookstore visit, sample-link click, or checkout start. Analytics may include a page path and title, product SKU, format, source position, and a broad referral label such as search, newsletter, social, or internal navigation. Fixed labels can identify approved newsletter and publication campaigns. The site removes URL query strings and fragments from analytics page paths and does not send complete external referrer URLs or arbitrary campaign values. Analytics events do not include an order identifier, payment amount, email address, street address, or card information.

When newsletter campaign attribution and its storage option are enabled, the site remembers the latest approved campaign tags and cleaned landing-page path in the current browser tab's session storage. That attribution expires after 30 minutes of inactivity. Ordinary internal navigation does not replace it. This feature uses no persistent marketing cookie, browser fingerprint, cross-device matching, or email-based visitor tracking. Existing newsletter campaign labels used by GoatCounter may also use a fixed 30-minute session-storage period.

Reading events use active time and scroll depth as an approximate engagement signal. A checkout-start event does not confirm a purchase, and a newsletter-submit event does not confirm a subscription.

For Studio use, site analytics may receive the Studio page path, offer code, source slot, format, and a draft-prepare or direct-email event. They do not receive the inquiry name, reply email, website, project subject, or written answer. A draft-prepare or direct-email event does not prove that a message was sent or received.

## How information is used

Information is used to:

- process, fulfill, and support transactions;
- review and respond to Studio inquiries, screen for conflicts, and prepare a possible written scope;
- deliver EPUBs and control download links;
- deliver the newsletter, maintain subscription choices, and measure which approved campaigns lead to confirmed subscriptions;
- calculate, reconcile, file, and document taxes;
- maintain accounting records;
- detect duplicate, fraudulent, disputed, or refunded transactions; and
- improve the bookstore without advertising-profile tracking.

## Service providers and disclosure

Square processes checkout, payments, subscriptions, receipts, refunds, and related transaction records. Cloudflare hosts the secure delivery service and its limited fulfillment data, and the separate newsletter attribution service and its private records when enabled. Resend sends EPUB delivery messages. Buttondown receives and manages optional Bob's Almanack and new-publication subscriptions, including the subscription, delivery, and enabled engagement information described above. GitHub Pages hosts the public website, and GoatCounter provides aggregate site analytics.

The Games pages link to Steam storefront pages and may load a Steam store widget. Following a Steam link or loading the widget sends a request to Valve's Steam services, which receives the technical information ordinarily sent with a web request. Steam may also set or read cookies according to your Steam settings and Valve's own privacy practices.

Any Steam checkout, account sign-in, payment, game license, or download takes place on Steam and remains under Valve's control. Outside In Print does not receive your Steam password, full payment-card details, or Steam license through these links or the widget.

Outside In Print does not sell or rent personal information. Information may be disclosed when required by law, to protect the site and its customers, or to the service providers needed to complete the functions described above.

## Retention and security

Download links expire after 14 days and five successful downloads. Transaction, refund, accounting, and tax evidence may be retained for up to seven years. Received Studio inquiries and other business correspondence are kept only as long as reasonably needed for review, response, scope preparation, recordkeeping, security, or legal obligations. Other operational records are kept only as long as reasonably needed for fulfillment, support, security, or legal obligations.

For newsletter attribution, detailed signup-attempt and event records are retained for 90 days, then replaced by aggregate totals. A minimal subscriber record, including the provider identifier, original campaign, subscription status, and first-confirmation evidence, is retained while the corresponding Buttondown record remains. When provider deletion is verified, the linked individual records and private exports are removed; aggregate totals that no longer identify a subscriber may remain. Unsubscribing changes delivery status and does not erase an earlier acquisition or delete the subscriber record.

Outside In Print limits access to commerce and newsletter attribution records and keeps payment credentials and service secrets outside the public website repository. No internet service can guarantee absolute security.

## Your choices

To prevent the newsletter attribution service from carrying campaign information between pages, you can enable your browser's Global Privacy Control or Do Not Track signal, or block session storage. These controls disable only this service's tab storage. If storage is unavailable or disallowed, a signup may use approved campaign tags on the current page; otherwise its campaign is recorded as unknown. With tab storage disabled, opening a link without campaign tags before signing up also avoids that current-page campaign assignment. These choices do not prevent a newsletter signup.

You may ask about, correct, or request deletion of information held directly by Outside In Print, subject to transaction, tax, fraud-prevention, and legal retention duties. You can unsubscribe through the link in any Buttondown message or contact Outside In Print to change which optional messages you receive. Unsubscribing stops the selected emails but is not the same as deleting subscription records. To request deletion, contact Outside In Print; Buttondown, Square, and other service providers also maintain their own privacy processes for information they control.

## Contact

Email [support@outsideinprint.org](mailto:support@outsideinprint.org) with a privacy question. Do not email card numbers, passwords, identity documents, or other sensitive credentials.

This policy may be revised when the storefront, service providers, or legal requirements change. The effective date above identifies the current version.
