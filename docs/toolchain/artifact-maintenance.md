# Artifact Maintenance

Use this guide when updating a pinned portable payload, regenerating a mirror artifact, or refreshing verification after a version bump.

## Standard Update Sequence

1. Update the source payload outside the repo.
2. Regenerate the normalized mirror artifact.
3. Compute or verify the new `sha256`.
4. Update the pinned manifest example.
5. Rerun the relevant verification matrix.
6. Refresh verification docs and dates only after the rerun passes.

## Updating The Optional Node Toolchain

The machine-local source for the supported Node pattern is:

`C:\Users\lawto\Documents\code_packages`

The Node example is:

`examples/manifest.node-toolchain.json`

The export script is:

`scripts/export-node-toolchain-to-mirror.ps1`

### Regenerate The Node Mirror Artifact

If `CODEX_TOOL_MIRROR_ROOT` is set:

```powershell
.\scripts\export-node-toolchain-to-mirror.ps1
```

If you want to write to a specific path instead:

```powershell
.\scripts\export-node-toolchain-to-mirror.ps1 -OutputZipPath C:\path\to\mirror\node\node-toolchain-v24.11.1-win-x64.zip
```

The export script:

- validates the required Node subset in `code_packages`
- verifies `node`, `npm`, and `corepack` versions against the pinned Node example manifest
- builds a deterministic zip
- computes the artifact `sha256`
- fails if the exported hash does not match the pinned manifest value

### Update A Node Version Intentionally

When the Node toolchain version really changes:

1. update the source payload in `C:\Users\lawto\Documents\code_packages`
2. update version, asset name, validation regexes, and `sha256` in `examples/manifest.node-toolchain.json`
3. rerun `scripts/export-node-toolchain-to-mirror.ps1`
4. confirm the export script now passes against the new pinned manifest

### Recalculate A SHA-256 Manually

If you need to inspect the hash directly:

```powershell
Get-FileHash -LiteralPath C:\path\to\artifact.zip -Algorithm SHA256
```

Only update the pinned `sha256` after confirming the artifact contents and the version checks are correct.

## Rerun Verification After A Payload Change

At minimum rerun:

```cmd
call tools\generate_tool_wrappers.cmd
call tools\provision_toolchain.cmd
call tools\validate_toolchain.cmd
```

And rerun the relevant disposable-repo matrix for:

- fresh repo adoption
- existing repo adoption
- mirror-first provisioning
- shared-cache hydration
- PATH precedence for the affected tools

After the rerun passes, refresh `docs/general-use-verification.md` so the date and scenario record match the latest evidence.
