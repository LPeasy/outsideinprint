# SEO Host Diagnostics

- Generated at: 2026-04-15T16:01:11.3145884-04:00

## DNS

| Host | Status | Values | Error |
| --- | --- | --- | --- |
| outsideinprint.org | ok | 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 |  |
| www.outsideinprint.org | ok | lpeasy.github.io, 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153, 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 |  |

## Rollout Worksheet Snapshot

- Priority rows: 15
- Canonical live-smoke passed: 0
- Canonical live-smoke failed: 15
- Legacy redirects passed: 0
- Legacy redirects failed: 15

## Canonical Host Probes

| URL | PowerShell | PowerShell error | curl exit | HTTP code | curl final URL | curl SSL verify | curl stderr |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| https://outsideinprint.org/ | fail | The SSL connection could not be established, see inner exception. | 35 | 0 | https://outsideinprint.org/ | 0 | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |
| https://outsideinprint.org/llms.txt | fail | The SSL connection could not be established, see inner exception. | 35 | 0 | https://outsideinprint.org/llms.txt | 0 | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |
| https://outsideinprint.org/robots.txt | fail | The SSL connection could not be established, see inner exception. | 35 | 0 | https://outsideinprint.org/robots.txt | 0 | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |
| https://outsideinprint.org/sitemap.xml | fail | The SSL connection could not be established, see inner exception. | 35 | 0 | https://outsideinprint.org/sitemap.xml | 0 | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |
| https://outsideinprint.org/about/ | fail | The SSL connection could not be established, see inner exception. | 35 | 0 | https://outsideinprint.org/about/ | 0 | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |
| https://outsideinprint.org/authors/robert-v-ussley/ | fail | The SSL connection could not be established, see inner exception. | 35 | 0 | https://outsideinprint.org/authors/robert-v-ussley/ | 0 | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |

## Legacy Host Probes

| URL | First curl exit | First HTTP code | First location | Follow curl exit | Follow HTTP code | Follow final URL | Follow stderr |
| --- | ---: | ---: | --- | ---: | ---: | --- | --- |
| https://lpeasy.github.io/outsideinprint/ | 35 | 0 |  | 35 | 0 | https://lpeasy.github.io/outsideinprint/ | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |
| https://lpeasy.github.io/outsideinprint/about/ | 35 | 0 |  | 35 | 0 | https://lpeasy.github.io/outsideinprint/about/ | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |
| https://lpeasy.github.io/outsideinprint/authors/robert-v-ussley/ | 35 | 0 |  | 35 | 0 | https://lpeasy.github.io/outsideinprint/authors/robert-v-ussley/ | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |
| https://lpeasy.github.io/outsideinprint/collections/risk-uncertainty/ | 35 | 0 |  | 35 | 0 | https://lpeasy.github.io/outsideinprint/collections/risk-uncertainty/ | curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - No credentials are available in the security package |

## Operator Notes

- PowerShell failures here matter because the canonical-host smoke in CI also uses `Invoke-WebRequest`.
- curl success with PowerShell failure usually points to a client-specific TLS or certificate-chain issue rather than a total host outage.
- Legacy URLs should end in matching `https://outsideinprint.org/...` paths, not a second live HTML surface.
