# Paper-Bob Ending: Porch Skid Front Page Asset Prompt

Use case: production game assets for the Paper-Bob end-run cinematic.

Goal: replace the current final Bob chill pose with a delivery-object payoff. Bob jumps the ramp and throws a newspaper left in slow motion; the camera follows the spinning paper as it skids onto a porch, unfolds, and becomes the results surface. Keep the outro in the normal Paper-Bob gameplay color palette. Do not use OIP black-and-white styling for this pass.

## Expected Runtime / Atlas Names

- Pack into existing lazy atlas only: `paper-bob-intro-atlas.png`, `paper-bob-intro-atlas.webp`, `paper-bob-intro-atlas.json`.
- Add no launcher attributes and no eager asset paths.
- New atlas frame ids:
  - `end_run_spot_dodge_turn_01` through `end_run_spot_dodge_turn_12`
  - `end_run_bob_throw_left_01` through `end_run_bob_throw_left_08`
  - `end_run_paper_porch_skid_01` through `end_run_paper_porch_skid_12`
  - `end_run_porch_plate`
- Keep dynamic text out of generated art. Runtime Phaser text will render `EXTRA EXTRA!`, score, result rows, and `NEW RECORD`.

## Prompt A: Spot Dodge / Bob Turn Strip

Create one transparent pixel-art sprite strip for the pre-throw end-run action beat. This animation starts at the exact end of a normal run, so Bob must begin facing forward/top-down in the standard gameplay orientation. Spot tries to run by and knock Bob off his bike. Bob zooms past Spot with a sharp swing to screen-left, avoids the collision, then turns right into the correct orientation for the later right-facing throw sequence. This strip exists to earn the visual transition from forward gameplay orientation into Bob's right-facing throw.

Match the existing Paper-Bob gameplay sprite style strictly: Bob in black newsboy cap, black hoodie/jacket, tan paper bag, compact bike; Spot in the existing small dog style from the intro/game assets; thick dark outline, warm limited arcade palette, crisp pixel clusters, readable at small in-game size. Keep both characters in the same silhouette family as existing assets.

Frame layout: exactly 12 equal slots, left to right, one action pose per slot. Use a perfectly flat solid `#00ff00` chroma-key background for local removal. No scenery, no UI, no frame numbers, no text, no labels, no baked ramp. Keep Bob and Spot visible with generous padding and consistent game scale. Bob should remain the primary moving subject; Spot is a fast crossing threat/cameo.

Frame-by-frame design:

1. `end_run_spot_dodge_turn_01`: Bob is in the standard end-of-run gameplay orientation, facing forward/top-down from the lower road, riding straight with no turn yet; Spot is just entering from screen-left edge, low and fast.
2. `end_run_spot_dodge_turn_02`: Bob is still mostly forward/top-down, now noticing Spot as Spot cuts closer across his path.
3. `end_run_spot_dodge_turn_03`: Bob initiates the left dodge, front wheel lifting and bike beginning to bank left; Spot approaches the near-miss path.
4. `end_run_spot_dodge_turn_04`: Bob swings sharply toward screen-left to avoid Spot, still readable from the front/top-down but now visibly banking; Spot is just behind/under the near-miss line.
5. `end_run_spot_dodge_turn_05`: Near-miss peak: Bob barely clears Spot, paper bag bouncing, Spot's body stretched in a running stride.
6. `end_run_spot_dodge_turn_06`: Bob begins the counter-turn back toward screen-right; bike still tilted left, rear wheel trailing.
7. `end_run_spot_dodge_turn_07`: Bob crosses back through center, torso starting to rotate clockwise; Spot continues past and no longer threatens him.
8. `end_run_spot_dodge_turn_08`: Bob turns more strongly right, bike yawing into a partial 3/4 right-facing orientation; Spot recedes toward screen-right/lower edge.
9. `end_run_spot_dodge_turn_09`: Bob stabilizes from the dodge, now mostly 3/4 right-facing, front wheel settling.
10. `end_run_spot_dodge_turn_10`: Bob accelerates out of the dodge, fully committed to the right-facing setup, bike angled with speed.
11. `end_run_spot_dodge_turn_11`: Bob preps for the next throw sequence, body low and right-facing/3/4-right; Spot is nearly gone.
12. `end_run_spot_dodge_turn_12`: Clean handoff pose into `end_run_bob_throw_left_01`: Bob is right-facing/3/4-right, bike stable, no Spot overlap, ready for the throw wind-up.

