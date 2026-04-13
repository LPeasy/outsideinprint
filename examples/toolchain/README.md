# Example Manifests

Use these as supported starting points for new repos.

## `manifest.minimal.json`

Use for deterministic baseline repos that only need inbox or explicit machine-wrapper tools.

Assumes:

- Windows PowerShell is present
- `curl.exe` is available at the explicit system path

## `manifest.node-toolchain.json`

Use for repos that need a portable Node-family toolchain with:

- `node`
- `npm`
- `npx`
- `corepack`

Assumes:

- `scripts/export-node-toolchain-to-mirror.ps1` has exported a normalized zip from `C:\Users\lawto\Documents\code_packages`
- `%CODEX_TOOL_MIRROR_ROOT%\node\node-toolchain-v24.11.1-win-x64.zip` exists
- the repo should expose generated `node.cmd`, `npm.cmd`, `npx.cmd`, and `corepack.cmd`

## `manifest.python-runtime.json`

Use for repos that need a pinned portable runtime with mirror-first acquisition and optional shared-cache reuse.

Assumes:

- `%CODEX_TOOL_MIRROR_ROOT%\python\...` is available, or later `source_candidates` are reachable
- the repo should expose a generated `python.cmd`

## `manifest.browser-headless.json`

Use for repos that need a browser wrapper with deterministic machine resolution and repo-local profile/appdata/temp isolation.

Assumes:

- Microsoft Edge is installed at one of the explicit machine candidates
- the repo should expose both `edge.cmd` and `edge-headless.cmd`

## `manifest.office-headless.json`

Use for repos that need Office-style headless automation with machine-install-first behavior and mirrored ZIP fallback.

Assumes:

- LibreOffice is machine-installed, or
- `%CODEX_TOOL_MIRROR_ROOT%\libreoffice\LibreOfficePortable-extracted-24.2.0.zip` is available
- the repo should expose both `soffice.cmd` and `soffice-headless.cmd`
