# Collection-first continuation audit

## Release scope and baseline

Recorded 2026-09-18 against published baseline `0dfda3ca2ad8dc39a86e496ea842f347b0d58b73`.

The approved archive pass reviewed the 62 published reading pieces with no explicit collection assignment: 51 receive one strong topic assignment, seven remain deliberately unassigned, and four await separate editorial review. Two already-assigned essays gain Money, Banking, and Inflation as their first collection while retaining their previous collection second. This is 53 article metadata edits, not 53 new covered articles.

The baseline inventory has 259 published reading pieces, 197 with explicit membership and 194 with at least one public collection. The difference is the three deliberately private Ledger assignments. The expected release inventory remains 259 published reading pieces, with 248 explicitly assigned and 245 covered by public collections. Eleven unassigned pieces plus three private Ledger pieces retain Library fallback on standard reading pages. Coverage is not an engagement or readership measurement.

These figures are the approved audit snapshot, not permanent site totals. Remote main subsequently advanced to `a944b778e9b02271116cfb3f9d1928c21229bf26` with two unrelated publications, `nine-driveways` and `life-is-a-controlled-fall`. Preserve those publications during release integration and recount the final rendered inventory. If both retain their existing public memberships, the integrated release will have 247 covered pieces out of 261; do not overwrite their content or treat their publication as part of these 53 assignments. The JSON below deliberately retains the original 194/259 to 245/259 snapshot for reproducibility.

Published inventory includes reading pages under essays, reports, working papers, and Syd & Oliver, including dialogues, Musings, and Affirmations stored under essays. It excludes draft, future-date, future-release, expired, and landing pages. Almanack issues are outside this reading-piece denominator. Hugo's rendered public eligibility is authoritative; do not substitute the legacy audit script's heuristic membership count.

## New collection definitions

| Slug | Start Here | Launch members | Scope |
| --- | --- | ---: | --- |
| `money-banking-inflation` | Gold Standard | 3 | Archive essays on monetary systems, central banks, credit, and inflation. |
| `brands-business-consumer-choice` | Modelo | 7 | Business case studies on brands, pricing, distribution, and consumer choice. |

Both are public, explicit-only topics with `min_items: 3`, `force_public: false`, and the existing default social image. Their weights are 100 and 105 respectively. No article collection weights are introduced.

Money's launch set is Gold Standard, The Fed Chair Is Not a Button, and CPI Report Economic Analysis. The latter two retain their civic/household memberships second. Original publication dates remain visible; dated analyses and prices are archive material, not a refreshed claim of current guidance.

## Exact assignment and exclusion ledger

This JSON is a release audit record, not a runtime recommendation database. Keys are canonical article slugs; values are the complete intended `collections` arrays in preference order. The `assignments` object contains exactly 53 entries. Content remains the source of membership truth and `data/collections.yaml` remains the source of collection definitions.

