# Sitewide interactive Pet Bob

Website implementation prepared in `codex/pet-bob-live-20261011` from the approved `codex/pet-bob-masthead-20261011` preview, based on main `bd1ef9f0af194eaeb0e7548e230fdc3ada19d1a5`. Publication follows the protected PR and verified Pages deployment workflow.

## Reader behavior

Bob uses the actual Idle Times Pet renderer and interaction controllers. His default home is the masthead on the homepage and inner pages, with reserved space beside the wordmark on desktop and phones. The homepage starts with A note to the reader beneath the masthead and navigation; the Meet Idle Bob promotion and Steam card are removed. The first visit shows a silent raised-hand greeting and `Hi!`; a return after at least 30 minutes of inactivity shows `Welcome back!`. The speech bubble fades. Page navigation during the same visit does not repeat it.

Bob docks in the lower-right corner when his starting slot scrolls away. Pick him up and drag him to choose a free position over the page. He uses the desktop pet's hanging, swing and landing behavior, then stays where placed while the reader scrolls. His position is saved as viewport proportions and restored across reloads and internal navigation, clamped to the available screen after resizing.

The native gear opens JUKE-BOB and five controls: Sound, Home, Activity, Talk and Help. Right-clicking Bob toggles the jukebox and menu open or closed while music keeps playing. Home returns Bob to his masthead slot (or the default corner while that slot is offscreen), closing the controls. The Hide button is removed; saved hide preferences from earlier previews remain recoverable with Show Bob. With the canvas focused, arrow keys move Bob, Shift increases the step, Home restores the default placement, and Enter opens settings. Activity offers three mutually exclusive modes: Excited, Relaxed and Calm. Calm holds a still pose; choosing Excited or Relaxed resumes the idle cycle at that pace. The Sound credits link is removed from Bob's controls; the packaged credits file remains available with the exported assets.

This includes the Pet routines, cursor interactions, props, music and settings. It does not include the desk view, illustration unlocks, comic rewards, publishing/economy progression or Steam integration. Music waits for Play. Greetings remain silent. Browser audio rules require interaction before Pet sound effects can play.

Menus and ordinary dialogs temporarily conceal Bob and pause his visual interactions while music continues. Closing them restores the same Pet controls and Talk session. Background tabs stop the animation loop but keep music playing. The Paper-Bob arcade pauses music at its current position and resumes prior play intent when Bob returns. All these cases retain the existing player and unlocked sound-effects context. Transparent areas outside Bob and his visible controls let the reader interact with the webpage.

Internal site navigation now replaces the page content while keeping Bob’s iframe connected. Music, controls, Talk and Pet state survive page changes and Back/Forward; greetings do not restart. Reloading, leaving the site, opening another tab, or falling back to a full page load starts a new runtime. With storage blocked, Bob remains usable and persists through soft navigation, but saved preferences may not survive a reload. Clearing browser storage resets visit recognition.

## Ownership and runtime

The site parent lives in `assets/js/companion-bob.js`. It owns visit recognition, position modes (`masthead`, `docked`, `free`, `hidden`), the speech bubble, browser storage and page-overlay coordination. `companion-bob-visit.js` handles versioned visit/preferences records. `oip-bob-position:v1` stores only normalized x/y placement, with no user identity or server request.

The shared masthead reserves one slot on every page without mounting a second pet. `layouts/partials/companion_bob.html` creates a transparent viewport iframe, loading fallback, greeting and Show Bob control. The shared base and custom 404 template include it. Readers open controls through Bob's native gear or right-click; the separate Spend time with Bob button has been removed.

The iframe at `/companion-bob/runtime/` is a full-viewport rendering surface with no visible container. Its CSS clip path is the union of Bob's actual sprite hit bands and visible control rectangles, supplied by the same hit-region computation used for the native desktop window. This gives real browser hit-test pass-through outside those regions. The frame starts fully clipped and inert until drawing and regions are ready. All cross-frame messages require the exact source window, same origin and `oip-site-bob-v1` channel.