Avoid: making Spot look malicious or injured, making Bob crash, full sideways Bob profile too early, new Bob outfit, changed bike, changed cap, changed Spot design, photorealism, painterly edges, poster composition, labels, or green inside sprites.

Normalization target: 160x128 transparent PNG frames if both Bob and Spot need width, otherwise crop into 128x128 only if both remain readable. Use a shared scale across the strip, bottom-center anchor biased to Bob, and keep Spot's relative position stable enough for animation.

## Prompt B: Bob Throw Strip

Create one transparent pixel-art sprite strip for Paper-Bob's end-run ramp jump and left-paper throw. Match the existing Paper-Bob sprite style exactly: black newsboy cap, black hoodie/jacket, tan paper bag, compact bicycle/scooter-like bike, thick dark outline, warm limited arcade palette, crisp pixel clusters, readable at small in-game size.

Frame layout: exactly 8 equal slots, left to right, one Bob-and-bike pose per slot. Use a perfectly flat solid `#00ff00` chroma-key background for local removal. No scenery, no UI, no frame numbers, no text, no Spot, no baked ramp. Keep full Bob and bike visible with generous padding and a stable bottom-center anchor.

Frame-by-frame design:

1. `end_run_bob_throw_left_01`: Start from the previous strip's handoff orientation: Bob is right-facing/3/4-right, bike stable, body low, ready to wind up.
2. `end_run_bob_throw_left_02`: Ramp contact/compression from the right-facing setup, bike squeezed low, no ramp drawn in frame.
3. `end_run_bob_throw_left_03`: Takeoff pose, bike nose up, back wheel clear, still right-facing/3/4-right.
4. `end_run_bob_throw_left_04`: Airborne slow-motion pose, torso twisting so the left shoulder opens for a cross-body throw.
5. `end_run_bob_throw_left_05`: Throw wind-up, rolled newspaper clearly in Bob's left hand drawn back across his body, jacket/cap trailing.
6. `end_run_bob_throw_left_06`: Release frame, left arm extended across the body toward screen-left, newspaper just leaving hand; bike angled but not full flat side profile.
7. `end_run_bob_throw_left_07`: Follow-through, Bob recoils after release, bike drifting right/up, still recognizable but no longer the focal point.
8. `end_run_bob_throw_left_08`: Handoff frame, Bob smaller/receding so the camera can commit to the thrown paper; keep silhouette clean.

Avoid: full profile turn, new outfit, changed cap, changed face, changed bike, photorealism, painterly edges, poster composition, labels, green inside the sprite.

Normalization target: 128x128 transparent PNG frames, bottom-center anchor, shared scale across the whole strip. Lock visual style to the current gameplay Bob, not the rejected side-turn finale art.

## Prompt C: Paper Porch Skid Strip

Create one transparent pixel-art sprite strip for the final newspaper flying left, spinning, skidding across a porch, unfolding, and becoming a clean results page. Match Paper-Bob's gameplay palette and outline style: warm off-white paper, tan binding/shadow, thick black outline, crisp pixel clusters, no OIP monochrome treatment.

Frame layout: exactly 12 equal slots, left to right, one newspaper pose per slot. Use a perfectly flat solid `#00ff00` chroma-key background for local removal. No porch background in this strip; only the paper, small dust/speed pixels, and paper shadow where needed. No score text, no `EXTRA EXTRA!`, no result values, no UI.

