# BOB illustration signatures

OIP composites the approved BOB mark into published illustration pixels during
the Hugo build. Original files under `assets/images/originals/` stay unchanged.
The same rendering model supplies article images, cards, Gallery images,
lightboxes, social JPEGs, and the image URLs readers can save.

`data/image-signatures.json` controls signing. Its default classes are
`essay_illustration` and `editorial_cartoon`. An individual `medium_import` may
be enabled only after its artwork and authorship have been reviewed. Photographs
are never eligible. Reviewed original illustrations from the static Medium
archive use the explicit `legacy_assets` registry described below. Other
nonmanaged static and external images do not pass through this policy. Do not
sign every file merely because it has an image extension.

## Policy

The required top-level fields are:

| Field | Meaning |
| --- | --- |
| `version` | Numeric schema version, currently `1`. |
| `mark` | PNG resource path under `images/signatures/`, relative to `assets/`. |
| `default_classes` | Unique array containing either or both supported original-illustration classes. |
| `width_ratio` | Signature width divided by output-image width; greater than zero and at most `0.25`. |
| `inset_ratio` | Horizontal inset divided by output width and vertical inset divided by output height; from zero through `0.25`. |
| `overrides` | Object keyed by canonical managed asset IDs. |
| `legacy_assets` | Explicit original-artwork entries mounted from the static Medium archive; `{}` when none. |

The initial width is `0.04`, with an inset of `0.025`, and bottom-right placement.
Each output scales the PNG proportionally, preserving transparency. Mark width
and each axis's inset round to the nearest pixel; the mark has a mathematical
minimum of one pixel. There is no separate thumbnail enlargement rule.

An override may contain `enabled`, `reason`, `position`, `width_ratio`, and
`inset_ratio`. Positions are `bottom-right`, `bottom-left`, `top-right`, or
`top-left`. Unknown fields, unknown IDs, empty overrides, invalid types or
ratios, and a signature that cannot fit its output cause a build error.
Every explicit `enabled` value requires a nonempty `reason`.

Use `enabled: false` for artwork already carrying an approved BOB signature,
or for an illustration whose ownership or intended treatment excludes signing.
Record the review basis in `reason`. Keep the original image class intact;
the signature policy is a separate publication decision.

Example override values, keyed by real manifest IDs when used:

```json
{
  "enabled": false,
  "reason": "The source already carries its approved BOB signature."
}
```

```json
{
  "enabled": true,
  "reason": "Reviewed original artwork imported from Medium.",
  "position": "bottom-left"
}
```

## Legacy static originals

`legacy_assets` registers only individually reviewed original artwork whose
source remains in `static/images/medium/`. The Hugo configuration mounts that
existing directory at `assets/images/legacy-medium/`, and excludes only the
registered source paths from the public static mount. This preserves original
file bytes and avoids a duplicate source while preventing an unsigned copy from
being shipped alongside the signed derivatives.

Each entry is keyed by `legacy/<actual-file-sha256>`, and requires exactly:

- `id`, equal to the key;
- `source`, the mounted `images/legacy-medium/<slug>/<filename>` resource;
- `sha256`, the actual source byte hash rather than an assumed filename hash;
- positive integer `width` and `height`;
- `image_class: "essay_illustration"` and `processing_hint: "drawing"`;
- `processing_state: "derivative_capable"`, `review_state: "approved"`, and
  `usage_state: "referenced"`;
- `url`, the corresponding former `/images/medium/<slug>/<filename>` URL; and
- `reason`, the recorded authorship/review basis.

The resolver treats the former URL as an input alias to the registered ID.
It is not an HTTP redirect: rendered site links use the signed derivative URLs,
and a former raw URL can return 404 after deployment. The legacy registry joins
the image manifest only for resolution and derivative-budget validation; it
does not rewrite the frozen manifest, migration records, or source files.

## Rendering and identity