```json
{
  "baseline": {
    "publishedReadingPieces": 259,
    "publicCollectionMembers": 194
  },
  "expected": {
    "publishedReadingPieces": 259,
    "publicCollectionMembers": 245
  },
  "assignments": {
    "why-a-return-to-the-gold-standard-would-break-the-economy": [
      "money-banking-inflation"
    ],
    "whos-drinking-all-the-modelo": [
      "brands-business-consumer-choice"
    ],
    "uncrustables-the-billion-dollar-peanut-butter-empire": [
      "brands-business-consumer-choice"
    ],
    "why-more-people-are-choosing-chilis-over-mcdonald-s-in-2025": [
      "brands-business-consumer-choice"
    ],
    "the-max-mistake-why-hbos-name-change-backfired": [
      "brands-business-consumer-choice"
    ],
    "the-bars-on-the-gum": [
      "brands-business-consumer-choice"
    ],
    "fine-china-the-long-road-from-jingdezhen-to-grandmas-cabinet": [
      "brands-business-consumer-choice"
    ],
    "the-political-economy-of-airports": [
      "brands-business-consumer-choice"
    ],
    "the-clock-by-the-door": [
      "household-economy-work-and-cost"
    ],
    "1929-2029-americas-century-of-humiliation": [
      "household-economy-work-and-cost"
    ],
    "let-it-crash-the-opportunity-of-a-lifetime": [
      "household-economy-work-and-cost"
    ],
    "you-paid-for-that-ct-scan": [
      "technology-ai-machine-future"
    ],
    "the-new-meta-economy": [
      "technology-ai-machine-future"
    ],
    "vice-president-jd-vance-announces-ai-powered-border-security-plan-in-texas": [
      "technology-ai-machine-future"
    ],
    "the-privacy-paradox-why-americans-feel-powerless-over-their-personal-data": [
      "technology-ai-machine-future"
    ],
    "you-cant-outrun-the-calculator": [
      "technology-ai-machine-future"
    ],
    "altmans-law": [
      "technology-ai-machine-future"
    ],
    "a-really-boring-topic": [
      "technology-ai-machine-future"
    ],
    "how-american-farm-labor-is-set-to-evolve": [
      "technology-ai-machine-future"
    ],
    "the-ladder-outside-the-window": [
      "risk-uncertainty"
    ],
    "the-bell-at-the-crossing-flagship": [
      "risk-uncertainty"
    ],
    "explaining-mutually-exclusive-and-collectively-exhaustive-where-did-my-paycheck-go": [
      "risk-uncertainty"
    ],
    "rethinking-invasive-species-management": [
      "risk-uncertainty"
    ],
    "the-slow-way-is-the-fast-way": [
      "risk-uncertainty"
    ],
    "consent-from-permission-to-sanctity": [
      "moral-religious-philosophical-essays"
    ],
    "from-variety-to-virtue": [
      "moral-religious-philosophical-essays"
    ],
    "life-is-a-bull-market": [
      "moral-religious-philosophical-essays"
    ],
    "8-big-questions-everyone-has-about-pope-leo-xiv": [
      "moral-religious-philosophical-essays"
    ],
    "biter-the-slang-word-that-hits": [
      "moral-religious-philosophical-essays"
    ],
    "the-roi-of-caring": [
      "moral-religious-philosophical-essays"
    ],
    "the-three-enemies-of-positive-outcomes": [
      "moral-religious-philosophical-essays"
    ],
    "are-we-alone": [
      "moral-religious-philosophical-essays"
    ],
    "the-little-machine-in-the-glass-case": [
      "civic-institutions-and-public-power"
    ],
    "the-cone-in-the-lane": [
      "civic-institutions-and-public-power"
    ],
    "the-stamp-on-the-meat-flagship": [
      "civic-institutions-and-public-power"
    ],
    "the-mailbox-at-the-edge-of-the-road": [
      "civic-institutions-and-public-power"
    ],
    "2025-supreme-court-wrap-up": [
      "civic-institutions-and-public-power"
    ],
    "cuomo-vs-mamdani-nyc-2025": [
      "civic-institutions-and-public-power"
    ],
    "june-27-2025-scotus-set-to-close-its-term-with-major-decisions": [
      "civic-institutions-and-public-power"
    ],
    "elon-musk-doge-and-the-five-bullet-email-how-gwes-became-a-federal-workforce-loyalty-test": [
      "civic-institutions-and-public-power"
    ],
    "is-doge-legal": [
      "civic-institutions-and-public-power"
    ],
    "the-undead-state": [
      "civic-institutions-and-public-power"
    ],
    "deference-lost": [
      "civic-institutions-and-public-power"
    ],
    "its-hard-to-condemn-what-doge-is-doing": [
      "civic-institutions-and-public-power"
    ],
    "declaring-equality": [
      "civic-institutions-and-public-power"
    ],
    "why-oberfell-will-not-be-overturned": [
      "civic-institutions-and-public-power"
    ],
    "federalism-in-modern-american-society": [
      "civic-institutions-and-public-power"
    ],
    "presidential-elections": [
      "civic-institutions-and-public-power"
    ],
    "rational-ignorance-in-the-u-s-presidential-electorate": [
      "civic-institutions-and-public-power"
    ],
    "the-structure-of-modern-american-society": [
      "civic-institutions-and-public-power"
    ],
    "building-for-centuries-not-election-cycles": [
      "floods-water-built-environment"
    ],
    "the-fed-chair-is-not-a-button": [
      "money-banking-inflation",
      "civic-institutions-and-public-power"
    ],
    "cpi-report-economic-analysis": [
      "money-banking-inflation",
      "household-economy-work-and-cost"
    ]
  },
  "excluded": [
    "no-homo-true-history-not-being-gay-with-your-bros",
    "what-i-learned-from-writing-100-essays-on-medium-in-2025",
    "the-rise-fall-and-reemergence-of-the-r-word-why-is-it-trending-again",
    "why-we-celebrate-memorial-day-origins-traditions-and-importance",
    "literacy-in-the-united-states-and-the-world",
    "etfs-and-market-concentration",
    "natural-asset-companies"
  ],
  "editorialHolds": [
    "inflation-myths-why-private-banks-not-just-government-spending-drive-prices-up",
    "mcdonalds-faces-week-long-boycott-june-24-2025",
    "hindsight-2026-d4vd-alleged-romantic-homicide",
    "the-fair-price-of-bitcoin-69420"
  ],
  "privateLedger": [
    "the-ledger-vol-1",
    "the-ledger-vol-2",
    "the-ledger-vol-3"
  ]
}
```

