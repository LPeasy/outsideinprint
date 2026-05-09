# Final Front Page Bob Sprite Set Prompt

Use case: game asset sprite sheet
Asset type: 2D pixel-art animation strip for the Paper-Bob end-run cinematic

Primary request: Create one production sprite sheet for Paper-Bob's end-run Final Front Page sequence. Match the existing Paper-Bob sprite references strictly: black newsboy cap, black hoodie/jacket, tan paper bag, compact bicycle/scooter-like bike, thick dark outline, warm limited arcade/OIP palette, crisp pixel-art clusters.

Frame layout: exactly 14 equal slots, left to right. Frame 01 ride settle, 02 wheelie rise, 03 exaggerated wheelie peak, 04 ramp-contact pose with Bob and bike only, 05 takeoff, 06 airborne paper toss, 07 paper leaves hand, 08 landing, 09 coast recovery, 10 sideways skid turn, 11 dismount/reposition, 12 bike sideways parked, 13 sits backwards settling in, 14 final relaxed backwards-on-bike chill pose. Do not bake a ramp into any Bob frame; the cutscene has its own runtime ramp sprite.

Scene/backdrop: no scenery, no UI, no score text, no labels. Use a perfectly flat solid `#00ff00` chroma-key background for local background removal. Keep sprites separated from the background with crisp edges and generous padding.

Style/medium: retro pixel art, crisp pixel clusters, production game asset. No photorealism, no vector icon look, no painterly brush strokes.

Composition/framing: full character and bike visible in every slot, consistent scale, consistent bottom-center anchor, no cropping.

Constraints: same character, same outfit, same palette family, same bike design, no Spot, no baked text, no scenery, no watermark. Bob should not become an unrelated full-sideways jump pose during the airborne beat; the sideways posture belongs to the landing/skid/chill resolution.

Avoid: poster composition, large single illustration, gradients, captions, frame numbers, new outfit, changed cap, changed face, changed bike design, low-resolution mush, non-pixel-art edges, green inside the sprite.

Workflow note: generated as one strip, then chroma-keyed, component-grouped, normalized into fixed 128x128 bottom-center frames, and packed into `paper-bob-intro-atlas` to preserve the lazy asset delivery model.
