# Paper-Bob Ending: Final Front Page Refinement Pass

## Status

The dedicated 14-frame `end_run_bob_front_page_01..14` Bob strip is generated, normalized, packed into the lazy `paper-bob-intro-atlas`, and active in the end-run state machine. Frame 04 has been cleaned so Bob no longer carries a baked ramp; the ramp-contact beat now relies on the separate runtime `ramp_wood` sprite. The end-run front page, edition unfold frames, score stamp, new-record stamp, reduced-motion fallback, and render smoke fields are wired and contract-tested.

## Decision

Refine cinematic layer ownership before making more art. The end-run layer must fully own the closing shot. Intro layers, intro sketch objects, intro logos, and intro OIP setting state must be hidden/reset when the run-ending cinematic starts so no stale Paper-Bob logo or intro artwork leaks into the wheelie/ramp/paper-toss beats.

## Implementation Plan

1. Add a small runtime helper that hides both intro layers and their child sprites/graphics, then clears intro smoke fields that would imply intro artwork is still visible.
2. Call that helper when active gameplay starts and when `finish()` starts the end-run cinematic.
3. Keep the gameplay rules unchanged: no scoring, obstacle, timer, or result metric changes.
4. Keep the asset model unchanged: no new eager paths, launcher attributes, or atlas files.
5. Add/update contract coverage so the helper and finish-time call are pinned.
6. Rebuild `public/`, rerun the validation gate, and browser-smoke the exact wheelie, ramp-contact, paper-toss, page-unfold, score-stamp, and results beats.

## Acceptance Criteria

- `render_game_to_text()` reports `introSketchVisible: false`, `introSettingVisible: false`, and empty intro sketch/setting frames during the end-run beats.
- Wheelie and ramp-contact screenshots show no stale intro logo in the playfield.
- Ramp contact still shows only one ramp: the runtime ramp sprite.
- Score remains dynamic Phaser text stamped on the front page.
- New-record stamp remains gated by `effect.newBest`.
- Restart still interrupts/cleans the end-run sequence.
