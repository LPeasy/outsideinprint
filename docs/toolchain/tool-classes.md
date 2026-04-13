# Tool Classes

DependencyTemplate supports five tool classes in schema v1.

## `existing-runtime`

Use when Windows already ships the runtime and the repo only needs a deterministic wrapper.

Good fits:

- Windows PowerShell
- `tar.exe`

## `machine-wrapper`

Use when the tool normally comes from a machine install and the repo should wrap it without relying on ambient `PATH`.

Good fits:

- `curl.exe`
- `msedge.exe`

## `portable-download`

Use for tools that can be downloaded or copied as a zip, tarball, or single portable executable.

Portable acquisition order is fixed:

1. existing repo-local payload
2. shared cache from `CODEX_TOOLCACHE`
3. `source_candidates` in listed order
4. repo-local extraction under `tools/vendor`
5. shared-cache seeding after success

Good fits:

- Python embeddable runtime
- standalone CLIs with zip releases

## `machine-install`

Use when the preferred runtime is a machine install, but the repo should remain usable without admin rights when a fallback payload is available.

The engine first checks repo-local and machine candidates. If neither resolves and a fallback extract root plus portable source candidates are configured, it provisions the fallback into the repo.

Good fits:

- LibreOffice
- GUI-origin applications with mirrored ZIP fallback

## `fallback-extract`

Use when the tool should always land in a repo-local extracted location but the extracted root differs from `install_path`.

## Wrapper Modes

Wrapper mode is orthogonal to tool class.

- `direct`: invoke the resolved executable directly
- `gui-headless`: invoke the resolved executable with repo-local profile state and wrapper-supplied default arguments

Use `gui-headless` when a browser or desktop tool needs:

- repo-local profile roots
- optional isolated appdata and temp directories
- non-interactive launch defaults
- manifest-driven stable commands rather than hand-written wrappers

## Shared Guarantees

All classes use the same runtime resolution order:

1. `install_path`
2. `fallback_extract_path`
3. `machine_candidates`

All generated wrappers support:

- `--toolchain-which`
- `--toolchain-validate`
