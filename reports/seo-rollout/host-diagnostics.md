# SEO Host Diagnostics

- Generated at: 2026-04-25T22:26:31.4716821-04:00

## Client Environment

- Local Windows TLS credentials failure: False
- Python canonical successes: 6
- Python legacy full-path 301s: 4
- Interpretation: No uniform local Windows Schannel credential failure detected.

## DNS

| Host | Status | Values | Error |
| --- | --- | --- | --- |
| outsideinprint.org | ok | 185.199.109.153, 185.199.110.153, 185.199.111.153, 185.199.108.153 |  |
| www.outsideinprint.org | ok | lpeasy.github.io, 2606:50c0:8003::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8000::153, 185.199.109.153, 185.199.108.153, 185.199.111.153, 185.199.110.153 |  |

## Rollout Worksheet Snapshot

- Priority rows: 15
- Canonical live-smoke passed: 15
- Canonical live-smoke failed: 0
- Legacy redirects passed: 15
- Legacy redirects failed: 0

## Canonical Host Probes

| URL | PowerShell | PowerShell error | curl exit | curl HTTP | curl final URL | Python HTTP | Python final URL | Python error |
| --- | --- | --- | ---: | ---: | --- | ---: | --- | --- |
| https://outsideinprint.org/ | ok |  | 0 | 200 | https://outsideinprint.org/ | 200 | https://outsideinprint.org/ |  |
| https://outsideinprint.org/llms.txt | ok |  | 0 | 200 | https://outsideinprint.org/llms.txt | 200 | https://outsideinprint.org/llms.txt |  |
| https://outsideinprint.org/robots.txt | ok |  | 0 | 200 | https://outsideinprint.org/robots.txt | 200 | https://outsideinprint.org/robots.txt |  |
| https://outsideinprint.org/sitemap.xml | ok |  | 0 | 200 | https://outsideinprint.org/sitemap.xml | 200 | https://outsideinprint.org/sitemap.xml |  |
| https://outsideinprint.org/about/ | ok |  | 0 | 200 | https://outsideinprint.org/about/ | 200 | https://outsideinprint.org/about/ |  |
| https://outsideinprint.org/authors/robert-v-ussley/ | ok |  | 0 | 200 | https://outsideinprint.org/authors/robert-v-ussley/ | 200 | https://outsideinprint.org/authors/robert-v-ussley/ |  |

## Legacy Host Probes

| URL | First curl HTTP | First curl location | Python first HTTP | Python first location | Python follow HTTP | Python follow final URL | curl stderr |
| --- | ---: | --- | ---: | --- | ---: | --- | --- |
| https://lpeasy.github.io/outsideinprint/ | 301 | https://outsideinprint.org/ | 301 | https://outsideinprint.org/ | 200 | https://outsideinprint.org/ |  |
| https://lpeasy.github.io/outsideinprint/about/ | 301 | https://outsideinprint.org/about/ | 301 | https://outsideinprint.org/about/ | 200 | https://outsideinprint.org/about/ |  |
| https://lpeasy.github.io/outsideinprint/authors/robert-v-ussley/ | 301 | https://outsideinprint.org/authors/robert-v-ussley/ | 301 | https://outsideinprint.org/authors/robert-v-ussley/ | 200 | https://outsideinprint.org/authors/robert-v-ussley/ |  |
| https://lpeasy.github.io/outsideinprint/collections/risk-uncertainty/ | 301 | https://outsideinprint.org/collections/risk-uncertainty/ | 301 | https://outsideinprint.org/collections/risk-uncertainty/ | 200 | https://outsideinprint.org/collections/risk-uncertainty/ |  |

## Operator Notes

- PowerShell failures here matter only if they reproduce in GitHub Actions or another clean client.
- `SEC_E_NO_CREDENTIALS` from local Windows Schannel points to this client environment, not automatically to bad site DNS or certificate setup.
- curl success with PowerShell failure usually points to a client-specific TLS or certificate-chain issue rather than a total host outage.
- Legacy URLs should end in matching `https://outsideinprint.org/...` paths, not a second live HTML surface.
