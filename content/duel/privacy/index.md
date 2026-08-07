---
title: "Duel Privacy Policy"
description: "How Outside in Print LLC handles information in the Duel iPhone app."
draft: false
type: "duel"
show_citation: false
section_label: "Duel for iPhone"
lastmod: 2026-08-03
---

**Effective date: August 3, 2026**

Outside in Print LLC (“Outside in Print,” “we,” or “us”) operates the Duel iPhone app. This policy explains how Duel handles information. It applies to the Duel app, not to separate websites or services.

## Summary

Duel does not contain advertising SDKs, third-party analytics SDKs, or a developer-operated gameplay backend. Most gameplay, settings, progression, purchase-entitlement, and diagnostic information stays on the participating iPhones. Apple processes Game Center and App Store purchases. Nearby matches exchange limited gameplay information directly between the two phones.

Duel does not use app information for cross-app tracking or sell app information to data brokers.

## Information stored on your device

Depending on the features you use, Duel stores information needed to operate the app, including:

- a locally generated nearby-player name;
- tutorial state, appearance choices, accessibility preferences, and other settings;
- your Game Center player ID and display name when you use Game Center;
- match dates, player summaries, outcomes, winner identifiers, ranked-status and capability tags, confidence and distance buckets, angular-error summaries, and leaderboard-submission status;
- rankings, progression, virtual currency earned through gameplay, cosmetic inventory, and equipped items;
- App Store product and transaction identifiers, purchase dates, entitlement status, and refund or revocation dates; and
- local diagnostic events about tutorial progress, app flow, readiness checks, match results, outfitter actions, and purchase status.

These records are stored in Duel’s app container. Depending on your Apple device-backup settings, Apple may include app data in a device backup.

## Motion and Nearby Interaction

During a local duel, Duel uses Core Motion to estimate phone orientation and stability and Nearby Interaction to estimate direction and distance between participating phones.

Duel does not store continuous raw Motion or Nearby Interaction streams. It does not record audio or video, and its current Nearby Interaction configuration does not use camera assistance. Duel stores only derived match summaries such as confidence, distance range, and angular error.

## Information shared with a nearby opponent

To discover and run a nearby match, Duel uses Bluetooth and the local network. Nearby devices may see that a Duel device is available and its locally generated peer name.

Once connected, the two phones exchange an opaque Nearby Interaction token, countdown timing, player identifiers, one-shot aim and nearby-device measurements, confidence information, and interruption status. Duel requests encrypted Multipeer Connectivity transport.

This exchange is direct between the participating phones, not through an Outside in Print server. The other participant’s device may retain a derived match record containing your peer name or identifier and the result. Because Outside in Print does not receive those records, we cannot remotely erase a copy stored on another participant’s phone.

## Game Center

Game Center is optional for local play but required for Duel’s Game Center leaderboard features. When you use it, Duel receives your Game Center player identifier and display name, loads leaderboard entries, and may submit a valid ranked-win score. Your Game Center nickname and scores may be visible to other Game Center users according to your Apple settings.

Apple processes Game Center information under [Apple’s Game Center & Privacy notice](https://www.apple.com/legal/privacy/data/en/game-center/). You manage the underlying Game Center account and its privacy choices through Apple.

## Purchases

Optional cosmetic purchases use Apple’s In-App Purchase system. Apple processes your Apple Account, payment method, billing, fraud-prevention, purchase-history, and refund information. Duel and Outside in Print do not receive your full payment-card or bank-account details.

Duel receives StoreKit product, transaction, purchase-date, entitlement, and refund-status information so it can unlock, restore, or revoke cosmetics. Apple may also make App Store sales, transaction, refund, and financial reports available to Outside in Print for support, accounting, and legal compliance.

Apple handles this information under [Apple’s App Store & Privacy notice](https://www.apple.com/legal/privacy/data/en/app-store/).

## Analytics and diagnostics

Duel records validation and product-interaction events locally on the device. The current app does not upload these events to Outside in Print or a third-party analytics service.

Apple may collect device analytics, crash information, and App Store usage under your Apple privacy and analytics settings and may provide developers with aggregated or diagnostic reports.

## Support communications

If you email us, we receive the email address, message, attachments, and other information you choose to provide. We use it to respond, troubleshoot, prevent abuse, and keep records where legally required. Email and website service providers may process this information on our behalf.

## Retention and deletion

Duel’s on-device records remain until you delete the app or its data. Duel currently has no separate in-app erase command. Deleting Duel removes its local app container, subject to any device backups controlled through your Apple settings.

Non-consumable purchases remain in Apple’s purchase history and may be restored after reinstallation. Game Center and App Store records are retained and managed by Apple under Apple’s policies.

We retain support correspondence and business records only as long as reasonably needed for support, security, accounting, tax, and legal obligations. To request access, correction, or deletion of information held directly by Outside in Print, contact us. We may need to verify the request. We cannot delete information controlled solely by Apple or stored only on another player’s phone.

## Your choices

You may:

- continue without Game Center where Duel offers offline play;
- manage Game Center, App Store, analytics, and backup choices in Apple settings;
- deny or later disable Motion, Bluetooth, Nearby Interaction, or Local Network access, although nearby-duel features may stop working;
- delete Duel to remove its local app data; and
- contact us about information held directly by Outside in Print.

## Security

We use the safeguards provided by iOS and request encrypted transport for nearby Duel connections. No system can guarantee absolute security.

## Changes

We may update this policy as Duel changes. We will post the revised policy here and update its effective date. We will provide additional notice when required by law.

## Contact

Outside in Print LLC  
[support@outsideinprint.org](mailto:support@outsideinprint.org)
