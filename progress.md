Original prompt: Continue work on the Outside In Print Paper-Bob arcade easter egg.

2026-05-07:
- Tightened `logo-flying-paper.png` so it excludes Bob's hand/rider art.
- Tightened `logo-wordmark-paper-bob.png` so it is only the Paper-Bob wordmark.
- Added a Node-only contract test that validates every `sourceStatus: "cropped"` manifest entry points to an existing PNG and matches width, height, and file size metadata.
- Validation passed: `node --test tests\paper_route_contract.test.mjs tests\paper_route_rules.test.mjs`.
- Validation passed: `node --test tests\all.test.mjs`.
- Validation passed: `hugo --minify`, `pwsh -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1`, then `pwsh -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`.
- Unpacked `C:\Users\lawto\Downloads\paper_bob_sprite_package.zip` to scratch and cropped/normalized supplied sprite-package sheets into 128x128 transparent Bob frames.
- Updated `assets/images/paper-route/sprites/sprite-map.json`: 83 entries are now `sourceStatus: "cropped"`; the remaining 3 pending entries are the missing true top-facing ramp and left/right full property clusters.
- Added `assets/images/paper-route/paper-bob-sprite-sheet.png` and replaced `assets/images/paper-route/paper-bob-sprite.png` with a normalized rear-facing Bob frame.
- Wired the lazy-loaded Phaser runtime to the sprite sheet and ready package assets: Bob ride/lean/throw/airborne/wheelie/puddle/run-end states, package paper projectile, package puddle, and package hit/splash effects.
- Preserved the generated runtime ramp because the package ramp art is side/isometric rather than a true top-facing road ramp.
- Browser smoke passed on `hugo server` port 1314: sprite sheet loaded, canvas was nonblank, desktop gameplay rendered rear-facing Bob and package puddle, controls consumed papers, mobile summary rendered. Screenshots are in `C:\Users\lawto\Documents\40_Scratch\2026-05\paper-route-browser-smoke`.
- Review/refinement pass tightened hit and splash tweens to animate explicit `scaleX`/`scaleY` after display-size normalization.
- Review/refinement pass made narrow-viewport touch controls visible in browser smoke, tightened their right-edge dock so Bob stays readable, and removed touch-button letter spacing to keep labels on one line.
- Validation passed after the review pass: `node --test tests\paper_route_contract.test.mjs tests\paper_route_rules.test.mjs`, `node --test tests\all.test.mjs`, `hugo --minify`, `pwsh -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1`, then `pwsh -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`.
- Browser smoke passed after the review pass on `hugo server` port 1314 with live reload disabled: homepage lazy-load behavior stayed intact, desktop gameplay loaded the Bob sprite sheet, mobile controls rendered in the first viewport, and console errors remained clean. Screenshots are in `C:\Users\lawto\Documents\40_Scratch\2026-05\paper-route-review-smoke`.
- Final polish pass moved initial Pause/Restart button ownership into the game ready state: they stay disabled until `Start route`, then enable during active play. The loaded start card now focuses `Start route` instead of leaving focus on close.
- Final polish validation passed: `node --check assets\js\paper-route.js`, `node --check assets\js\paper-route-launcher.js`, `node --test tests\paper_route_contract.test.mjs tests\paper_route_rules.test.mjs`, `node --test tests\all.test.mjs`, `hugo --minify`, `pwsh -NoLogo -NoProfile -File .\tests\write_public_build_manifest.ps1`, then `pwsh -NoLogo -NoProfile -File .\tests\test_public_html_output.ps1 -RequireFreshBuild`.
- Final browser smoke passed on `hugo server` port 1314 with live reload disabled: lazy-load still deferred Phaser/rules/game until launch, ready state focused `Start route`, active desktop play and pause/resume worked, mobile controls rendered compactly, and console errors stayed clean. Screenshots are in `C:\Users\lawto\Documents\40_Scratch\2026-05\paper-route-final-polish-smoke`.
- Renamed the player-facing game title to `Paper-Bob` across live UI strings, ARIA labels, runtime error text, public-output messages, and Paper-Bob contract/rules test names. Internal `paper-route` file names, data attributes, CSS selectors, and the `oip-paper-route:v2` storage key were intentionally left unchanged.

TODO:
- Provide or generate a true top-facing ramp sprite before replacing the generated ramp texture.
- Provide or generate full left/right property cluster sprites if the background should move from drawn porches/house-target textures to packaged property clusters.
- Consider a tighter future cleanup pass on the supplied throw-sheet edge artifacts; runtime currently uses the cleanest active-play frames and keeps all Run End frames available.
