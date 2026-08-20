# Private Florida tax-data preparation and importer

## PointMatch source preparation

`pointmatch-source-prepare.mjs` converts one privately preserved, config-bound
Florida PointMatch statewide outer ZIP into the globally ZIP5-sorted CSV required
by the HMAC importer below. It reads the 67 county CSV entries directly from the
archive. It ignores the supplemental non-CSV ZIP and never extracts raw source
rows to the filesystem.

The preparer is private-only. Its config, archive, temporary chunks, output, and
validation target must stay outside the repository or under the ignored
`workers/oip-commerce/.private-imports/` directory. The same lexical, realpath,
symlink, junction, reparse-point, and Windows 8.3-alias defenses used by the
importer apply. Existing output is never overwritten.

Run Node through the repository wrapper from the site root:

```powershell
.\tools\bin\generated\node.cmd .\workers\oip-commerce\tools\pointmatch-source-prepare.mjs digest --input D:\OIP-Private\fl-tax\pointmatch-release.zip
.\tools\bin\generated\node.cmd .\workers\oip-commerce\tools\pointmatch-source-prepare.mjs prepare --config D:\OIP-Private\fl-tax\prep-config.json --output D:\OIP-Private\fl-tax\prepared-release
.\tools\bin\generated\node.cmd .\workers\oip-commerce\tools\pointmatch-source-prepare.mjs validate --bundle D:\OIP-Private\fl-tax\prepared-release
```

`digest` prints only the archive SHA-256 and byte count for the private config.
`prepare` and `validate` print aggregate row counts only. Errors contain an opaque
archive-entry label, record number, and semantic field where useful; they never
contain a source cell, address, source path, or digest.

### Preparation config

The root object has exactly these keys:

```json
{
  "schema_version": "oip-pointmatch-source-prep-config-v1",
  "dataset_version": "private-immutable-version",
  "prepared_at": "2026-01-02T12:30:00Z",
  "source": {},
  "preparation": {}
}
```

`source` has exactly:

- `label`, an opaque safe label;
- `path`, relative to the config or an absolute private path;
- `expected_sha256`, `expected_bytes`, and `expected_rows`, bound to the privately
  preserved official archive and release evidence;
- `effective_date`, the selected Master-list build date as `YYYY-MM-DD`;
- `effdate_format`, exactly `MM/DD/YYYY` for the bound live county CSV schema;
- `csv_encoding`, exactly `utf-8` or `windows-1252`, selected from private source
  inspection;
- `authority`, official HTTPS `url`, nullable `release_date`, exact
  `release_date_status` (`STATED_BY_SOURCE` or `NOT_STATED_BY_SOURCE`), whole-second
  UTC `retrieved_at`, opaque `release_evidence_id`, and opaque
  `terms_evidence_id`. `release_date` must be null when the source does not state
  one; the selected dataset date remains bound separately as `effective_date`.

`preparation` has exactly:

- `preparation_evidence_id`, an opaque binding to the approved transformation;
- `max_archive_bytes`, `max_entry_uncompressed_bytes`, and
  `max_total_uncompressed_bytes`;
- `max_records_per_chunk` and `max_chunks`, which bind the private external-sort
  resource envelope.

The preparer requires exactly 67 CSV entries, one for each distinct Florida
county code. Every file must have this exact common header:

```text
NUMBER,PREDIR,STNAME,STSUFFIX,POSTDIR,UNITTYPE,UNITNUM,MAILCITY,ZIP,ZIP+4,LAT,LONG,FEATID,COUNTYID,COUNTY,JURISDICTION,FIRECODE,POLCODE,EFFDATE,TDTCODE
```

It verifies the outer archive digest and bytes before work and re-hashes it before
publication. ZIP central/local metadata, CRC-32, compressed and uncompressed
sizes, aggregate source-row count, common header, 67-file county set, and row
semantics all fail closed. `EFFDATE` is the date the individual address became
effective; each value must be a valid configured-format date no later than the
selected effective Master-list build. It is not copied into the importer’s
`pending_effective_date` field.

The deterministic transformation is:

