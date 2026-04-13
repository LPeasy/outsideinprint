# Troubleshooting

## I Do Not Know Where To Start

Read `START-HERE.md` in the repo root.

If the toolchain was installed into an existing repo, read `docs/toolchain/START-HERE.md`.

## A Generated Wrapper Is Missing

Regenerate wrappers:

```cmd
call tools\generate_tool_wrappers.cmd
```

If generation fails, check for duplicate tool names, duplicate wrapper names, or a reserved wrapper name.

## A Wrapper Resolves The Wrong Executable

Run:

```cmd
toolname.cmd --toolchain-which
```

Expected runtime resolution order:

1. `install_path`
2. `fallback_extract_path`
3. `machine_candidates`

If the result points into `%LOCALAPPDATA%\Microsoft\WindowsApps`, fix `machine_candidates`. DependencyTemplate rejects those shim paths on purpose.

## Scripts Are Blocked By Execution Policy

Use the `.cmd` entrypoints:

```cmd
call tools\generate_tool_wrappers.cmd
call tools\provision_toolchain.cmd
call tools\validate_toolchain.cmd
```

They always invoke system Windows PowerShell with `-ExecutionPolicy Bypass`.

## Downloads Fail

The engine tries `source_candidates` in order. Preferred ordering is:

1. local mirror path under `%CODEX_TOOL_MIRROR_ROOT%`
2. `file:///` URI
3. direct HTTPS URL

If downloads still fail:

- confirm the mirror path exists
- confirm the later fallback URLs are valid
- inspect `tools/_install_logs/*.log` for the recorded source origin and failure path

## Node Toolchain Export Fails

The supported Node export source is:

`C:\Users\lawto\Documents\code_packages`

The export script requires these source items:

- `node.exe`
- `npm`
- `npm.cmd`
- `npx`
- `npx.cmd`
- `corepack`
- `corepack.cmd`
- `node_modules\npm`
- `node_modules\corepack`

Run:

```powershell
.\scripts\export-node-toolchain-to-mirror.ps1
```

If `CODEX_TOOL_MIRROR_ROOT` is not set, provide `-OutputZipPath` explicitly.

The export script now also fails if:

- `node`, `npm`, or `corepack` version output does not match the pinned Node example manifest
- the deterministic artifact `sha256` does not match the pinned `sha256` in `examples/manifest.node-toolchain.json`

If the source payload intentionally changed, update the pinned manifest and follow `docs/artifact-maintenance.md`.

## Node Commands Resolve Outside `tools/vendor`

Run:

```cmd
call tools\activate-toolchain.cmd
node.cmd --toolchain-which
npm.cmd --toolchain-which
corepack.cmd --toolchain-which
```

All three should resolve inside the repo-local extracted Node payload under `tools/vendor`. If they do not, regenerate wrappers and reprovision from `examples/manifest.node-toolchain.json`.

## Shared Cache Is Ignored

Confirm `CODEX_TOOLCACHE` is set before provisioning.

Portable acquisition order is fixed:

1. existing repo-local payload
2. shared cache
3. `source_candidates`
4. repo-local extraction
5. shared-cache seeding

Wrappers still resolve the repo-local runtime path first.

## Browser Headless Wrapper Emits Warnings

`edge-headless` isolates state under:

- `tools/_work/profiles/edge-headless`
- `tools/_work/appdata/edge-headless`
- `tools/_work/temp/edge-headless`

If those roots are created correctly and `edge-headless.cmd --toolchain-which` resolves the expected executable, remaining browser warnings are machine-specific runtime noise rather than wrapper-resolution failure.

## Office Headless Fallback Does Not Provision

The supported Office example requires one of:

- a machine-installed LibreOffice executable under explicit `machine_candidates`
- a mirrored extracted ZIP artifact under `%CODEX_TOOL_MIRROR_ROOT%\libreoffice\...`

The template does not automate raw `.paf.exe` silent installation.

## What This Template Does Not Reuse From `code_packages`

This pass does not support:

- `python.exe`
- `pythonw.exe`
- `pip.exe`
- `pip3.exe`
- `pip3.13.exe`
- `playwright.exe`
- `t32.exe`, `t64.exe`, `w32.exe`, `w64.exe`, and related launchers

Playwright should later be supported through a proper Node-based project dependency flow, not by wrapping the current `playwright.exe` stub from `code_packages`.
