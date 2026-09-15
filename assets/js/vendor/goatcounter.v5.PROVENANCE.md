# GoatCounter v5 client

- Upstream: https://gc.zgo.at/count.v5.js
- Retrieved: 2026-09-15
- License: ISC; the upstream license notice is retained in the JavaScript file.
- Upstream SHA-384 (base64): `atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ`
- Local SHA-384 (base64): `NO1zwnfi/fC+Af1O/ZFuBZKsresYXDLbx2RBGwe3Zeh2ZdEElUa72vJidOMuc94S`
- Local modification: replace the single `q: location.search,` field with `q: '',` so no URL query is transmitted. All other upstream code is unchanged.

Hugo fingerprints the local asset. Updates require review of the upstream diff and an outbound-request privacy test before changing this pinned copy.