| Derived field | PointMatch rule |
|---|---|
| `address_line_1` | Space-join nonempty `NUMBER`, `PREDIR`, `STNAME`, `STSUFFIX`, `POSTDIR` |
| `address_line_2` | Empty, or space-join `UNITTYPE` and `UNITNUM` when both are present |
| `locality` | `MAILCITY` |
| `region` | Constant `FL` |
| `zip5` | Exact five-digit `ZIP` |
| `county_fips` | `12` plus exact three-digit `COUNTYID` |
| `match_status` | Constant `EXACT` |
| `pending_effective_date` | Empty; this is the effective Master list, not a pending file |
| `special_case_code` | Empty; `TDTCODE` concerns tourist-development tax, not book sales |
| `unit_policy` | `NOT_JURISDICTION_DEPENDENT` when both unit fields are empty; otherwise `UNIT_SPECIFIC` |
| `lookup_scope` | `PRIMARY` when both unit fields are empty; otherwise `UNIT` |

Only `UNIT` and `LOT` are accepted as populated `UNITTYPE` values. A one-sided
unit pair is rejected. This implements the [official PointMatch guide’s](https://pointmatch.floridarevenue.com/Help/UserGuide.pdf)
narrow use of unit fields for a multi-jurisdictional primary address.

Rows are compared using the checkout resolver’s exact `normalizedAddressKey`
semantics. A normalized group with the same county and lookup policy is safely
collapsed to one deterministic representative. If a normalized group disagrees
on county or policy, the entire group is omitted so checkout cannot select a
jurisdiction. Only aggregate conflict and duplicate counts enter provenance; no
raw quarantine file is retained.

Preparation publishes one new directory atomically:

```text
prepared-release/
  pointmatch-derived.csv
  pointmatch-prep-provenance.json
```

The CSV is globally sorted by ZIP5 and then normalized address key. Provenance
binds source/config/output digests, release/evidence metadata, byte and row
counts, and aggregate duplicate/conflict/unit-policy counts without source paths
or raw addresses.

### Hand-off to the importer

Use `pointmatch-derived.csv` as a single `dataset.inputs` entry in the importer
config. Its exact header is:

```text
address_line_1,address_line_2,locality,region,zip5,county_fips,match_status,pending_effective_date,special_case_code,unit_policy,lookup_scope
```

Bind importer fields directly to the identically named columns. Because all four
categorical columns are already canonical, column value maps must explicitly map
each value to itself. Bind the input digest, bytes, and row count from
`pointmatch-prep-provenance.json`, and bind the importer source
`preparation_evidence_id` to the privately preserved preparation provenance.
Copy `release_date` and `release_date_status` together without substituting an
effective date or retrieval date. If the official source states no release date,
the importer requires `release_date: null` and
`release_date_status: "NOT_STATED_BY_SOURCE"`.

## HMAC bundle importer

This tool converts an operator-supplied Florida PointMatch-derived CSV release and a 67-county rate CSV into the exact private data contract consumed by `src/florida-tax.js`. It does not download a source, infer an official schema, upload to Cloudflare, modify D1, set secrets, or enable checkout.

No actual PointMatch row, address HMAC, rate release, source digest, or production mapping belongs in Git. Keep the input CSVs, mapping config, output bundle, and evidence packet outside the repository. The only in-repository alternative is `workers/oip-commerce/.private-imports/`, which is ignored. The tool refuses any other repository path for its config, inputs, output, or validation target.

## Safety model

- `ADDRESS_LOOKUP_HMAC_SECRET` is accepted only from the process environment. It is never accepted on the command line, printed, copied into provenance, or written to disk.
- The importer reads each CSV as a stream. A PointMatch row is normalized and HMACed immediately; raw rows are never written to temporary storage.
- PointMatch inputs must already be globally sorted by mapped five-digit ZIP5 when concatenated in config order. Use the preparation tool above for the official statewide archive. The importer verifies the order and fails closed; it never performs an external raw-row sort.
- Only one ZIP5 shard is held in memory. Explicit record-count and serialized-size bounds keep it below the resolver's 25 MiB object limit. Rate memory is fixed at 67 rows.
- Config, input, output, and validation paths are checked lexically and by filesystem identity. Every existing ancestor is inspected; symlinks, junctions, Windows reparse points, redirected real paths, and short-name/8.3 aliases are rejected. Canonical containment is checked against the real repository and ignored-private roots. Config, inputs, temporary output, existing output parent, and absent final target are rechecked immediately before the atomic rename.
- Build output is written to a new sibling temporary directory containing only HMAC artifacts. It is validated before one atomic rename. Existing output is never overwritten. A failed build removes only its verified, link-free temporary directory.
- Error output contains an opaque source label, record number, and semantic field where useful. It never contains a source row, cell value, address HMAC, or secret.
- Every input binds an expected SHA-256 digest, byte count, and data-row count. A changed, truncated, or replaced input fails before conversion.
- The generated D1 SQL uses plain `INSERT`, not replace/upsert. A duplicate version fails at import time instead of mutating an existing evidence set.

## Commands

Run Node through the repository wrapper from the site root:

```powershell
.\tools\bin\generated\node.cmd .\workers\oip-commerce\tools\florida-tax-import.mjs digest --input D:\OIP-Private\fl-tax\pointmatch.csv
```

`digest` prints only the full-file source digest and byte count needed for the private config. Obtain the authoritative expected row count from the release evidence or a separate private review.

Load the production HMAC secret through an approved non-logging secret source. Never type the value into a command, script, config, transcript, or shell history. This example intentionally leaves secret retrieval unspecified:

```powershell
$env:ADDRESS_LOOKUP_HMAC_SECRET = <retrieve through approved private secret flow>
.\tools\bin\generated\node.cmd .\workers\oip-commerce\tools\florida-tax-import.mjs build --config D:\OIP-Private\fl-tax\import-config.json --output D:\OIP-Private\fl-tax\bundle-2026-r1
Remove-Item Env:ADDRESS_LOOKUP_HMAC_SECRET
```

The tool deletes its own environment copy before conversion begins. The process still needs the same byte value later provisioned to both Cloudflare services.

Validation needs no secret or source CSV:

```powershell
.\tools\bin\generated\node.cmd .\workers\oip-commerce\tools\florida-tax-import.mjs validate --bundle D:\OIP-Private\fl-tax\bundle-2026-r1
```

## Private config contract

The root object has exactly these keys:

```json
{
  "schema_version": "oip-florida-tax-import-config-v1",
  "dataset": {},
  "rates": {}
}
```

Unknown keys, missing keys, unrecognized categorical values, malformed dates, or unexpected headers fail closed.

### PointMatch-derived dataset

`dataset` has exactly:

- `version`: immutable dataset identifier; letters, digits, `.`, `_`, and `-` only.
- `schema_version`: immutable HMAC-shard schema identifier.
- `shard_prefix`: private R2 prefix matching `POINTMATCH_SHARD_PREFIX`.
- `effective_from`, `effective_through`, `stale_after`: strict `YYYY-MM-DD` dates. Start is `00:00:00Z`; through/stale dates are `23:59:59Z`. The importer requires `effective_from <= stale_after <= effective_through`.
- `imported_at`: fixed whole-second UTC timestamp such as `2026-01-02T12:30:00Z`. This makes output reproducible.
- `source`: provenance described below.
- `header`: the exact ordered CSV header. Header drift and extra columns fail.
- `inputs`: one or more files in processing order. Each entry has exactly `label`, `path`, `expected_sha256`, `expected_bytes`, and `expected_rows`.
- `fields`: exact bindings for every semantic field below.
- `value_maps`: explicit maps for categorical source values.
- `limits`: exact `max_input_bytes`, `max_records_per_shard`, and `max_shard_bytes`; hard caps remain 2 GiB per source and 25 MiB per shard.

Every field binding contains exactly one of:

```json
{ "column": "exact source header" }
```

```json
{ "constant": "explicit canonical value" }
```

The exact semantic fields are:

| Field | Required canonical meaning |
|---|---|
| `address_line_1` | Primary delivery line used by the resolver normalizer |
| `address_line_2` | Unit line, or the empty string |
| `locality` | City/locality used by the resolver normalizer |
| `region` | Must map to `FL` |
| `zip5` | Exactly five digits |
| `county_fips` | One of Florida's complete `12001`–`12133` odd-code county set |
| `match_status` | `EXACT` or `NONEXACT` |
| `pending_effective_date` | Empty or a real `YYYY-MM-DD` date |
| `special_case_code` | Empty or an uppercase safe code |
| `unit_policy` | `UNIT_SPECIFIC` or `NOT_JURISDICTION_DEPENDENT` |
| `lookup_scope` | `UNIT` or `PRIMARY` |

`value_maps` has exactly `region`, `match_status`, `unit_policy`, and `lookup_scope`. A column binding must find its exact source value in that field's map. A constant is already canonical and bypasses the source-value map, but still receives semantic validation.

Unit semantics are deliberately narrow:

| `lookup_scope` | Required unit line | Required `unit_policy` | HMAC key |
|---|---|---|---|
| `PRIMARY` | Empty | `NOT_JURISDICTION_DEPENDENT` | Resolver key with unit excluded |
| `UNIT` | Nonempty | `UNIT_SPECIFIC` | Resolver key with exact unit included |

The importer never guesses whether a unit can change jurisdiction. If the approved source does not establish this distinction, the dataset is not importable and Florida checkout stays closed.

The PointMatch CSVs may contain multiple rows for one ZIP5, including across adjacent input parts. ZIP5 values may never decrease or reappear after a later ZIP5 begins. Within each ZIP5, output records are sorted by HMAC and duplicate HMACs are rejected.

### County rates

`rates` has exactly:

- `version`, the same four dates/timestamp fields, and `source` with the same semantics as the dataset;
- one bound `input` with an expected row count of exactly 67;
- an exact ordered `header`;
- exact bindings for `county_fips`, `state_rate`, `surtax_rate`, and `combined_rate`;
- exact units for each numeric rate: `BASIS_POINTS` or `PERCENT_DECIMAL`;
- `max_input_bytes`.

The rate CSV must be sorted by county FIPS and contain every Florida county exactly once. State rate must equal 600 basis points, surtax must be 0–200 basis points, and combined rate must equal state plus surtax. Decimal percentages must resolve to a whole basis point; binary floating-point is never used.

### Provenance

Each `source` has exactly:

- `authority`: issuing authority;
- `url`: official HTTPS source or release page, without credentials, fragment, or nonstandard port;
- `release_date`: strict `YYYY-MM-DD` when the source states a release date, otherwise `null`;
- `release_date_status`: exactly `STATED_BY_SOURCE` or `NOT_STATED_BY_SOURCE`, consistent with `release_date`;
- `retrieved_at`: fixed whole-second UTC timestamp, not before a stated release date;
- `release_evidence_id`: opaque binding to the privately preserved official release;
- `terms_evidence_id`: opaque binding to privately preserved access/license/terms evidence;
- `preparation_evidence_id`: opaque binding to the private direct-use or transformation/sort procedure.

Retrieval must precede `imported_at`. The generated canonical `provenance-manifest.json` carries these bindings, every transformed input's full-file digest/size/row count, the mapping-config digest, effective windows, object locations, row counts, and artifact digests. It contains no raw address or HMAC secret.

## Bundle layout

```text
bundle/
  provenance-manifest.json
  florida-rates.json
  d1-import.sql
  <shard_prefix>/<dataset_version>/index.json
  <shard_prefix>/<dataset_version>/zip5/<ZIP5>.json
```

The index is byte-for-byte `canonicalPointMatchIndex(...)`. Each shard has the resolver's exact key order and only `address_hmac`, jurisdiction/result fields, and unit policy. `florida-rates.json` is byte-for-byte `canonicalFloridaRateTable(...)`. `d1-import.sql` loads only the two manifests and the sorted 67 rate rows; statewide address data stays in private R2. The SQL deliberately contains no `BEGIN`, `COMMIT`, savepoint, or other transaction control because Wrangler/D1 owns the import transaction. Local acceptance executes the exact generated statements inside an already-open SQLite transaction through the repository Python wrapper.

Before provisioning, validate the bundle, privately preserve the config/source/provenance evidence, upload only index and shards to nonpublic R2, re-read and compare all object digests, apply D1 SQL under its separate approval, and bind the two root digests in both deployments. This tool performs none of those live actions.
