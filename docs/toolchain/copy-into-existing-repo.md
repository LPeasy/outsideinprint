# Copy Into Existing Repo

Use `scripts/install-into-target-repo.ps1` when a project already exists and should adopt the toolchain without replacing the repo root.

## Command

```powershell
.\scripts\install-into-target-repo.ps1 `
  -TargetRepoPath C:\Users\lawto\Documents\ExistingRepo `
  -ExampleManifest manifest.python-runtime.json
```

## What The Installer Copies

- `tools/` toolchain engine assets
- `docs/` into `docs/toolchain/`
- `examples/` into `examples/toolchain/`
- reusable `.gitignore` entries

It does not overwrite the target repo root `README.md`.

## What The Installer Preserves

- unrelated repo-root files
- unrelated files already present outside toolchain-managed doc and example subfolders
- existing `tools/bin/custom` content
- existing `tools/toolchain.manifest.json` when `-ExampleManifest` is not provided

## After Copy

1. Read `docs/toolchain/START-HERE.md`.
2. Review `tools/toolchain.manifest.json`.
3. Replace it with a project-specific manifest or start from one of the copied supported examples in `examples/toolchain/`.
4. Run:

```cmd
call tools\generate_tool_wrappers.cmd
call tools\provision_toolchain.cmd
call tools\validate_toolchain.cmd
```

5. Add a hand-written wrapper under `tools/bin/custom` only if manifest `wrappers` cannot express the needed launch behavior.

If the target repo needs the portable Node toolchain example, first export the normalized Node zip from `C:\Users\lawto\Documents\code_packages` by running `scripts/export-node-toolchain-to-mirror.ps1` from the canonical template repo, then switch the target manifest to `examples/toolchain/manifest.node-toolchain.json`.

## Gitignore Merge Block

The installer adds this block if it is not already present:

```text
# >>> DependencyTemplate toolchain >>>
tools/vendor/
tools/_downloads/
tools/_install_logs/
tools/_work/
# <<< DependencyTemplate toolchain <<<
```
