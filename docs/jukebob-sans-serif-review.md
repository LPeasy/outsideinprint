# Sans Serif / JukeBob review — 2026-10-28

The owner approved the reviewed demo and authorized live website publication on
2026-10-28, with a final change to use a standard two-bar pause icon. This approval
includes the final album covers and website presentation. Steam publication and
changes to Bob's model and spending limits remain outside this release.

## Package and source

- Downloaded `Sans-Serif-JukeBob-Windows.zip` through the connected Google Drive
  tools: [source package](https://drive.google.com/file/d/1yElQ5NtyAkFYHCYxkJPOi0p9163BBYMI/view).
- ZIP SHA-256: `8bbbe81fe2b72c8ea1efc1cc70e858b754068d603ead8bff5f8cae6bb8312727`.
- Extracted into a newly created dedicated Windows folder, with archive paths
  checked for traversal and no overwriting. Read the implementation plan and
  verifier before running `Verify-Package.ps1`: seven MP3s and the approved cover
  passed. Manifest byte counts also matched.
- OIP base: `aa45c28828b11888b54e5189219a30e3d3e5ab76`.
- Maintained Idle Times base: `cd5c3bf8103cd83f1a1b20065d4e1d9555db618f`;
  its eight deployed source hashes matched before editing. Isolated source commit:
  `2ea38a59ea542b6d85dee94efd5887ab5f8d49a3`.
- Idle Times has no configured Git remote. Its reviewable source change is
  included as [an applyable Git patch](runtime-source/0001-Add-album-aware-JukeBob-controller-and-mobile-readin.patch)
  against that base. The Windows source worktree retains the commit.
- The initial runtime export recorded the clean source commit, implementation
  hashes, website catalog hash, and 56 files (81,648,994 bytes). Exported payload
  hashes and lengths passed before installation. Later catalog/art refreshes
  retain that source provenance and update only media/catalog records and totals.

## Behavior

`data/music.json` owns album order, stable IDs, titles, artists, durations and
asset paths. `scripts/generate_music_catalog.py` produces the version-1 runtime
playlist. `/music/` reads the same source and appears immediately after Games
under Explore, including mobile navigation.

Sans Serif is first, The Fine Print, Vol. 1 second. New listeners start with
Chairman selected; existing valid track and sound preferences remain valid.
Browsing album cards does not change playback or fetch MP3s. Each visit to Music
opens Sans Serif for browsing. Playback never starts automatically on reload.

The cabinet, compact controls, Music page and Media Session share one audio
element. Direct same-origin actions preserve the trusted click stack for mobile
Play. State follows native playback events and rejected play promises. Previous,
Next, ended wrapping and shuffle stay within the playing album.

Compact controls first appear after successful playback. Pausing them leaves
them visible. Opening the cabinet conceals them. Explicitly closing a paused
cabinet dismisses them until playback resumes; closing a playing cabinet reveals
them. Typing, menus, navigation and Hide do not manufacture a paused dismissal.
Hide keeps music and compact controls available at the bottom-right; Show Bob
restores their anchor to Bob. The arcade retains its suspend/resume behavior.

The cabinet artwork remains intact. Persistent controls are a skinny dark speaker
with brass/wood trim, stacked transport buttons and an accessible Browse albums
icon. Desktop controls measure 44 × 145px; coarse-touch controls use a 48 × 198px
speaker with 44px targets. They prefer Bob's right side with a 6px gap from the
painted sprite, ignoring the transparent canvas padding, and use bounded edge
fallbacks. On hover-capable devices they are fully transparent and do not
intercept pointer clicks while idle. Moving near Bob or the speaker reveals them;
hover and keyboard focus also keep them visible. Touch devices remain opaque.
Reduced-motion preferences remove the fade. Volume remains inside the cabinet and Music
page. Sans Serif MP3s are unchanged; full-frame cover derivatives are 320, 640 and
960px WebP. The original cover is retained under nonpublic `assets/music/`.

The final placement correction reads painted canvas bounds only while compact
controls are eligible, at most ten times per second, and reuses cached bounds
between reads. This removes transparent padding without changing the runtime.
Parent and iframe pointer events reveal the speaker within 36px of Bob or its
buttons. Six focused geometry/state/proximity tests and one preview build passed.
Browser review confirmed idle opacity 0 with pointer events disabled, then
opacity 1 near Bob while the speaker itself was not hovered. The speaker sat
directly beside the visible sprite, and playback was left paused with the prior
volume restored.

## Owner's visual revision

Both albums and all tracks use **Robby V and The Paperboys**. The visible Music
heading, JukeBob badge and introductory copy are removed; an accessible hidden
heading remains. Album choices begin under the navigation. The page now uses the
site's serif titles, ink/paper theme variables, square artwork and thin rules,
with quieter playback controls in place of green boxed surfaces.

Fine Print has new engraved newsroom cover art, created with built-in imagegen.
Both cover credits were then edited to the owner's exact capitalization. Original
images remain preserved beside the versioned final covers. Generation and edit
prompts are saved in `assets/music/the-fine-print-vol-1/cover-generation.md` and
`assets/music/sans-serif/cover-revision.md`. All MP3s and runtime code are unchanged.
The catalog generator now updates its playlist/art records without rebuilding
the runtime or rehashing unchanged audio.

The first PR's site check failed only because the existing navigation fixture
expected ten destinations. Music adds the eleventh. That exact test was corrected
and passed, including Music's order and current-section highlighting.
Five affected catalog/art/provenance tests and generator `--check` passed after
the final artist-credit edits; unchanged audio and playback checks were reused.

The actual iframe textarea uses 16px text and a 44px Send target. During mobile
typing, the cabinet is visually concealed while its logical state, playback and
saved Bob placement remain intact. Parent visual viewport dimensions and offsets
drive frame fitting and hit regions; parent reading overlays use those same
layout coordinates. Pinch zoom remains enabled.

## JukeBob record selector revision

The album tabs are replaced by a responsive tabletop JukeBob selector with wood,
brass, speaker cloth and a glass record display. Covers turn into the center while
neighboring sleeves angle to either side. The existing opened-album artwork,
track list and playback controls below are preserved.

Previous/next buttons, cover taps, Arrow keys, Home/End and horizontal touch
swipes select an album without starting or changing audio. Selection is bounded
by the catalog, with a screen-reader announcement.
Only the selected cover is a cover tab stop; distant covers are hidden from
assistive technology. Reduced-motion preferences disable the transition. Vertical
scrolling and pinch zoom remain native. The selector reads the catalog directly,
so future albums do not need a layout or script change.

The owner requested a quieter selector: the instruction line, speaker labels and
album/artist/counter panel are removed. Navigation arrows now sit in the side
speaker grilles on desktop and beneath the covers on small screens. The opened
album section retains its existing artwork, artist and track list.

For the speaker revision, all four focused state/placement tests and the three
updated carousel tests passed. A warm-cache preview build passed. Browser review
confirmed the small desktop speaker, working Play/Pause, preserved volume, and
computed opacity of 0.2 when idle and 1 on hover. The narrow selector retained
visible 44px arrows without horizontal overflow. The demo was restored to its
normal desktop viewport and refreshed; the player is paused and volume restored.

Three focused carousel behavior tests pass, covering catalog sizes up to six,
navigation bounds, keyboard and endpoint focus, swipe/click suppression, browsing
without audio commands and route cleanup/remount. One warm-cache Hugo preview
passed. Edge review confirmed the 3D cover transform, selection/panel updates and
keyboard focus at an endpoint. A narrow viewport check (291 CSS pixels at the
browser's existing zoom) showed no horizontal overflow and 44px arrow controls.
The viewport was restored and the demo refreshed for owner review. Prior audio,
catalog and runtime checks were reused because those inputs did not change.

## Focused validation

- Package verifier and imported destination MP3 hashes: pass, unchanged bytes.
- Music engine, playlist, settings and shuffle: 19 tests pass.
- Website catalog: four tests and generator `--check` pass.
- Compact playback/dismissal state and offset/narrow viewport placement: three
  tests pass.
- Shared TypeScript and strict website adapter TypeScript: pass.
- JavaScript/build-tool syntax and whitespace checks: pass.
- Hugo 0.167.0 local preview rendered successfully. Reused its image cache and
  refreshed only after the compact placement corrections; no runtime re-export.
- Three integrated browser cases pass (desktop, 390px and 320px). Real MP3 playback
  verified one audio object through album changes, cabinet/compact commands,
  Hide/Show, article navigation and Back/Forward. Browsing made no MP3 request
  before Play. All three control surfaces agreed on the current track.
- Reviewed light/dark screenshots, 44px targets, 16px actual iframe input,
  viewport offsets/keyboard-height fixture and restored hit testing. The hidden
  player reserves space for Show Bob, and masthead placement prefers Bob's right
  side to leave the wordmark clear. Test waits follow actual layout/hit-mask
  readiness, not arbitrary sleeps. Passing unaffected cases were reused.
- Standard web-game client completed one idle burst and screenshot inspection:
  sprite-only arrival, runtime ready. Its only console errors were the existing
  reading-status endpoint rejecting the new loopback port by CORS; no
  recommendation was submitted. Integrated cases blocked external requests and
  reported no JavaScript errors.
- GitHub owns the full production checks and verified deployment for this
  owner-authorized release. The intervening No Audience and Gallery-title changes
  have no overlapping paths with this feature; the focused results remain valid.
- Final pause controls use two CSS-drawn rectangular bars in the compact speaker
  and track list, with the existing accessible Play/Pause labels preserved.

Native iPhone Safari was not available for validation. The Chromium checks do not
establish native Safari behavior for first Play, focus zoom, keyboard
opening/closing, rotation or pinch zoom. The owner approved publication after
reviewing the demo.