`images/signature-policy.html` loads and validates the policy once per build.
`images/signature-settings.html` is a pure resolver: given an entry, policy, and
policy/mark digests, it returns the effective settings and rendition identity.
`images/derivative.html` starts from the original for every output. For signed
images it resizes, draws the resized mark, and encodes in one Hugo `Filter`
operation. Unsigned images retain the previous `Resize` operation.

Hugo 0.167 gives a newly resized resource a different `Key` from the same
resource restored from its disk cache. `Overlay` includes that key in its own
cache identity. To keep the first warm build from re-encoding every signed
image, the derivative partial wraps the resized mark's existing PNG bytes with
`resources.FromString`, named by their SHA-256 and width. This changes neither
the pixels nor the encoding. The resulting resource is never published.
The cache regression test checks filenames and modification times across the
first cold-to-warm transition, in addition to output-byte equality.

The public URL shape remains:

```text
/images/rendered/<asset-id>/<12-character-rendition-identity>/<width>w.<format>
```

For signed images the full identity is the lowercase hexadecimal SHA-256 of
the following UTF-8 string, without a trailing newline:

```text
<source-sha256>|<policy-sha256>|<mark-sha256>|bob-v1
```

`policy-sha256` hashes the complete raw bytes of
`data/image-signatures.json`; `mark-sha256` hashes the complete raw PNG bytes.
The URL uses the first 12 characters of the result. Unsigned images keep the
first 12 characters of their source SHA-256. The `bob-v1` suffix is the rendering
recipe version; change it in every implementation and validator if the
compositing geometry or pixel recipe changes.

The policy uses UTF-8 without a BOM, LF endings, and exactly one terminal LF.
Changing any policy bytes or mark bytes deliberately changes every signed
rendition URL. The build cache includes these inputs. This prevents an old
browser/CDN cache entry from concealing a signature update while keeping the
source hashes and historical artwork review records intact.

The complete initial render measured 976 seconds on Linux CI and 181 seconds on the local Mac. The earlier Linux cold build processed 5,183 images in 832 seconds; this rollout processes 5,808. The cold-build capacity limit is 1,200 seconds, with the existing 300-second exact-cache limit and 35-minute site-job timeout retained. A local first warm build took 21 seconds with zero cache files cleaned. See `reports/image-signature-build-evidence.json`.

Only requested derivatives are published. Do not publish originals, signature
intermediates, or another full-size copy of every image. Existing output sizes,
formats, quality rules, and deployment byte/file budgets remain applicable.

`data/image-signature-compatibility.json` records the exact historical social
JPEG URLs used in Almanack email content. Its schema is `version: 1` and an
`aliases` object mapping each old `/images/rendered/.../social-...w.jpg` URL to
its managed asset ID. Only these listed paths receive a copy of the signed
social JPEG, preserving already distributed email image links. Canonical
metadata continues to use the current rendition identity. The compatibility
registry is a build-cache input but is excluded from the signed identity;
adding a historical URL does not invalidate every signed image.

## Downloads and review

The signature is part of the served file, so normal browser image saving retains
it. Gallery download links can reuse the largest signed WebP already generated
by the model. This avoids another full-resolution download library and preserves
the current maximum 1600-pixel display width. New full-resolution PNG/JPEG
downloads would require a separate explicit output recipe and budget review.

The model exposes `signature_enabled` and `signature_identity`. The shared
picture renderer exposes `data-oip-image-signed` for output checks. These indicate
pipeline compositing, not whether an exempt source already contains a signature.

Before a release, inspect representative dark, light, detailed, text-bearing,
portrait, and landscape artwork at small and large sizes, including WebP, AVIF,
and social JPEGs. Review the placement exception list and verify that existing
signatures are not doubled. Confirm source bytes are unchanged, policy/hash
parity holds, signed download links resolve, and the normal source/output
contracts and build budgets pass. Use cold and restored-cache evidence when the
processing recipe changes.

Technical references: [Hugo Overlay](https://gohugo.io/functions/images/overlay/),
[Hugo Process](https://gohugo.io/functions/images/process/), and
[image processing and caching](https://gohugo.io/content-management/image-processing/).