The seven `excluded` pieces have no sufficiently strong match in the approved collection set. The four `editorialHolds` receive no new collection promotion pending separately scoped review. This release does not unpublish, rewrite, remove existing discovery access, or make any factual-review clearance claim for them. The three `privateLedger` articles and the Ledger's private status remain unchanged.

## Pre-existing editorial follow-ups

A full-content preflight on 2026-09-18, rerun against all 53 targets with `-RequireDescription -RequireFeaturedImage -RequireEditorialPhilosophyAudit`, reports blocking findings in 23 distinct files. These are pre-existing findings, not failures introduced by collection metadata. The legacy heuristic audit separately reports warnings in 26 files; its warning count is not the 23-file blocking total.

The command deliberately uses explicit target paths and therefore does not apply the committed metadata-only exemption. It exits unsuccessfully for the findings below. A successful collection-only release gate is not a claim that the complete essay corpus passes a new editorial audit.

| Article slug | Existing full-content findings |
| --- | --- |
| `a-really-boring-topic` | `missing_editorial_philosophy_audit`, `medium_punctuation_artifact` |
| `altmans-law` | `missing_editorial_philosophy_audit` |
| `are-we-alone` | `adverbial_still_construction`, `missing_editorial_philosophy_audit` |
| `cpi-report-economic-analysis` | `missing_editorial_philosophy_audit` |
| `declaring-equality` | `missing_editorial_philosophy_audit`, `medium_punctuation_artifact` |
| `deference-lost` | `adverbial_still_construction` |
| `explaining-mutually-exclusive-and-collectively-exhaustive-where-did-my-paycheck-go` | `missing_featured_image` |
| `federalism-in-modern-american-society` | `missing_editorial_philosophy_audit` |
| `how-american-farm-labor-is-set-to-evolve` | `adverbial_still_construction`, `missing_editorial_philosophy_audit` |
| `its-hard-to-condemn-what-doge-is-doing` | `missing_editorial_philosophy_audit` |
| `let-it-crash-the-opportunity-of-a-lifetime` | `adverbial_still_construction`, `that_matters_framing` |
| `presidential-elections` | `missing_editorial_philosophy_audit` |
| `rational-ignorance-in-the-u-s-presidential-electorate` | `missing_editorial_philosophy_audit` |
| `the-clock-by-the-door` | `adverbial_still_construction` |
| `the-privacy-paradox-why-americans-feel-powerless-over-their-personal-data` | `adverbial_still_construction` |
| `the-slow-way-is-the-fast-way` | `adverbial_still_construction` |
| `the-structure-of-modern-american-society` | `missing_editorial_philosophy_audit` |
| `the-three-enemies-of-positive-outcomes` | `adverbial_still_construction` |
| `the-undead-state` | `adverbial_still_construction` |
| `whos-drinking-all-the-modelo` | `adverbial_still_construction` |
| `why-a-return-to-the-gold-standard-would-break-the-economy` | `adverbial_still_construction` |
| `why-oberfell-will-not-be-overturned` | `missing_editorial_philosophy_audit`, `medium_punctuation_artifact` |
| `you-cant-outrun-the-calculator` | `adverbial_still_construction` |

Do not fix these by silently rewriting prose, inventing audit PASS evidence, or weakening the guardrails. Follow-up content repair requires its own editorial scope and normal audit/version rules. For this release, use the existing ref-to-ref collection-metadata exemption only after the actual committed base/head comparison proves that each affected article changes allowlisted collection fields and nothing else. A change outside those fields restores the normal full-content gate.

## Preservation and maintenance

The implementation byte comparison removes only each front-matter `collections` block and compares the remaining bytes with HEAD. All 53 remaining files match exactly, including existing mixed line endings and trailing blank lines. Article bodies, images, in-body links, dates, titles, versions, editions, and revision histories are unchanged. The Pope articles' existing direct cross-links are not part of this metadata edit.

Future publishing chooses one strong collection, at most two; no good fit uses Library fallback. Maintain descriptions and Start Here choices centrally. A collection assignment does not require matching an article to individual recommendations or adding a collection weight.

Standard continuation prefers the first eligible topic, otherwise the first eligible series, while retaining same-kind preference order. Header membership links retain their front-matter order. Custom featured continuations and Studio exits remain explicit exceptions.

At this release, `collection_click` / `article_continuation_primary` changes destination semantics for standard articles from an individual next article to the selected collection. Preserved custom continuations can still lead to articles. Interpret analytics across that cutover accordingly; no new event or schema is introduced. Library fallback retains `internal_promo_click` / `article_exit_paths`. Browser-local visit keys remain `oip-reading-progress:v1:<collection-slug>`; this release does not erase visit history or introduce visible progress counters.
