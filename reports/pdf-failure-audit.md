# PDF Failure Audit

- Generated: 2026-03-17 01:57:38 -04:00
- Essays scanned: 115
- PDFs expected: 115
- PDFs generated: 115
- Failures: 101
- Primary renders: 14
- Fallback renders: 101
- Auto-HTML candidates blocked by missing renderer: 10

## Top Failure Categories

- remote_image_placeholder_typst: 94 (invalid Typst remote-image placeholder)
- local_image_path_missing: 7 (root-relative image path not localized for Typst)

## Pipeline / Tooling Problems

- invalid_typst_placeholder: 94 :: The builder emitted an invalid Typst placeholder for omitted remote images, turning skipped web-only images into fallback renders.
- root_relative_image_resolution: 7 :: Root-relative /images/... assets survived into Typst instead of being localized to compile-time paths.
- auto_html_renderer_unavailable: 10 :: HTML-heavy essays were auto-routed toward browser print, but the renderer was unavailable and they were forced back onto Typst.

## Content Problems

- Affected files: 96 of 115
- pseudo_headings: 87
- fake_lists: 46
- duplicated_title: 20
- medium_cta: 19
- source_dumps: 15
- escaped_linebreaks: 15
- manual_bullets: 14
- embed_remnants: 8

## Representative Failures

| File | Reason | Detail | Legacy issues |
| --- | --- | --- | --- |
| why-the-mexican-navy-ship-cuauhtc3a9moc-crashed-into-the-brooklyn-bridge-c9e21ab4b72e.md | local_image_path_missing | line 7:11 - error: file not found (searched at \\?\C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\images\medium\why-the-mexican-navy-ship-cuauhtc3a9moc-crashed-into-the-brooklyn-bridge-c9e21ab4b72e\d4ac2578972d0ab429bdc550e9efe6207616d5d9f20255765c44440108966e92.jpeg) | source_dumps duplicated_title |
| pornography-the-modern-secular-state-religion-and-american-morality.md | local_image_path_missing | line 1:11 - error: file not found (searched at \\?\C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\images\medium\pornography-the-modern-secular-state-religion-and-american-morality\73e4b3b8aef6b4c1ca7a9e43be4aedaea51acd0c671994152f688f0655ad31bb.jpeg) | medium_cta author_note fake_lists escaped_linebreaks |
| who-is-pascal-siakam.md | local_image_path_missing | line 1:11 - error: file not found (searched at \\?\C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\images\medium\who-is-pascal-siakam\fc07487bf85147720fa1d0b703e5376e41a87a5c9317981a0237e4a15b0f8a68.jpeg) | medium_cta embed_remnants pseudo_headings |
| explaining-mutually-exclusive-and-collectively-exhaustive-where-did-my-paycheck-go.md | local_image_path_missing | line 3:11 - error: file not found (searched at \\?\C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\images\medium\explaining-mutually-exclusive-and-collectively-exhaustive-where-did-my-paycheck-go\61a52f886b9d1e4bdb9b1d293ab6bbd3419ed45b322e637926a8ce7894b1325e.png) | fake_lists pseudo_headings escaped_linebreaks |
| whos-really-funding-terror.md | local_image_path_missing | line 1:11 - error: file not found (searched at \\?\C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\images\medium\whos-really-funding-terror\f7c9bf9f76e3c75c9b18d4e0740bbe303406e81e801c0fb82a9a60efa0128223.jpg) | fake_lists pseudo_headings source_dumps |
| why-we-celebrate-memorial-day-origins-traditions-and-importance.md | local_image_path_missing | line 4:11 - error: file not found (searched at \\?\C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\images\medium\why-we-celebrate-memorial-day-origins-traditions-and-importance\ff5282d7bd36ea86362477bec408be437387519e4fe6b73ee9caa9170a6d6b26.jpeg) | - |
| you-paid-for-that-ct-scan.md | local_image_path_missing | line 1:11 - error: file not found (searched at \\?\C:\Users\lawto\OneDrive\Desktop\OutsideInPrint\outsideinprint\images\medium\you-paid-for-that-ct-scan\c726f9cdfc914b7f1c2e01abf0819a58f23c143da6d5776a1527cd77b6690497.jpg) | fake_lists pseudo_headings |
| nottoway-plantation-burns-down-in-fire-history-and-legacy-of-the-souths-largest-mansion.md | remote_image_placeholder_typst | line 9:158 - error: unexpected argument | embed_remnants source_dumps duplicated_title ornamental_breaks |
| jack-stratton-and-the-vulfpeck-model.md | remote_image_placeholder_typst | line 5:158 - error: unexpected argument | - |
| camp-mystic-evacuation-timeline-guadalupe-river-flash-flood-july-4-2025.md | remote_image_placeholder_typst | line 2:158 - error: unexpected argument | embed_remnants fake_lists |
| the-world-the-un-was-built-for.md | remote_image_placeholder_typst | line 2:158 - error: unexpected argument | - |
| how-tucson-az-plans-for-water-scarcity.md | remote_image_placeholder_typst | line 2:158 - error: unexpected argument | fake_lists escaped_linebreaks |
| rethinking-invasive-species-management.md | remote_image_placeholder_typst | line 5:158 - error: unexpected argument | fake_lists pseudo_headings source_dumps escaped_linebreaks |
| the-dolphin-company.md | remote_image_placeholder_typst | line 2:158 - error: unexpected argument | pseudo_headings duplicated_title escaped_linebreaks |
| why-superintelligence-strategy-gets-ai-governance-wrong.md | remote_image_placeholder_typst | line 2:158 - error: unexpected argument | medium_cta fake_lists pseudo_headings |
