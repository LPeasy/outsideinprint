# GitHub Auth Repair Workflow

This note records the GitHub authorization failures encountered during an Outside In Print publish session on April 23, 2026, the configuration changes that resolved them, and the verification workflow that proved normal Git and GitHub access were working again.

## Symptoms We Hit

- `gh auth status` looked valid in one shell while Codex still saw an invalid token.
- Codex and the interactive shell were not using the same `GH_CONFIG_DIR`.
- `git push` sometimes failed with auth errors such as `401 Unauthorized`, `403`, or `could not read Username for 'https://github.com'`.
- Windows Credential Manager still held a stale `git:https://github.com` credential that competed with the intended `gh auth git-credential` path.
- At least one local push attempt surfaced a native `git-remote-https.exe` application crash. That crash did not reproduce after the credential path was cleaned up.

## Root Cause Pattern

The durable problem was not repository permissions. The machine had multiple GitHub credential paths active at the same time:

- a `gh` profile under `C:\Users\lawto\AppData\Roaming\GitHub CLI`
- a second `gh` profile under `C:\Users\lawto\Documents\.gh-config`
- Git Credential Manager as the global Git helper
- a stale Windows Credential Manager GitHub entry
- repo-specific GitHub helper configuration that sometimes pointed at a different `gh` context than the one the user had just authenticated

That combination produced inconsistent behavior across shells and sessions. One process could see a valid token while another process still resolved credentials through the stale path.

## Stable Fix

The working repair was:

1. Standardize `GH_CONFIG_DIR` to `C:\Users\lawto\Documents\.gh-config`.
2. Add pinned Codex wrappers:
   - `C:\Users\lawto\.codex\bin\gh-codex.cmd`
   - `C:\Users\lawto\.codex\bin\gh-codex-auth-helper.cmd`
3. Update `C:\Users\lawto\.gitconfig` so GitHub and gist credentials reset the helper chain and use only the pinned `gh` helper:

   ```ini
   [credential]
   	helper = manager
   [credential "https://github.com"]
   	helper =
   	helper = !'C:\\Users\\lawto\\.codex\\bin\\gh-codex-auth-helper.cmd'
   [credential "https://gist.github.com"]
   	helper =
   	helper = !'C:\\Users\\lawto\\.codex\\bin\\gh-codex-auth-helper.cmd'
   ```

4. Delete the stale Windows Credential Manager entry:

   ```powershell
   cmdkey /delete:LegacyGeneric:target=git:https://github.com
   ```

5. Confirm the pinned `gh` path is authenticated:

   ```powershell
   & 'C:\Users\lawto\.codex\bin\gh-codex.cmd' auth status
   ```

## Verification Workflow

Use this sequence when GitHub auth looks suspicious:

### 1. Confirm the pinned `gh` profile

```powershell
& 'C:\Users\lawto\.codex\bin\gh-codex.cmd' auth status
```

Expected result:

- active account is `LPeasy`
- token scopes include `repo` and `workflow`

### 2. Confirm Git is resolving credentials through the pinned helper

```powershell
@"
protocol=https
host=github.com

"@ | git credential fill
```

Expected result:

- `username=LPeasy`
- `password=` resolves to the current GitHub token from the pinned `gh` profile

### 3. Confirm read access over HTTPS

```powershell
git ls-remote https://github.com/LPeasy/outsideinprint.git HEAD
```

### 4. Confirm write access with a harmless branch probe

For Git transport:

```powershell
git -C C:\Users\lawto\Documents\OutsideInPrint\outsideinprint fetch origin main --quiet
git -C C:\Users\lawto\Documents\OutsideInPrint\outsideinprint push origin refs/remotes/origin/main:refs/heads/codex-auth-probe-<timestamp>
git -C C:\Users\lawto\Documents\OutsideInPrint\outsideinprint push origin :refs/heads/codex-auth-probe-<timestamp>
```

For the GitHub CLI or API path:

```powershell
& 'C:\Users\lawto\.codex\bin\gh-codex.cmd' api repos/LPeasy/outsideinprint/git/ref/heads/main --jq .object.sha
```

Then create and delete a temporary branch through `gh api` if needed.

## What Counted as Success

The repair was considered complete only after all of these were true:

- the pinned `gh` wrapper showed a valid logged-in account
- `git credential fill` returned the pinned GitHub token
- HTTPS `git ls-remote` succeeded
- a temporary remote branch could be created and deleted successfully
- a real publish commit could be pushed to `main`

That final condition was satisfied on April 23, 2026 when the AI data center essay publish reached `main` and GitHub Actions deployed it successfully.

## Note on the Earlier `git-remote-https.exe` Crash

The native Windows crash did happen during the broken credential state, but no reliable Event Viewer or WER dump was available afterward, and the crash did not reproduce once the credential path was cleaned up.

Operationally, the fix is to treat split `gh` profiles and competing Windows Git credentials as the first thing to repair. Once those were removed, normal HTTPS Git behavior returned.
