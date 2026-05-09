# Paper-Bob Ending: 38-Beat Porch Skid Front Page Asset Prompt

Use case: production game assets for the Paper-Bob end-run cinematic.

Goal: replace the current Final Front Page ending with a continuous 38-beat gameplay-color sequence. Bob starts in the normal forward/top-down run-end pose, Spot cuts in from screen-right, Bob dodges left, turns hard right through a puddle, returns to a forward/up-screen wheelie, throws a newspaper left while moving up-screen, and the camera follows the thrown paper to a doorstep landing. The final newspaper receives dynamic runtime `Extra! Extra!`, score, and result rows, then holds.

Do not use OIP black-and-white styling for this pass. Keep the outro in the normal Paper-Bob gameplay palette.

## Reference Images To Use

- Bob identity/style references:
  - `assets/images/paper-route/sprites/bob/bob-ride-straight.png`
  - `assets/images/paper-route/sprites/bob/bob-wheelie-peak-alt.png`
  - `assets/images/paper-route/sprites/bob/bob-throw-left.png`
  - `assets/images/paper-route/sprites/bob/run-end-01-coast.png`
- Spot references:
  - `assets/images/paper-route/sprites/intro/spot-run-side-01.png`
  - `assets/images/paper-route/sprites/intro/spot-run-side-02.png`
  - `assets/images/paper-route/sprites/intro/spot-run-side-03.png`
- Puddle/paper references:
  - `assets/images/paper-route/sprites/route/route-puddle.png`
  - `assets/images/paper-route/sprites/paper/paper-projectile-spin.png`
  - `assets/images/paper-route/sprites/paper/paper-doorstep-slide.png`
- Doorstep/neighborhood palette references:
  - `assets/images/paper-route/sprites/track/property-left-01.png`
  - `assets/images/paper-route/sprites/track/side-base-left-01.png`
  - `assets/images/paper-route/sprites/track/property-right-01.png`

## Expected Runtime / Atlas Names

- Pack into existing lazy atlas only: `paper-bob-intro-atlas.png`, `paper-bob-intro-atlas.webp`, `paper-bob-intro-atlas.json`.
- Add no launcher attributes and no eager asset paths.
- New atlas frame ids:
  - `end_run_bob_spot_puddle_throw_01` through `end_run_bob_spot_puddle_throw_22`
  - `end_run_paper_doorstep_skid_01` through `end_run_paper_doorstep_skid_13`
  - `end_run_doorstep_plate`
- Keep dynamic text out of generated art. Runtime Phaser text/graphics will render `Extra! Extra!`, score, result rows, and `NEW RECORD`.

## Prompt A: Bob / Spot / Puddle / Throw Strip

Create one transparent pixel-art sprite strip for Paper-Bob's end-run action handoff. Match the existing Paper-Bob gameplay sprite style strictly: Bob in black newsboy cap, black hoodie/jacket, tan paper bag, compact bike, thick dark outline, warm limited arcade palette, crisp pixel clusters, readable at small in-game size. Match Spot to the existing small dog run sprites. Keep Bob's silhouette, outfit, bike proportions, cap, and bag consistent with the reference sprites.

Frame layout: exactly 22 equal slots, left to right, one action pose per slot. Use a perfectly flat solid `#00ff00` chroma-key background for local removal. No scenery, no UI, no frame numbers, no labels, no text, no baked ramp, no porch plate. Keep full Bob/bike visible with generous padding. Spot appears only during the near-miss frames. The puddle appears only as a small visual beat under/near the wheelie turn and must not look like a scoring obstacle interaction.

Normalization target: 192x128 transparent PNG frames if the near-miss needs width; 160x128 is acceptable only if Bob, Spot, puddle splash, and paper release remain readable. Use one shared scale across all 22 frames. Anchor bottom-center biased to Bob through frames 1-18, then allow Bob to shrink/recede in frames 19-22 as the camera commits to the paper.

Frame-by-frame design:

