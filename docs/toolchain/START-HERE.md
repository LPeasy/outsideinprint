# START HERE

Future Codex agents should read this file first before tailoring the copied toolchain inside an existing repo.

## OutsideInPrint Repo Choices

This repo uses the toolchain layer to support the active web-first publishing workflow for OutsideInPrint.org.

Pinned toolchain contract for this repo:

- Node `20.20.2` for the `20.x` contract in `.nvmrc` and `package.json`
- Hugo `0.157.0`
- PowerShell `7.5.0`
- Python `3.12.9`

Bootstrap local payloads before the first provision run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\bootstrap_toolchain_assets.ps1
```

Then use the normal manifest-driven flow:

```cmd
call tools\generate_tool_wrappers.cmd
call tools\provision_toolchain.cmd
call tools\validate_toolchain.cmd
```

The legacy `.tools/` directory remains bootstrap-only compatibility for this repo. Do not add new runtimes or wrappers there.

Current Codex sandbox note:

- `node` validates normally.
- `npm`, `npx`, and `corepack` may be reported as skipped in this Codex environment because Node can fail to realpath repo script paths here.
- Treat that as an environment limitation, not a repo-local contract failure. Local wrapper usage remains the intended workflow.

## Canonical Source

This toolchain came from:

`C:\Users\lawto\Documents\DependencyTemplate`

If the target repo needs a fresh copy of the canonical template, copy or install it again from that path.

## First Steps In The Target Repo

1. Open `tools/toolchain.manifest.json`.
2. Keep the pinned OutsideInPrint manifest unless the repo contract changes.
3. Run the bootstrap asset staging command if `tools/_downloads/bootstrap/` is missing.
4. Run these commands from the target repo root:

```cmd
call tools\generate_tool_wrappers.cmd
call tools\provision_toolchain.cmd
call tools\validate_toolchain.cmd
```

## Files You Are Expected To Edit

- `tools/toolchain.manifest.json`
- `tools/bin/custom/` only if manifest `wrappers` cannot express the required launch behavior

Do not hand-edit `tools/bin/generated`. It is regenerated from the manifest.

## Which Example To Start From

- `examples/toolchain/manifest.minimal.json`
- `examples/toolchain/manifest.node-toolchain.json`
- `examples/toolchain/manifest.python-runtime.json`
- `examples/toolchain/manifest.browser-headless.json`
- `examples/toolchain/manifest.office-headless.json`

## Mirror And Cache Settings

- `CODEX_TOOL_MIRROR_ROOT` points to a local mirror path. Example manifests use `%CODEX_TOOL_MIRROR_ROOT%\<tool>\<asset>`.
- `CODEX_TOOLCACHE` points to an optional shared runtime cache.

For the optional Node toolchain pattern, first export a normalized zip from `C:\Users\lawto\Documents\code_packages` by running `scripts/export-node-toolchain-to-mirror.ps1` from the canonical template repo. Then use `examples/toolchain/manifest.node-toolchain.json` in the target repo.

Portable acquisition order is fixed:

1. existing repo-local payload
2. shared cache from `CODEX_TOOLCACHE`
3. `source_candidates` in listed order
4. repo-local extraction under `tools/vendor`
5. shared-cache seeding after success

## What To Keep Stable

- Activation PATH order:
  1. `tools/bin/custom`
  2. `tools/bin/generated`
  3. `tools/bin`
- Wrapper resolution order:
  1. `install_path`
  2. `fallback_extract_path`
  3. `machine_candidates`

## Next References

- [../toolchain/manifest-reference.md](manifest-reference.md)
- [../toolchain/copy-into-existing-repo.md](copy-into-existing-repo.md)
- [../toolchain/troubleshooting.md](troubleshooting.md)
- [../toolchain/artifact-maintenance.md](artifact-maintenance.md)
- [../toolchain/dependencytemplate-polishing-prompt-set.md](dependencytemplate-polishing-prompt-set.md)