Frame-by-frame design:

1. `end_run_paper_porch_skid_01`: Rolled paper large in foreground, diagonal leftward motion, binding band visible.
2. `end_run_paper_porch_skid_02`: Quarter-spin, rolled paper rotated, trailing speed ticks.
3. `end_run_paper_porch_skid_03`: Half-spin, slight squash from camera zoom, still fully rolled.
4. `end_run_paper_porch_skid_04`: Descending toward porch contact angle, motion slowing.
5. `end_run_paper_porch_skid_05`: First contact, paper squashes lightly, a few dust pixels under the leading edge.
6. `end_run_paper_porch_skid_06`: Skid frame 1, rolled paper sliding across porch surface, dust trail behind.
7. `end_run_paper_porch_skid_07`: Skid frame 2, roll opening slightly, top flap lifting.
8. `end_run_paper_porch_skid_08`: Skid frame 3, page starts unfolding while still angled from momentum.
9. `end_run_paper_porch_skid_09`: Unfold frame 1, newspaper opens wider, visible page border and blank score area.
10. `end_run_paper_porch_skid_10`: Unfold frame 2, paper nearly flat, slight skid angle, blank result-row area visible.
11. `end_run_paper_porch_skid_11`: Settled page, mostly flat with a soft shadow underneath and tiny dust/scuff pixels.
12. `end_run_paper_porch_skid_12`: Final results page, clean and flat enough for Phaser text: open top area for red `EXTRA EXTRA!`, large blank score area, and lower rows for icons/leader lines/values.

Avoid: baked words, baked numbers, actual readable article text, labels, frame numbers, realistic newspaper photo texture, torn/messy page that would block dynamic UI.

Normalization target: 256x320 transparent PNG frames, center anchor for flight frames and page-center anchor for final frames, shared scale across the whole strip. The final page must remain readable when displayed around 230x290 px in the Phaser canvas.

## Prompt D: Porch Plate

Create one Paper-Bob gameplay-color porch/doorstep plate for the end-run paper skid close-up. Pixel art, top-down/three-quarter game angle, warm arcade palette, crisp black outlines, subtle porch scuffs and dust. The plate should support a newspaper skidding and settling on top of it.

Composition:

- Single transparent or rectangular plate asset named `end_run_porch_plate`.
- Close-up porch or doorstep surface: boards or concrete step, doorstep edge, light shadow, a few scuff marks.
- No Bob, no Spot, no score, no text, no UI, no newspaper baked into the plate.
- Make the center-left/lower-center area visually calm enough for the final newspaper page to sit on it.

Normalization target: 480x853 or canvas-ratio transparent/rectangular PNG so it can fill the current Paper-Bob playfield behind the final newspaper. If generated larger, crop/scale to the game canvas ratio without changing the perspective.

## Runtime Text Placement Notes

- `EXTRA EXTRA!`: Phaser text, red stamp color `#8f3b21`, bold serif, slight angle around `-7deg`, placed near the top of the final page but offset slightly from center and not perfectly aligned with page rule lines.
- Score: Phaser text, large, dark gameplay ink color unless `newBest`, then warmer red/brown pulse.
- Result rows: Phaser graphics/text on the newspaper surface using `summaryMetricItems()`: mailbox, doorstep, window, ramp, puddle, papers left. Layout should read as icon, leader line, value.

## Acceptance Before Packing

- Bob still reads as the established Paper-Bob sprite.
- Spot reads as a fast near-miss cameo, not an injury or crash gag.
- The dodge strip visibly transitions Bob from forward/top-down into right-facing/3/4-right before the throw strip begins.
- Bob does not become a full flat side profile during the throw.
- The paper is the final focal object.
- The final page has enough blank surface for dynamic text and rows.
- No generated frame contains baked score, metric values, `EXTRA EXTRA!`, `NEW RECORD`, or UI text.