Parent-to-child messages cover foot-anchor placement, visibility, theme, passive cursor position, greetings and opening settings. The runtime reports readiness, painted state, hit regions, user position changes, activity, Home, Hide and errors. Only a settled user move is persisted. Temporary panel fitting does not overwrite the saved position.

The 9,204-byte static `idle.webp` fallback is drawn from original artwork. Its existing art manifest/build script retain derivation provenance. The earlier compact-only renderer is no longer used. The previous standalone Pet demo under `static/demos/idle-times-pet/` remains available independently; it is not mounted by the site companion.

## Persistent navigation

`assets/js/site-navigation.js` uses self-hosted Swup 4.10.0 (MIT; provenance and license under `assets/js/vendor/`). It swaps `#site-page` and `#site-overlays`; Bob, his greeting and Show Bob control remain outside both. Swup handles link interception, fetches, browser history and navigation cancellation. The integration follows Hugo aliases and Random routes, handles Library query-only history, restores scroll, moves keyboard focus, announces the new page, updates route metadata and analytics config, and limits cached pages to 20.

`oip:before-route` runs while old content exists. Widgets remove listeners, close viewers, destroy the separate Paper-Bob game and cancel or ignore stale requests. The router installs the new markup, executes marked widget scripts once, then emits `oip:route`. `route-widget-lifecycle.js` remounts each registered widget. The companion rebinds the new masthead slot and controls without replacing its iframe. Library filters use `oipNavigation.updateQuery()` so their URLs retain navigation history metadata. Analytics closes the previous reading interval and records one page view for the destination.

A failed fetch, incompatible persistent asset fingerprint, unsupported script or missing page container falls back to normal document navigation. External links, modified clicks, downloads and standalone demos keep native browser behavior. New templates with interactive scripts must register a route widget and mark their script with a stable `data-oip-route-script` key. Full document loads remain the no-JavaScript fallback. No form submission or checkout is intercepted.

## Source and export

The Pet overlay source is maintained in an isolated game worktree:

`C:\Users\lawto\Documents\20_Worktrees\IdleTimes\active\site-pet-overlay-20261011`

It starts from browser adapter commit `25dea76b3737c204ae17c05f55104b1f728ac1a6`. The new `browser/site-pet/` adapter and opt-in `BobPet` capability reuse the shipped Pet simulation, artwork and controls. Desktop behavior remains behind its existing path. No primary game checkout or installed Steam build is changed.

Run the new export tool from that game worktree using its existing dependencies:

```powershell
node tools/build-site-pet.mjs --out 'C:\Users\lawto\Documents\20_Worktrees\OutsideInPrint\active\pet-bob-masthead-20261011\static\companion-bob\runtime' --music-from 'C:\Users\lawto\Documents\20_Worktrees\OutsideInPrint\active\pet-bob-masthead-20261011\static\demos\idle-times-pet'
```

The export manifest records source revision, adapter/shared-source hashes and emitted asset hashes. Web music uses the existing compressed copies; no artwork or audio is regenerated.

The approved adapter source is preserved in local game commit `89d4d91d2168f584fc1075bb315db6bbeeb73cff` on `codex/site-pet-overlay-20261011`. This is a local source checkpoint, not a desktop game release. The unchanged export records its original base `25dea76b3737c204ae17c05f55104b1f728ac1a6` with `sourceWorkingTree: true`; its source hashes identify the files now saved in that checkpoint.

## Release review

Independent source reviews covered persistent navigation, widget cleanup, forms, metadata, analytics, asset provenance, cross-frame messages and desktop separation. All 46 runtime payload hashes and eight source hashes matched the approved export. Release preparation updated the reading-progress fixture for route-managed scripts and replaced obsolete inline Random assertions with checks of the generated choices, built destinations, fallback and navigation controller. The focused reading-progress suite passed all 27 tests; the Random output checks passed against the existing preview output. GitHub Actions owns the fresh production build and generated-output release gate.

