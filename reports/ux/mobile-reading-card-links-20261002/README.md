# Mobile reading-card links ~ October 2, 2026

Option 1 expands the existing native title anchor across each content preview with CSS. The title remains the accessible link name; summary, metadata, and blank space activate that same anchor. Secondary anchors and magnifier buttons sit above its hit area. Collection-list links also cover the numbered row's existing outer padding.

The change covers the five homepage featured pieces, shared Library/Archive/collection reading previews, dynamic Library results, and collection directory records. Existing whole-link collection grid cards retain their behavior. Forms, checkout, and other multi-action blocks are outside this opt-in class.

Base: `f7bb430bb27cb8ed33cdc101acf462b715c15218` (PR #133 already included). Implementation uses the isolated `codex/mobile-reading-card-links-20261002` worktree. The original dirty checkout was preserved.

## Verification

- Chromium touch/phone emulation at 320, 360, 375, 390, 414, and 430 CSS pixels; 1280 and 1440 desktop-width checks. Six surfaces: home, Library, Archive, Collections directory, Modern Bios, and Simple Logic.
- 480 summary, metadata, and blank-area hit checks; 136 magnifier target checks. No horizontal overflow. Magnifiers retain at least 44×44 CSS pixels.
- Native homepage summary and blank-area taps for all five featured cards; metadata tap; visible whole-card 3px keyboard focus; Enter navigation. All five magnifiers open and close independently using the close button, Escape, illustration, or keyboard, with focus returning to the opener.
- Shared Library/Archive/collection navigation, collection-row padding, directory Start here, collection links, source credits, and license links. Zoom opens/closes without article navigation or article promo events.
- Dynamic Library Browse all, Next/Previous, search, reset, and type/year/collection filters. Regenerated cards retain the same native link, image control, and independent photo credit.
- Original configured analytics slots record one event per article activation, using the real analytics script with an isolated local counter. Archive's existing uninstrumented links remain uninstrumented. Zoom and secondary links do not count as article activations.
- Touch dragging from article summary scrolls without navigation or click analytics. The desktop-width layout and screenshots passed; separate desktop/no-JavaScript contexts aborted navigation in this harness and remain unconfirmed.
- Pinned Hugo 0.164.0 production build using an existing warm image cache; eight Library tests; seven homepage output tests; discovery source contract; public route and fresh HTML output checks; responsive-image output contract; `git diff --check`.

The local discovery date assertion is sensitive to CRLF. It passed using LF endings for unchanged Terms text in the isolated checkout; that accommodation is excluded from the PR.

Browser evidence is emulation, not actual iOS Safari or Android Chrome. Those devices and their native long-press menus were unavailable. The implementation retains ordinary `href` anchors and adds no card-navigation JavaScript, touch handlers, or `preventDefault` calls.

The browser harness timed out waiting for a Ctrl-click `popup` event. Native new-tab behavior is unconfirmed in this harness and should receive a manual check before merge; the implementation retains real anchors with no modifier-key interception.

Image rendering markup, sources, crops, responsive sizes, and existing lightbox code are unchanged. External-link destinations and analytics were isolated during browser checks. No real signup, email, purchase, or provider change was performed.

## Screenshots

- [Phone homepage, 390px](home-390.png)
- [Phone whole-card keyboard focus, 390px](home-focus-390.png)
- [Filtered Library portrait with independent magnifier and credits, 390px](library-filtered-390.png)
- [Desktop homepage, 1440px](home-desktop-1440.png)

The fuller browser transcripts and reproducible verification snippets are kept in `C:/Users/lawto/Documents/40_Scratch/2026-10/mobile-reading-card-links-20261002/`.

This is a draft review change. Merge and deployment remain pending user direction.
