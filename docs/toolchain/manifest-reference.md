# Manifest Reference

`tools/toolchain.manifest.json` is the only required configuration file for the toolchain engine.

## Supported Schema Versions

- `1.0`: compatibility format
- `1.1`: current format with `source_candidates` and manifest-driven `wrappers`

Any other `schema_version` fails during both provisioning and validation.

## Stable Contract For Adopters

These parts are treated as stable template surface:

- required top-level manifest fields
- required tool fields
- supported tool classes
- generated wrapper names
- activation PATH order
- wrapper runtime resolution order
- `CODEX_TOOL_MIRROR_ROOT` and `CODEX_TOOLCACHE`
- wrapper placeholder semantics for `{profile_dir}`, `{profile_uri}`, and `{repo_root}`

## Top-Level Schema

```json
{
  "schema_version": "1.1",
  "platform": "windows",
  "cache_strategy": "repo-local-with-optional-shared-cache",
  "tools": []
}
```

### Required Top-Level Fields

- `schema_version`
- `platform`
- `cache_strategy`
- `tools`

### Top-Level Validation Rules

- `schema_version` must be `1.0` or `1.1`
- `platform` must be `windows`
- `cache_strategy` must be a non-empty string
- `tools` must be an array
- tool names must be unique
- generated wrapper names must be unique across all tools

## Tool Definition

### Required Fields

- `name`
- `kind`
- `version`
- `required`
- `install_path`
- `launch_path`
- `validate`

### Optional Fields

- `source_url`
- `source_candidates`
- `asset_name`
- `sha256`
- `fallback_extract_path`
- `machine_candidates`
- `env`
- `wrappers`
- `notes`

### Tool Validation Rules

- `name`, `kind`, `version`, `install_path`, and `launch_path` must be non-empty strings
- `name` must match `^[A-Za-z0-9._-]+$`
- `required` must be a boolean
- `validate` must be an object
- `validate.arguments` must be a non-empty array of strings
- `validate.match_regex`, when present, must be a non-empty string
- `env`, when present, must be an object
- `machine_candidates`, when present, must be a non-empty array of strings
- `source_url`, when present, must be a non-empty string
- `source_candidates`, when present, must be a non-empty array of strings
- `wrappers`, when present, must be an array

## Tool Classes

Supported classes in v1:

- `existing-runtime`
- `machine-wrapper`
- `portable-download`
- `machine-install`
- `fallback-extract`

## `source_url` And `source_candidates`

- `source_url` remains the single-source shorthand
- `source_candidates` is the preferred `1.1` form
- when both are present, `source_candidates` wins
- portable acquisition order is fixed:
  1. existing repo-local payload
  2. shared cache from `CODEX_TOOLCACHE`
  3. `source_candidates` in listed order
  4. repo-local extraction under `tools/vendor`
  5. shared-cache seeding after success

Example:

```json
{
  "source_candidates": [
    "%CODEX_TOOL_MIRROR_ROOT%\\python\\python-3.11.9-embed-amd64.zip",
    "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"
  ]
}
```

Node-family tools can share one extracted payload by using the same `install_path`, `source_candidates`, and `asset_name` while varying only `name`, `launch_path`, and validation.

## Validation Block

```json
{
  "arguments": ["--version"],
  "match_regex": "^tool\\s"
}
```

Validation succeeds only when:

1. the executable resolves through normal runtime order
2. the process exits with code `0`
3. `match_regex` is absent or matches combined output

## Wrapper Definitions (`1.1`)

Wrappers generate stable commands into `tools/bin/generated`.

```json
{
  "wrappers": [
    {
      "name": "edge-headless",
      "mode": "gui-headless",
      "default_arguments": [
        "--headless=new",
        "--user-data-dir={profile_dir}\\UserData"
      ],
      "profile_strategy": "repo-local",
      "profile_subpath": "edge-headless",
      "isolate_appdata": true,
      "isolate_temp": true,
      "env": {
        "EXAMPLE_FLAG": "{repo_root}"
      }
    }
  ]
}
```

### Wrapper Fields

- `name`
- `mode`
- `default_arguments`
- `profile_strategy`
- `profile_subpath`
- `isolate_appdata`
- `isolate_temp`
- `env`

### Wrapper Validation Rules

- wrapper names must match `^[A-Za-z0-9._-]+$`
- wrapper names must be unique per tool and across all generated wrappers
- wrapper names cannot use reserved command names:
  - `invoke-tool`
  - `activate-toolchain`
  - `generate_tool_wrappers`
  - `provision_toolchain`
  - `validate_toolchain`
- `mode` must be `direct` or `gui-headless`
- `profile_strategy` must be `none` or `repo-local`
- `profile_subpath` is required when `profile_strategy` is `repo-local`
- `default_arguments`, when present, must be a non-empty array of strings
- `isolate_appdata` and `isolate_temp`, when present, must be booleans
- `env`, when present, must be an object

### Placeholder Expansion

These placeholders work in wrapper arguments and wrapper environment values:

- `{profile_dir}`
- `{profile_uri}`
- `{repo_root}`

## Runtime Resolution Order

All wrappers and validation use the same executable resolution order:

1. repo-local `install_path`
2. repo-local `fallback_extract_path`
3. explicit `machine_candidates`

The engine does not use ambient `PATH` as the primary source of truth.

## Shared Install Root Pattern

Multiple tools may intentionally share one portable payload root. The supported Node example does this for:

- `node.exe`
- `npm.cmd`
- `npx.cmd`
- `corepack.cmd`

The engine behavior is:

1. the first tool extracts the shared portable payload into `install_path`
2. later tools reuse the already-present repo-local payload
3. wrappers still resolve each tool by its own `launch_path`
4. the shared artifact may be pinned with one identical `sha256` value across all tools that reference it

## GUI/Headless State Roots

For `gui-headless` wrappers:

- profiles live under `tools/_work/profiles/<profile_subpath>`
- isolated appdata lives under `tools/_work/appdata/<wrapper_name>`
- isolated temp lives under `tools/_work/temp/<wrapper_name>`

## Wrapper Generation Workflow

After editing a `1.1` manifest:

```cmd
call tools\generate_tool_wrappers.cmd
call tools\provision_toolchain.cmd
call tools\validate_toolchain.cmd
```
