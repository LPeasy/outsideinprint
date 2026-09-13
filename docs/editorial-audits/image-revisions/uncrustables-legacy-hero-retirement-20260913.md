# Uncrustables legacy hero retirement

Date: 2026-09-13
Authorization: The owner requested an original Uncrustables illustration as the essay hero and a Gallery entry, while preserving The Morning After as the featured front-page illustration.

The former J.M. Smucker hero URL is `/images/medium/uncrustables-the-billion-dollar-peanut-butter-empire/fc80734f9875292b718dcdf753b8ee19fa6bfb010a7fa92750eb15755b49b296.jpeg`. Its static source remains at the same path beneath `static/`, with SHA-256 `fc80734f9875292b718dcdf753b8ee19fa6bfb010a7fa92750eb15755b49b296` and length 115,099 bytes. It is retained for historical continuity, with no live content or data reference.

The replacement is the approved managed asset `essays/uncrustables-the-billion-dollar-peanut-butter-empire/hero`, selected by the essay's `featured_image` and the Gallery entry `the-simple-lunch`. The generation and visual review are recorded in [the image revision audit](uncrustables-20260913.md).

`tests/test_responsive_image_source_contract.ps1` permits this exact retirement only. It checks the old file hash, absence of the former URL from content/data, and the exact essay-to-approved-asset replacement. The live compact Medium reference set is the frozen 316-file fleet minus this one retired hero, leaving 315 references. All 316 static files must remain; the historical inventory, Git baseline hashes, and all other managed-image checks remain unchanged.