1. `end_run_bob_spot_puddle_throw_01`: Bob forward/top-down in the standard end-of-run gameplay orientation, centered low in frame, riding up-screen, no turn yet.
2. `end_run_bob_spot_puddle_throw_02`: Bob still forward/top-down, route-end coast pose, subtle anticipation; no Spot yet.
3. `end_run_bob_spot_puddle_throw_03`: Bob forward/top-down with front wheel beginning to lighten, preparing for a flourish; no sideways turn.
4. `end_run_bob_spot_puddle_throw_04`: Spot enters from screen-right, low and fast, crossing behind Bob's projected path; Bob notices but remains mostly forward.
5. `end_run_bob_spot_puddle_throw_05`: Spot cuts farther in from screen-right toward the center lane; Bob starts a slight lean left without changing into profile.
6. `end_run_bob_spot_puddle_throw_06`: Bob dodges sharply toward screen-left, bike banking left, Spot continues leftward through the near-miss lane.
7. `end_run_bob_spot_puddle_throw_07`: Near-miss peak: Bob passes in front/above Spot, bag bouncing, Spot stretched in a clean running stride moving left.
8. `end_run_bob_spot_puddle_throw_08`: Bob clears Spot and begins to recover from the left dodge; Spot continues off toward screen-left, not hit or injured.
9. `end_run_bob_spot_puddle_throw_09`: Bob counters hard right, front wheel rising into a wheelie as the bike yaws clockwise; puddle first appears ahead/right as a visual splash setup.
10. `end_run_bob_spot_puddle_throw_10`: Bob wheelies through/over the puddle, exaggerated front wheel high, small splash pixels under rear tire.
11. `end_run_bob_spot_puddle_throw_11`: Hard-right turn continues, wheelie still high, puddle splash arcs behind; Bob must remain readable as the same top-down rider.
12. `end_run_bob_spot_puddle_throw_12`: Bob completes the rightward arc through the puddle, rear tire kicking the last splash, bike starting to return toward up-screen.
13. `end_run_bob_spot_puddle_throw_13`: Bob ends the hard-right turn in an exaggerated wheelie facing the top of the screen, no Spot visible.
14. `end_run_bob_spot_puddle_throw_14`: Wheelie holds while Bob straightens fully up-screen, body centered, paper bag readable.
15. `end_run_bob_spot_puddle_throw_15`: Final wheelie/up-screen pose, clean handoff into throw; Bob is not sideways.
16. `end_run_bob_spot_puddle_throw_16`: Bob moves up-screen and winds up a left throw, torso twisting only subtly; rolled paper visible in left hand, slow-motion feel starts.
17. `end_run_bob_spot_puddle_throw_17`: Bob releases the newspaper toward screen-left, arm extended left, paper just leaving his hand; Bob still faces mostly up-screen.
18. `end_run_bob_spot_puddle_throw_18`: Throw follow-through, paper drifting left in slow motion, Bob continues up-screen; the paper should be a separate visible object within the frame.
19. `end_run_bob_spot_puddle_throw_19`: Bob recedes slightly up-screen, smaller and less central; tossed paper grows visually more important to the left/front.
20. `end_run_bob_spot_puddle_throw_20`: Camera handoff: Bob continues shrinking/receding toward the top, paper enlarges and moves toward frame center.
21. `end_run_bob_spot_puddle_throw_21`: Bob becomes a small background read, paper is now the focal object, spinning toward camera.
22. `end_run_bob_spot_puddle_throw_22`: Final handoff frame: Bob is tiny/receding or nearly gone; the newspaper is large enough to cut to the close-up paper strip.

Avoid: Bob crashing, Spot looking malicious or injured, full flat side-profile Bob, new Bob outfit, changed bike, changed cap, changed Spot design, baked ramp, baked score/UI text, green pixels inside sprites, photorealism, painterly edges, poster composition.

## Prompt B: Paper / Doorstep Skid Strip

Create one transparent pixel-art sprite strip for the thrown newspaper flying through the air, skidding onto a doorstep, unfolding, and becoming a clean blank results page. Match Paper-Bob's gameplay palette and outline style: warm off-white paper, tan binding/shadow, thick dark outline, crisp pixel clusters, light dust/speed pixels only where needed. This strip maps to cinematic frames 23-35.

Frame layout: exactly 13 equal slots, left to right, one newspaper pose per slot. Use a perfectly flat solid `#00ff00` chroma-key background for local removal. No full porch background in this strip; only the paper, small dust/speed pixels, and paper shadow. No score text, no `Extra! Extra!`, no result values, no UI, no readable article text.

