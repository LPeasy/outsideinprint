# Style Theme Workflow

Outside In Print keeps global visual tuning in the fingerprinted Hugo stylesheet at `assets/css/main.css`.

## Preset Names

Saved style presets use a descriptive word plus a timestamp:

`oip-theme-<area>-<descriptor>-YYYYMMDD-HHMMSS`

Examples:

- `oip-theme-rules-classic-20260429-115754`
- `oip-theme-rules-clear-20260429-115754`
- `oip-theme-rules-print-20260429-161813`

Use the timestamp from the planning or implementation session that created the saved comparison set.

## Active Values

The active site-wide values live on `:root`.

When introducing a new preset:

1. Save the outgoing values in a timestamped preset class.
2. Save the incoming values in a timestamped preset class.
3. Copy the incoming values onto `:root` if the new preset should become the default.
4. Keep the saved preset classes in the stylesheet so future work can compare or temporarily apply them in browser devtools.

Do not add runtime theme switching, Hugo params, data files, or extra stylesheet loading unless the user explicitly asks for a public theme selector.

## Divider Rules

Structural dividers should use semantic custom properties rather than repeated raw color values.

Current divider tokens:

- `--oip-rule-hairline`
- `--oip-rule-faint`
- `--oip-rule-list`
- `--oip-rule-standard`
- `--oip-rule-clear`
- `--oip-rule-engraved`
- `--oip-rule-engraved-strong`

Use these for page structure, section boundaries, archive lists, homepage zones, and article aftermatter dividers.

Do not use these tokens for card borders, image frames, buttons, forms, focus rings, collection accent themes, or hover accents unless a future plan explicitly broadens the theme surface.

## Future Print-Rule Experiments

For a COA3-style print-rule treatment, add a new timestamped preset before changing active values. Prefer a small number of semantic variables first, then add any ornamental or gradient rules behind those variables so the design can be tuned without hunting many selectors.

## COA3 Active Preset

The active COA3 preset is `oip-theme-rules-print-20260429-161813`. It keeps ordinary structural dividers close to the prior clear preset and adds two warmer engraved rule tokens for signature thresholds only.

Use `--oip-rule-engraved` and `--oip-rule-engraved-strong` for masthead and nav rails, section-front openings, archive month/year boundaries, homepage manifesto and start-reading separators, gallery spotlight/archive thresholds, article record/reading-path aftermatter, and the site footer.

Do not extend the engraved tokens into card/panel borders, image frames, buttons, forms, focus rings, collection-room theme variables, or hover/accent states without a new plan.
