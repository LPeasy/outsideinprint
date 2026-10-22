# Gallery replaced by an older deployment

## Findings

The source branch retained both PR #194's Disney mini-series navigation and PR #195's Gallery repair. GitHub's `main` ref was `c6a1c2fef9900dcca7b62f2b58ec8be8a841b846` when the incident was inspected. That commit directly follows PR #194's `528abc7b4c2ff595d89ce6a48bea5c8f55c307dd`. No source rollback was found.

The newer release was successfully deployed and verified, then a late workflow for its ancestor replaced production:

| Event on October 22, 2026 | Eastern time | Evidence |
| --- | --- | --- |
| PR #194 merged | 2:39:08 p.m. | Commit `528abc7b` |
| PR #195 merged | 2:56:20 p.m. | Commit `c6a1c2fe` |
| Correct Gallery deployed | 3:01:19 p.m. | [Production run 39835734777](https://github.com/LPeasy/outsideinprint/actions/runs/39835734777) |
| Older push workflow created | 3:10:48 p.m. | [Run 39837820045](https://github.com/LPeasy/outsideinprint/actions/runs/39837820045), event `push`, attempt 1, head `528abc7b` |
| Older Gallery deployed | 3:17:10 p.m. | The same older run's Deploy step |

A fresh canonical manifest read during investigation returned commit `528abc7b4c2ff595d89ce6a48bea5c8f55c307dd` and exact `generatedAtUtc` value `2026-10-22T19:13:46.5530499Z`. The Gallery again showed One for My Sister as current, with the first two Disney illustrations absent. The correct release's previously verified generation timestamp was `2026-10-22T18:58:45.3886790Z`.

The older run built and verified its own source correctly. The workflow checked its own SHA and generation timestamp against the canonical site, but did not compare that SHA with the current `main` ref before deployment. Production concurrency serialized workflow arrival, not commit ancestry. The available API metadata does not establish why GitHub created the older push run after the newer release; no connector, retry, or cache cause is asserted.

## Repair

1. Keep current `main` as the repair base so the series links and Gallery source repair are preserved.
2. Compare each proposed production SHA with a fresh authenticated read of `main` immediately before Pages deployment. Superseded runs skip deployment; invalid inputs and API failures stop the release.
3. Recheck current `main` during final verification and retain the exact canonical commit and original generation-timestamp comparisons. Record head-check diagnostics.
4. Include the independently tested automatic article-illustration Gallery resolver and preserve its configuration through all publisher modes.
5. Audit pending and running older production jobs before restoration. Existing historical runs carry their original workflow definition; do not rerun them to restore a site. Use a fresh build from the checked current release.
6. Publish the repair through a checked PR, owner-authorized automatic merge, fresh production build, and exact canonical verification. Reuse the production receipt for the final confirmation.

The owner requested investigation and restoration in this chat. No direct write to `main`, source rollback, historical-run retry, or artifact replay is part of this repair.