Normalization target: 256x320 transparent PNG frames, page-center anchor. Use one shared scale across the whole strip. The final page must remain readable when displayed around 230x290 px in the Phaser canvas, with clear blank space for a red stamp, large score, and six compact result rows.

Frame-by-frame design:

23. `end_run_paper_doorstep_skid_01`: Rolled paper large in foreground, spinning left-to-center with a diagonal flight angle and binding band visible.
24. `end_run_paper_doorstep_skid_02`: Quarter-spin, rolled paper rotated, trailing speed ticks.
25. `end_run_paper_doorstep_skid_03`: Half-spin, slight squash from camera zoom, still fully rolled.
26. `end_run_paper_doorstep_skid_04`: Descending toward the doorstep, motion slowing, paper shadow grows.
27. `end_run_paper_doorstep_skid_05`: First porch/doorstep contact, light squash and a few dust pixels under leading edge.
28. `end_run_paper_doorstep_skid_06`: Skid frame, rolled paper sliding across doorstep with a short dust trail.
29. `end_run_paper_doorstep_skid_07`: Roll opens slightly while skidding; top flap lifts.
30. `end_run_paper_doorstep_skid_08`: Page starts unfolding, still angled from momentum.
31. `end_run_paper_doorstep_skid_09`: Newspaper opens wider; visible page border and blank score area.
32. `end_run_paper_doorstep_skid_10`: Paper nearly flat with a slight skid angle; lower result-row area is visible.
33. `end_run_paper_doorstep_skid_11`: Settled page, mostly flat, soft shadow underneath, tiny dust/scuff pixels.
34. `end_run_paper_doorstep_skid_12`: Final blank results page, clean and flat with top stamp area, large central score area, and lower row area.
35. `end_run_paper_doorstep_skid_13`: Hold-ready final blank results page, same composition as frame 34 but slightly calmer/cleaner for runtime text and ink animation.

Avoid: baked words, baked numbers, real article text, red stamps, labels, frame numbers, realistic newspaper photo texture, tears/folds that block text placement, heavy porch detail baked into the paper strip.

## Prompt C: Doorstep Plate

Create one Paper-Bob gameplay-color doorstep/porch close-up plate for the final paper landing. Pixel art, top-down/three-quarter game angle, warm arcade palette, crisp black outlines, subtle porch scuffs and dust. It must support the paper skid strip and the final newspaper results surface.

Asset name: `end_run_doorstep_plate`.

Composition:

- Rectangular plate matching the Paper-Bob playfield ratio, preferably 480x853 or larger with the same vertical composition.
- Close-up doorstep/porch surface: wood planks or concrete step, door threshold edge, light shadow, subtle scuff marks.
- The visual focus should be calm center/lower-center space where the final newspaper page sits.
- No Bob, no Spot, no score, no text, no UI, no newspaper baked into the plate.
- Gameplay color palette only; no OIP monochrome or editorial engraving treatment.

Avoid: busy porch pattern under the final page, readable signs/text, photorealism, painterly gradients, large props that compete with the newspaper.

## Runtime Text / Graphics Notes

Frames 36-38 are runtime animation, not generated image frames.

- Frame 36: stamp burst starts. Phaser renders `Extra! Extra!` in red, slightly angled, slightly off-center near the top of the paper. Exact text: `Extra! Extra!`.
- Frame 37: score appears as fresh black ink in large dynamic type. The score comes from current run state.
- Frame 38: result rows appear as fresh black ink using `summaryMetricItems()`: mailbox, doorstep, window, ramp, puddle, papers left. Each row reads as icon, leader line, value. `NEW RECORD` appears only when `effect.newBest` is true.
- Hold frame 38 until restart/close.

Recommended runtime colors:

- Stamp red: `#9d3328`
- Ink: `#2f2419`
- Warm new-record pulse: `#b5542f`

## Acceptance Before Generation

- Bob starts in the established forward/top-down end-run pose.
- Spot enters from screen-right in frames 4-5 and exits left through frames 6-8.
- Bob dodges left, then turns hard right through a puddle, then returns to an up-screen wheelie before throwing.
- Bob never becomes a full flat side-profile sprite.
- The paper becomes the focal object by frame 22.
- Frames 23-35 provide a clear paper flight, skid, unfold, and blank final results page.
- No generated frame contains baked score, metric values, `Extra! Extra!`, `NEW RECORD`, labels, frame numbers, or UI text.
