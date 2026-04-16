# Legacy Host Reference Audit

- Generated at: 2026-04-15T15:59:53.8830888-04:00
- Total repo-controlled matches: 213

## Category Totals

| Category | Count | Meaning |
| --- | ---: | --- |
| generated_historical_data | 193 | Generated analytics snapshots that still contain legacy-host strings from historical traffic. |
| intentional_legacy_classification | 5 | Legacy host references used to classify historical analytics or frozen rollout samples. |
| dashboard_or_fixture_compatibility | 7 | Dashboard-specific public-site links or fixture/test references that still assume the legacy host. |
| intentional_probe_target | 8 | Diagnostic scripts or owner checklists that intentionally mention the legacy host while validating the cutover. |
| manual_follow_up | 0 | Repo-controlled references that likely still need explicit human review. |

## Matches

| Category | File | Line | Snippet |
| --- | --- | ---: | --- |
| intentional_legacy_classification | assets\js\dashboard-core.mjs | 155 | descriptor.text.toLowerCase().startsWith("lpeasy.github.io/outsideinprint") |
| generated_historical_data | data\analytics\essays.json | 11 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 44 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 77 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 88 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 110 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 143 | "primary_source": "lpeasy.github.io/outsideinprint/start-here" |
| generated_historical_data | data\analytics\essays.json | 165 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 198 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 264 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 275 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 319 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 330 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 396 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 407 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 528 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 539 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 550 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 572 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 594 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 627 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 638 | "primary_source": "lpeasy.github.io/outsideinprint/essays" |
| generated_historical_data | data\analytics\essays.json | 704 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 715 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 737 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 759 | "primary_source": "lpeasy.github.io/outsideinprint/essays/the-dolphin-company" |
| generated_historical_data | data\analytics\essays.json | 770 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 836 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 902 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1034 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1045 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1067 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1100 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1111 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1122 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1199 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1265 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1298 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\essays.json | 1331 | "primary_source": "lpeasy.github.io/outsideinprint/random" |
| generated_historical_data | data\analytics\journey_by_source.json | 3 | "discovery_source": "lpeasy.github.io/outsideinprint/syd-and-oliver", |
| generated_historical_data | data\analytics\journey_by_source.json | 87 | "discovery_source": "lpeasy.github.io/outsideinprint/essays/why-a-return-to-the-gold-standard-would-break-the-economy", |
| generated_historical_data | data\analytics\journey_by_source.json | 213 | "discovery_source": "lpeasy.github.io/outsideinprint/collections/risk-uncertainty", |
| generated_historical_data | data\analytics\journey_by_source.json | 276 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journey_by_source.json | 360 | "discovery_source": "lpeasy.github.io/outsideinprint/library", |
| generated_historical_data | data\analytics\journey_by_source.json | 444 | "discovery_source": "lpeasy.github.io/outsideinprint/essays", |
| generated_historical_data | data\analytics\journey_by_source.json | 549 | "discovery_source": "lpeasy.github.io/outsideinprint/essays/the-dolphin-company", |
| generated_historical_data | data\analytics\journey_by_source.json | 612 | "discovery_source": "lpeasy.github.io/outsideinprint/start-here", |
| generated_historical_data | data\analytics\journey_by_source.json | 717 | "discovery_source": "lpeasy.github.io/outsideinprint/collections/floods-water-built-environment", |
| generated_historical_data | data\analytics\journey_by_source.json | 759 | "discovery_source": "lpeasy.github.io/outsideinprint/essays/the-three-enemies-of-positive-outcomes", |
| generated_historical_data | data\analytics\journeys.json | 21 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 39 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 57 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 93 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 147 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 165 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 183 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 201 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 219 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 273 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 309 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 327 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 543 | "discovery_source": "lpeasy.github.io/outsideinprint/essays/the-dolphin-company", |
| generated_historical_data | data\analytics\journeys.json | 561 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 615 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 651 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 705 | "discovery_source": "lpeasy.github.io/outsideinprint/library", |
| generated_historical_data | data\analytics\journeys.json | 831 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 867 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 939 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1029 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1083 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1119 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1191 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1263 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1299 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1371 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1407 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1479 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1641 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1695 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1731 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1911 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1929 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 1983 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2001 | "discovery_source": "lpeasy.github.io/outsideinprint/essays/why-a-return-to-the-gold-standard-would-break-the-economy", |
| generated_historical_data | data\analytics\journeys.json | 2073 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2091 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2181 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2253 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2271 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2307 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2361 | "discovery_source": "lpeasy.github.io/outsideinprint/collections/floods-water-built-environment", |
| generated_historical_data | data\analytics\journeys.json | 2379 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2415 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2487 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2541 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2595 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2685 | "discovery_source": "lpeasy.github.io/outsideinprint/essays/the-three-enemies-of-positive-outcomes", |
| generated_historical_data | data\analytics\journeys.json | 2703 | "discovery_source": "lpeasy.github.io/outsideinprint/collections/risk-uncertainty", |
| generated_historical_data | data\analytics\journeys.json | 2829 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2847 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2883 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 2919 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 3027 | "discovery_source": "lpeasy.github.io/outsideinprint/start-here", |
| generated_historical_data | data\analytics\journeys.json | 3261 | "discovery_source": "lpeasy.github.io/outsideinprint/essays", |
| generated_historical_data | data\analytics\journeys.json | 3333 | "discovery_source": "lpeasy.github.io/outsideinprint/start-here", |
| generated_historical_data | data\analytics\journeys.json | 3369 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 3423 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 3477 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 3531 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 3549 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 3639 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 3675 | "discovery_source": "lpeasy.github.io/outsideinprint/syd-and-oliver", |
| generated_historical_data | data\analytics\journeys.json | 3711 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 3963 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 3999 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\journeys.json | 4017 | "discovery_source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources_timeseries.json | 6 | "source": "lpeasy.github.io/outsideinprint/essays/what-happened-at-camp-mystic", |
| generated_historical_data | data\analytics\sources_timeseries.json | 105 | "source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources_timeseries.json | 171 | "source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources_timeseries.json | 193 | "source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources_timeseries.json | 248 | "source": "lpeasy.github.io/outsideinprint", |
| generated_historical_data | data\analytics\sources_timeseries.json | 380 | "source": "lpeasy.github.io/outsideinprint/essays", |
| generated_historical_data | data\analytics\sources_timeseries.json | 457 | "source": "lpeasy.github.io/outsideinprint/literature", |
| generated_historical_data | data\analytics\sources_timeseries.json | 545 | "source": "lpeasy.github.io/outsideinprint/essays/why-a-return-to-the-gold-standard-would-break-the-economy", |
| generated_historical_data | data\analytics\sources_timeseries.json | 556 | "source": "lpeasy.github.io/outsideinprint/syd-and-oliver/peaches-or-greece", |
| generated_historical_data | data\analytics\sources_timeseries.json | 578 | "source": "lpeasy.github.io/outsideinprint/start-here", |
| generated_historical_data | data\analytics\sources_timeseries.json | 710 | "source": "lpeasy.github.io/outsideinprint/essays/2025-supreme-court-wrap-up", |
| generated_historical_data | data\analytics\sources_timeseries.json | 787 | "source": "lpeasy.github.io/outsideinprint/collections", |
| generated_historical_data | data\analytics\sources_timeseries.json | 908 | "source": "lpeasy.github.io/outsideinprint/syd-and-oliver", |
| generated_historical_data | data\analytics\sources_timeseries.json | 930 | "source": "lpeasy.github.io/outsideinprint/essays/the-structure-of-modern-american-society", |
| generated_historical_data | data\analytics\sources_timeseries.json | 996 | "source": "lpeasy.github.io/outsideinprint/start-here", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1051 | "source": "lpeasy.github.io/outsideinprint", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1073 | "source": "lpeasy.github.io/outsideinprint/library", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1128 | "source": "lpeasy.github.io/outsideinprint/essays/the-100-year-flood-is-not-what-you-think", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1139 | "source": "lpeasy.github.io/outsideinprint/essays/the-three-enemies-of-positive-outcomes", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1260 | "source": "lpeasy.github.io/OutsideInPrintDashboard", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1337 | "source": "lpeasy.github.io/OutsideInPrintDashboard", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1381 | "source": "lpeasy.github.io/outsideinprint/start-here", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1436 | "source": "lpeasy.github.io/outsideinprint/essays/dirt-is-better-than-air", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1568 | "source": "lpeasy.github.io/outsideinprint/essays/what-is-risk-a-four-part-framework", |
| generated_historical_data | data\analytics\sources_timeseries.json | 1865 | "source": "lpeasy.github.io/outsideinprint", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2195 | "source": "lpeasy.github.io/outsideinprint/essays/the-dolphin-company", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2382 | "source": "lpeasy.github.io/outsideinprint", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2459 | "source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2492 | "source": "lpeasy.github.io/outsideinprint/essays", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2569 | "source": "lpeasy.github.io/outsideinprint/essays/uncrustables-the-billion-dollar-peanut-butter-empire", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2613 | "source": "lpeasy.github.io/outsideinprint", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2712 | "source": "lpeasy.github.io/outsideinprint/syd-and-oliver/history-pushes-back", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2723 | "source": "lpeasy.github.io/outsideinprint/syd-and-oliver/the-new-orthodoxy", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2734 | "source": "lpeasy.github.io/outsideinprint/essays/dirt-is-better-than-air", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2745 | "source": "lpeasy.github.io/outsideinprint/collections", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2778 | "source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2822 | "source": "lpeasy.github.io/outsideinprint/collections/floods-water-built-environment", |
| generated_historical_data | data\analytics\sources_timeseries.json | 2954 | "source": "lpeasy.github.io/outsideinprint/syd-and-oliver", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3086 | "source": "lpeasy.github.io/outsideinprint/start-here", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3097 | "source": "lpeasy.github.io/outsideinprint/literature", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3174 | "source": "lpeasy.github.io/outsideinprint/collections/risk-uncertainty", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3251 | "source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3262 | "source": "lpeasy.github.io/outsideinprint", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3328 | "source": "lpeasy.github.io/outsideinprint/essays/the-death-of-moores-law", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3537 | "source": "lpeasy.github.io/outsideinprint/collections", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3636 | "source": "lpeasy.github.io/outsideinprint", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3680 | "source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3735 | "source": "lpeasy.github.io/outsideinprint/essays/in-the-image-of-god", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3867 | "source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources_timeseries.json | 3977 | "source": "lpeasy.github.io/outsideinprint/essays/the-dolphin-company", |
| generated_historical_data | data\analytics\sources_timeseries.json | 4098 | "source": "lpeasy.github.io/outsideinprint/library", |
| generated_historical_data | data\analytics\sources.json | 3 | "source": "lpeasy.github.io/outsideinprint/essays/uncrustables-the-billion-dollar-peanut-butter-empire", |
| generated_historical_data | data\analytics\sources.json | 91 | "source": "lpeasy.github.io/outsideinprint/collections/risk-uncertainty", |
| generated_historical_data | data\analytics\sources.json | 113 | "source": "lpeasy.github.io/outsideinprint/essays/2025-supreme-court-wrap-up", |
| generated_historical_data | data\analytics\sources.json | 377 | "source": "lpeasy.github.io/outsideinprint/syd-and-oliver", |
| generated_historical_data | data\analytics\sources.json | 421 | "source": "lpeasy.github.io/outsideinprint/essays/the-structure-of-modern-american-society", |
| generated_historical_data | data\analytics\sources.json | 454 | "source": "lpeasy.github.io/outsideinprint/essays/the-three-enemies-of-positive-outcomes", |
| generated_historical_data | data\analytics\sources.json | 487 | "source": "lpeasy.github.io/outsideinprint/essays/the-100-year-flood-is-not-what-you-think", |
| generated_historical_data | data\analytics\sources.json | 498 | "source": "lpeasy.github.io/outsideinprint/start-here", |
| generated_historical_data | data\analytics\sources.json | 542 | "source": "lpeasy.github.io/outsideinprint/essays", |
| generated_historical_data | data\analytics\sources.json | 564 | "source": "lpeasy.github.io/outsideinprint/essays/the-dolphin-company", |
| generated_historical_data | data\analytics\sources.json | 586 | "source": "lpeasy.github.io/outsideinprint/syd-and-oliver/history-pushes-back", |
| generated_historical_data | data\analytics\sources.json | 608 | "source": "lpeasy.github.io/outsideinprint/essays/the-death-of-moores-law", |
| generated_historical_data | data\analytics\sources.json | 685 | "source": "lpeasy.github.io/OutsideInPrintDashboard", |
| generated_historical_data | data\analytics\sources.json | 729 | "source": "lpeasy.github.io/outsideinprint/library", |
| generated_historical_data | data\analytics\sources.json | 740 | "source": "lpeasy.github.io/outsideinprint/essays/what-happened-at-camp-mystic", |
| generated_historical_data | data\analytics\sources.json | 839 | "source": "lpeasy.github.io/outsideinprint/syd-and-oliver/the-new-orthodoxy", |
| generated_historical_data | data\analytics\sources.json | 883 | "source": "lpeasy.github.io/outsideinprint/syd-and-oliver/peaches-or-greece", |
| generated_historical_data | data\analytics\sources.json | 938 | "source": "lpeasy.github.io/outsideinprint/essays/what-is-risk-a-four-part-framework", |
| generated_historical_data | data\analytics\sources.json | 993 | "source": "lpeasy.github.io/outsideinprint/literature", |
| generated_historical_data | data\analytics\sources.json | 1015 | "source": "lpeasy.github.io/outsideinprint", |
| generated_historical_data | data\analytics\sources.json | 1114 | "source": "lpeasy.github.io/outsideinprint/essays/why-a-return-to-the-gold-standard-would-break-the-economy", |
| generated_historical_data | data\analytics\sources.json | 1147 | "source": "lpeasy.github.io/outsideinprint/collections/floods-water-built-environment", |
| generated_historical_data | data\analytics\sources.json | 1180 | "source": "lpeasy.github.io/outsideinprint/collections", |
| generated_historical_data | data\analytics\sources.json | 1202 | "source": "lpeasy.github.io/outsideinprint/random", |
| generated_historical_data | data\analytics\sources.json | 1224 | "source": "lpeasy.github.io/outsideinprint/essays/in-the-image-of-god", |
| generated_historical_data | data\analytics\sources.json | 1334 | "source": "lpeasy.github.io/outsideinprint/essays/dirt-is-better-than-air", |
| dashboard_or_fixture_compatibility | docs\analytics-system.md | 185 | 6. `.\tools\bin\generated\hugo.cmd --minify --baseURL "https://lpeasy.github.io/outsideinprint/"` |
| intentional_probe_target | docs\seo-admin-checklist.md | 59 | - `https://lpeasy.github.io/outsideinprint/` |
| intentional_probe_target | docs\seo-admin-checklist.md | 60 | - `https://lpeasy.github.io/outsideinprint/about/` |
| intentional_probe_target | docs\seo-admin-checklist.md | 61 | - `https://lpeasy.github.io/outsideinprint/authors/robert-v-ussley/` |
| intentional_probe_target | docs\seo-admin-checklist.md | 62 | - `https://lpeasy.github.io/outsideinprint/collections/risk-uncertainty/` |
| dashboard_or_fixture_compatibility | layouts\partials\masthead_dashboard.html | 1 | {{ $publicSiteURL := site.Params.dashboard.public_site_url \| default "https://lpeasy.github.io/outsideinprint/" }} |
| intentional_probe_target | scripts\diagnose_seo_hosts.ps1 | 220 | 'https://lpeasy.github.io/outsideinprint/', |
| intentional_probe_target | scripts\diagnose_seo_hosts.ps1 | 221 | 'https://lpeasy.github.io/outsideinprint/about/', |
| intentional_probe_target | scripts\diagnose_seo_hosts.ps1 | 222 | 'https://lpeasy.github.io/outsideinprint/authors/robert-v-ussley/', |
| intentional_probe_target | scripts\diagnose_seo_hosts.ps1 | 223 | 'https://lpeasy.github.io/outsideinprint/collections/risk-uncertainty/' |
| intentional_legacy_classification | scripts\freeze_seo_rollout_baseline.ps1 | 5 | [string]$LegacyBaseUrl = 'https://lpeasy.github.io/outsideinprint', |
| intentional_legacy_classification | scripts\import_analytics.ps1 | 291 | return $descriptor.text.ToLowerInvariant().StartsWith("lpeasy.github.io/outsideinprint") |
| dashboard_or_fixture_compatibility | scripts\verify_dashboard.ps1 | 76 | Invoke-Step -Name "Public Hugo build" -Action { & $generatedHugoWrapper --minify --baseURL "https://lpeasy.github.io/outsideinprint/" } |
| dashboard_or_fixture_compatibility | scripts\verify_dashboard.ps1 | 79 | Invoke-Step -Name "Public Hugo build" -Action { hugo --minify --baseURL "https://lpeasy.github.io/outsideinprint/" } |
| intentional_legacy_classification | tests\test_analytics_snapshot_contract.ps1 | 227 | if ($source -eq 'lpeasy.github.io/outsideinprint' -or $source.StartsWith('lpeasy.github.io/outsideinprint/')) { |
| intentional_legacy_classification | tests\test_analytics_snapshot_contract.ps1 | 232 | throw "sources.json must classify lpeasy.github.io/outsideinprint referrals as legacy_domain." |
| dashboard_or_fixture_compatibility | tests\test_pdf_builder_static_image_paths.ps1 | 92 | $script:SiteBaseUrl = "https://lpeasy.github.io/outsideinprint/" |
| dashboard_or_fixture_compatibility | tests\test_pdf_builder_static_image_paths.ps1 | 104 | #image("https://lpeasy.github.io/outsideinprint/images/fixture.jpg") |
| dashboard_or_fixture_compatibility | tests\test_pdf_builder_static_image_paths.ps1 | 142 | ![](https://lpeasy.github.io/outsideinprint/images/fixture.jpg) |

## Operator Notes

- Historical analytics snapshots are expected to preserve legacy-host strings until new data replaces them.
- Dashboard build and fixture references should be reviewed manually before changing them, because some still describe compatibility flows rather than the canonical public site.
- Diagnostic scripts and owner checklists intentionally mention the legacy host so the cutover can be tested directly.
- Any `manual_follow_up` entry is the short list for repo cleanup once the host cutover is complete.