The final analytics review moved new-article read tracking to `oip:after-route`, emitted after destination scrolling and focus settle. Page metadata and pageviews still update on `oip:route`. Both focused analytics browser scenarios passed, including a regression proving the previous article's bottom cannot mark the next article read while the reader remains at its top. Runtime files use `-text` Git attributes to preserve their exact exported bytes, including sound credits.

## Local preview and validation

From the website worktree:

```powershell
.\tools\bin\generated\hugo.cmd server --bind 127.0.0.1 --port 1326 --baseURL http://127.0.0.1:1326/ --disableFastRender --disableLiveReload --noHTTPCache
```

Open <http://127.0.0.1:1326/>. The preview is local to this computer. Refresh after source changes; live reload is disabled to avoid detaching interaction tests.

```powershell
.\tools\bin\generated\node.cmd --test tests/companion_bob_visit.test.mjs
$env:OIP_BASE_URL = 'http://127.0.0.1:1326/'
$env:OIP_PLAYWRIGHT_MODULE = 'C:\Users\lawto\OneDrive\Documents\Desktop Companion Idle Game\node_modules\playwright\index.mjs'
.\tools\bin\generated\node.cmd --test tests/companion_bob_browser.test.mjs
.\tools\bin\generated\node.cmd --test tests/persistent_navigation_browser.test.mjs tests/site_navigation_edges_browser.test.mjs
```

The browser suite accepts only local preview URLs and blocks external requests. It checks the real sprite with trusted mouse/touch input, native controls, position persistence, greetings, click-through, mobile layouts, reduced motion, storage failure, article/404 inclusion and theme propagation. Current-iteration screenshots use the `overlay-` prefix under `output/playwright/companion-bob/`; earlier screenshots document the superseded compact/modal version. The standard develop-web-game client captures additional screenshots and structured state.

Validation on October 11, 2026: all 13 companion browser scenarios passed across scoped runs, including full Talk questions/answers, keyboard focus after Show Bob, saved keyboard movement, settings persistence, and navigation/Paper-Bob suspension and recovery. The selected website source contracts and visit/storage tests passed (44 tests total); the existing mobile navigation suite passed all eight scenarios. The game adapter passed shared and strict adapter TypeScript checks plus 136 focused native Pet tests. A running audio-context check confirmed the greeting plays no new sound and leaves no active voices. Desktop and 320/390-pixel mobile screenshots were inspected. The export contains 46 files, including eight music tracks that load when played.

The standard game client passed again against the final runtime, reporting Bob ready and active with 20 interactive regions and no errors file. Final captures are in the game worktree at `output/overlay-standard-final/`. All 46 emitted file hashes and six working-source hashes match `build-manifest.json`. The in-app preview was refreshed and left visible for owner review.

Persistent-navigation validation on October 11, 2026: four integration scenarios passed for actual iframe/document/audio identity, Library filters and query Back/Forward, stale catalog cancellation, route analytics and reading progress. Six navigation edge scenarios passed for keyboard Skip, hash focus and scroll restoration, Gallery modal focus, aliases/Random, failed-request normal-load fallback, and rapid competing links. The existing source aggregate plus the corrected Random contract passed 199 source/unit checks; 12 opt-in rendered checks were skipped. Native game checks passed both TypeScript configurations and 142 tests. The standard game client and desktop/mobile screenshots were inspected. Evidence is under `output/playwright/persistent-navigation/`, `output/playwright/navigation-edges/`, and the game worktree’s `output/site-pet-persistence/` and `output/overlay-persistence-final/`.

