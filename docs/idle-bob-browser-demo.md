# Idle Bob local homepage demo

Preview: <http://127.0.0.1:1315/#home-idle-bob-title>. Production entry: <https://outsideinprint.org/#home-idle-bob-title>.

The homepage renders a separate transparent, same-origin iframe below the lead article in the left column, beside supporting reading. At the existing 900px stacking breakpoint it follows all featured articles. The small heading borrows the serif title and brass rules from the owner's supplied Idle Times capsule artwork. The Steam purchase card pairs the full JUKE-BOB capsule thumbnail with “Get Idle Times / on Steam”; the entire brass card is one link and wraps below the heading on phones.

The entry reuses the released Pet renderer, sprite sheets, routine and interaction controllers from Idle Times 1.0.1 runtime commit `4b8451abf5f0fda619ec078a9ba224e918a413d8`. Browser adapters add dragging inside the iframe, scoped preferences, Reset and Hide/Show. Bob's raised hand follows the actual pointer; the stage makes room below him without changing his size or moving its top. He lands near the release point. Browser hover tooltips are removed while accessible labels remain. The six native settings slots remain: Sound, Reset (replacing View), Activity, Talk, Help and Hide. On narrow frames Talk temporarily takes the full stage, then restores the jukebox. Effects default to enabled at the game's 55% volume and unlock with the first genuine click/tap inside the demo. The original Steam JUKE-BOB whistle recording and timing are retained. A one-time scoped migration enables the older forced-muted audition while preserving volume; later explicit mute choices persist. Music downloads only after Play. Offscreen or hidden frames unmount the renderer/audio and keep the in-memory idle checkpoint.

The owner-supplied 1834×858 JUKE-BOB capsule is preserved at `assets/games/idle-times/juke-bob-steam-capsule.png`, raw SHA-256 `2866bcb3f5fe9d54721344ffdbae080ec056af25286b31bad3e761c2a0f5cd1c`. This game-promotion source is separate from the editorial image inventory. Hugo serves only 160px/320px WebP derivatives for its 128px display width; the reviewed 1× request is approximately 5.2 KB. The art is resized without cropping or changing its content.

The game build includes only the Pet entry and its imported assets. It excludes the full app, movie library, comic rewards, Electron and Steam integration. Eight web music copies use MP3 at 128 kbps; original game WAV masters remain intact. Sound-recording credits are linked in the demo. The export is approximately 26.9 MB total, with 6.9 MB of entry/sprite/foley assets and 20.0 MB of music fetched on demand. `static/demos/idle-times-pet/build-manifest.json` records the game source revision, adapter source hashes and exact exported file hashes.

## Source and rebuild

The maintained browser adapter is committed in the game checkout as `25dea76b3737c204ae17c05f55104b1f728ac1a6`. Its parent is the released 1.0.1 runtime revision named above. The exported manifest identifies this adapter commit and the exact working-file hashes used in the build.

Website checkout:

`C:\Users\lawto\Documents\20_Worktrees\OutsideInPrint\active\idle-bob-browser-demo-20261008`

Game entry checkout:

`C:\Users\lawto\Documents\20_Worktrees\IdleTimes\active\pet-browser-entry-20261008`

Run from the game entry checkout, using its existing Node/Vite/React dependencies and FFmpeg:

```powershell
node tools\build-pet-browser.mjs --out 'C:\Users\lawto\Documents\20_Worktrees\OutsideInPrint\active\idle-bob-browser-demo-20261008\static\demos\idle-times-pet'
```

The exporter caches compressed music by source hash and archives obsolete hashed entry files listed by its previous manifest under the game checkout's ignored `output/previous-pet-exports/`. It never sweeps the site's static directory or touches player data.

From the website checkout:

```powershell
.\tools\bin\generated\hugo.cmd server --port 1315 --bind 127.0.0.1 --baseURL http://127.0.0.1:1315/ --disableFastRender --noHTTPCache
```

Hugo watches the website templates, CSS and exported static bundle. Re-export after changing game-entry source and wait for Hugo's rebuild to finish before running iframe QA, since live reload can detach a test frame. The server is bound to localhost; this link is for this computer.

## Validation and review

Game scripts `tools/qa-pet-browser.mjs`, `tools/qa-pet-homepage.mjs` and `tools/qa-pet-touch.mjs` record browser checks and screenshots under `output/`. These check startup silence, music loading/playback, settings, all Help previews, Talk, real pointer/touch pickup and landing, Hide/Show, reduced motion, article/iframe separation, exact desktop/mobile ordering, theme propagation, resize and actual offscreen shutdown. The develop-web-game client captures the exported renderer's canvas and structured state. Focused existing Pet/music unit tests supplement the browser checks.

The October 8 hover/grip revision passes 50 focused unit tests, the browser-entry/shared-source TypeScript check, 118 standalone browser checks, 112 homepage checks and 13 touch checks. Mouse grip coordinates are checked at two heights inside the real homepage iframe across six screen widths. Screenshots confirm desktop/mobile hanging and landing; the standard web-game client also passed. No runtime or failed local asset errors were observed in the completed runs.

The purchase-card revision passes the same 112 homepage checks across six widths; light/dark desktop and phone screenshots were reviewed. The default-on audio revision passes 94 sound/lean unit tests, 139 standalone browser checks (including recorded whistle, browser activation and mute migration/persistence), the TypeScript check and the standard web-game client. Seven final homepage checks confirm the exported iframe's default volume, first-gesture activation and recorded whistle on desktop and phone touch press/movement, with no runtime errors. Their screenshots/state are under `output/pet-homepage-qa/` in the game checkout. A stationary touch does not create a hover; the phone check uses a small finger movement over the cabinet.

The final footer revision gives Calm motion and Sound credits individual rounded outlines, hover feedback and keyboard focus. It passes 31 focused checks across desktop and phone widths in both themes; phone targets remain at least 44px tall. The owner authorized website publication after the concurrent Games-page build completes. Production rendering, output checks and the GitHub Pages workflow gate publication. This browser entry does not modify the Steam release.

Release-candidate validation passes Hugo 0.164.0 production rendering with minification and warnings treated as errors, public route smoke, fresh HTML output, the Games catalog contract and responsive-image output checks after integration with main's Games-page refresh (`b8f59400a12faf7c879324f14aeb94647ae3bc63`). The separate production artifact contains 5,079 managed derivatives and approximately 656 MB total, within the deployment limits. All 46 exported demo file hashes/sizes match the production copies, and the homepage iframe, static noindex entry, playlist and credits are present. Nineteen final actual-homepage checks pass on desktop/phone in light/dark themes, including Calm toggling and opening the served credits, with no runtime or demo asset errors.
