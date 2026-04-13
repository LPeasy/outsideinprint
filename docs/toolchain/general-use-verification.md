# General Use Verification

Verification date: `2026-04-10`

## Readiness Verdict

DependencyTemplate is suitable for general Windows-first use.

Mandatory scenarios passed for:

- root template baseline provisioning and validation
- schema and manifest contract enforcement
- deterministic wrapper generation and PATH precedence
- fresh-repo adoption
- existing-repo installation
- mirror-first provisioning
- shared-cache hydration
- deterministic Node mirror export from `C:\Users\lawto\Documents\code_packages`
- Node artifact integrity pinning and version verification
- machine-install fallback extraction
- explicit `fallback-extract`
- WindowsApps and fake-PATH conflict handling
- browser/headless wrapper isolation
- Office/headless mirrored fallback with repo-local state isolation

Non-blocking caveats remain:

- direct outbound HTTPS fallback was not revalidated on this host because the machine still has Schannel credential issues
- headless Edge still emitted a Crashpad warning on this machine even though wrapper resolution and repo-local state isolation worked
- Office/headless validation still depends on a mirrored extracted ZIP fixture in this environment rather than a real LibreOffice payload
- the `soffice-headless` wrapper state-isolation pattern was validated, but the fixture executable is still `curl.exe`, so the actual LibreOffice headless behavior is not proven by this machine test

## Scenario Matrix

| Scenario | Result | Notes |
| --- | --- | --- |
| Root baseline generate/provision/validate | Pass | Default `tools/toolchain.manifest.json` validated cleanly |
| Root wrapper diagnostics in PowerShell and `cmd.exe` | Pass | `powershell.cmd --toolchain-validate` and `curl.cmd --toolchain-which` succeeded |
| Execution-policy-safe `.cmd` entrypoints | Pass | `.cmd` entrypoint worked while direct `validate_toolchain.ps1` under `ExecutionPolicy Restricted` failed as expected |
| `1.0` manifest compatibility | Pass | `validate_toolchain.cmd -ManifestPath tools/manifest-1.0.json` succeeded |
| Unknown schema version rejection | Pass | unsupported `9.9` failed fast |
| Duplicate tool-name rejection | Pass | duplicate `powershell` manifest failed fast |
| Duplicate wrapper-name rejection | Pass | duplicate generated wrapper `shared` failed fast |
| Reserved wrapper-name rejection | Pass | `invoke-tool` wrapper name failed fast |
| Malformed field rejection | Pass | non-boolean `required` and non-array `validate.arguments` failed fast |
| Deterministic wrapper generation | Pass | default wrappers regenerated, stale generated wrappers removed, `.gitkeep` preserved |
| `tools/bin/custom` preservation and PATH precedence | Pass | custom `curl.cmd` stayed intact and resolved before generated wrapper |
| Fresh repo from template | Pass | `new-project-from-template.ps1` created working repos and pointed to `START-HERE.md` |
| Existing repo installation | Pass | installer copied toolchain assets into an existing repo, preserved the root `README.md`, preserved `tools/bin/custom`, and pointed to `docs/toolchain/START-HERE.md` |
| Node mirror export | Pass | `export-node-toolchain-to-mirror.ps1` exported `node-toolchain-v24.11.1-win-x64.zip` from `C:\Users\lawto\Documents\code_packages` |
| Node export determinism | Pass | repeated exports produced the same `sha256`: `1dcce189f93bcaa3b17b57e779a3952a8fd0c29dfc96c0c846c4fd21cb92cd1d` |
| Node export version verification | Pass | export script verified `node`, `npm`, and `corepack` versions against the pinned Node example manifest |
| Node export contents | Pass | zip contained the supported Node subset and excluded Python, Playwright, and launcher files |
| Fresh repo Node adoption | Pass | `manifest.node-toolchain.json` provisioned `node`, `npm`, `npx`, and `corepack` into repo-local `tools/vendor` |
| Existing repo Node adoption | Pass | installer plus `manifest.node-toolchain.json` provisioned the Node toolchain cleanly in an existing repo |
| Node shared-cache hydration | Pass | second repo provisioned the Node toolchain from `CODEX_TOOLCACHE` into its own repo-local `tools/vendor` |
| Node PATH precedence | Pass | generated `node.cmd`, `npm.cmd`, `npx.cmd`, and `corepack.cmd` resolved before fake PATH conflicts after activation |
| Mirror-first portable acquisition | Pass | Python fixture provisioned from `%CODEX_TOOL_MIRROR_ROOT%` and logged `Source=local-mirror` |
| Machine-install fallback extraction | Pass | missing machine install fell back to repo-local portable extraction and logged `FallbackExtract=true` |
| `fallback-extract` root resolution | Pass | extracted payload resolved from `fallback_extract_path` rather than `install_path` |
| WindowsApps candidate rejection | Pass | fake WindowsApps executable was ignored and system `curl.exe` won |
| Browser/headless wrapper | Pass with caveat | `edge-headless` resolved deterministically and created `tools/_work/profiles/edge-headless`, `tools/_work/appdata/edge-headless`, and `tools/_work/temp/edge-headless`; Edge emitted a non-blocking Crashpad warning |
| Office/headless wrapper | Pass with caveat | mirrored extracted ZIP fallback validated, `soffice` resolved repo-local fallback executable, and `soffice-headless` created repo-local profile/appdata/temp roots; the fixture executable exited nonzero because it is not real LibreOffice |

## Commands Run

Representative commands used during the matrix:

```cmd
call tools\generate_tool_wrappers.cmd
call tools\provision_toolchain.cmd
call tools\validate_toolchain.cmd
call tools\activate-toolchain.cmd
toolname.cmd --toolchain-which
toolname.cmd --toolchain-validate
```

Fresh-repo workflow:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\new-project-from-template.ps1 -TargetPath <repo> -ExampleManifest <example>
```

Existing-repo workflow:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-into-target-repo.ps1 -TargetRepoPath <repo> -ExampleManifest <example>
```

Node mirror export workflow:

```powershell
$env:CODEX_TOOL_MIRROR_ROOT = 'C:\path\to\mirror'
.\scripts\export-node-toolchain-to-mirror.ps1
```

## Final Notes

The template is ready for reuse when adopters follow the documented workflow:

1. read `START-HERE.md`
2. choose or edit `tools/toolchain.manifest.json`
3. run wrapper generation
4. run provisioning
5. run validation

The optional Node toolchain pattern is now part of the supported template surface. It relies on a deterministic mirror artifact exported from `C:\Users\lawto\Documents\code_packages`, pinned by `sha256`, and provisioned into repo-local `tools/vendor` rather than being wrapped directly from the source folder.