Final regression pass: all 13 existing companion browser scenarios passed across scoped runs, including 320/390-pixel touch layouts, greetings, Talk, Hide/Show and overlay recovery. An immediate-reload sound-preference race was fixed with a synchronous site-adapter `pagehide` save; the unchanged regression test now passes. Final runtime is `index-B2MQO0Mi.js`, with 46 files totaling 26,909,328 bytes. The actual in-app preview was refreshed, and First Edition continued through Home → About → Home with the same open JUKE-BOB controls.

Homepage placement update on October 11, 2026: moved the Idle Times promotion below front-page navigation and above the reader note, spanning the content width with Bob on the right. Phone layouts keep Bob beside the introduction and place the Steam card below. Four desktop/phone light/dark captures passed geometry and overflow checks; Home → About → Home retained the iframe document and active music. All 38 selected homepage/layout source checks and the standard game client passed. Screenshots are in `output/playwright/bob-banner/` and the game worktree's `output/overlay-banner-standard/`. The site-only Home guidance now says "starting spot". Final runtime is `index-ClBwL4A3.js`, with 46 files totaling 26,909,342 bytes.

Homepage follow-up on October 11, 2026: centered Bob between the introduction and Steam card, removed Spend time with Bob, and added site-only right-click open/close toggling. Four responsive captures, two existing greeting/scroll browser scenarios, 38 source checks, Home → About → Home continuity, strict adapter TypeScript and the standard game client passed. Real-pointer toggle checks passed in normal and reduced motion, including Sound/Talk dismissal and the same music player continuing to advance while controls close. The updated in-app preview is visible with controls collapsed. Evidence is in `output/playwright/bob-banner/` and the game worktree's `output/site-pet-context-menu/` and `output/overlay-centered-standard/`. Current runtime is `index-DodNu92D.js`, with 46 files totaling 26,909,408 bytes.

Activity controls update on October 11, 2026: moved Calm motion into Activity beside Excited/Relaxed and removed the separate footer and Sound credits link. The existing Activity panel supplies its hit region; the unused footer hit-region scan is removed. Shared desktop and standalone-demo behavior remains unchanged. Real clicks/taps at 1440, 390 and 320 pixels verified panel fit, 44-pixel mobile controls, retained Relaxed selection, and idle-clock pause/resume. TypeScript and the standard game client passed without page errors. The in-app preview is refreshed with Activity open and Calm off. Current export is `index-Csf3nmBt.js` / `index-Dmj8bLq3.css`, 46 files totaling 26,909,250 bytes; the sound credits file remains packaged.

Activity selection correction on October 11, 2026: Excited, Relaxed and Calm now form one radio group with exactly one selected option. Selecting either pace disables Calm; selecting Calm clears the pace selection. Existing stored preferences remain compatible. Desktop, 390-pixel and 320-pixel checks passed for exclusive selection, reload restoration, keyboard navigation, panel fit and actual idle-clock pause/resume. The updated native activity/sound reload regression and standard game client passed. Screenshots are under the game worktree's `output/site-pet-activity-exclusive/`. The local preview is refreshed with Relaxed selected. Current export is `index-CIht17Lq.js` / `index-A-mK5uQI.css`, 46 files totaling 26,909,834 bytes.

Menu simplification on October 11, 2026: removed Hide from the website's native controls and canvas guidance. Home remains the return-to-start action and closes the controls. Desktop Dismiss and standalone-demo Hide are unchanged. Desktop, 390-pixel and 320-pixel checks passed for the five remaining controls, mobile target sizes, panel fit and Home restoring the exact starting anchor. The existing Home regression now seeds an earlier hidden preference to verify Show Bob recovery and keyboard-position persistence; it passed. TypeScript and the standard game client passed, screenshots inspected, and the in-app preview refreshed on the reader's current article. Evidence is in the game worktree's `output/site-pet-menu-home/` and `output/overlay-no-hide-standard/`. Current export: `index-CkrrZB10.js` / `index-A-mK5uQI.css`, 46 files totaling 26,909,799 bytes.

Production build and deployment checks belong to a separately authorized publication.
