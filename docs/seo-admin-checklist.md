# SEO Admin Checklist

This is the plain-English owner checklist for the Outside In Print SEO rollout.

Codex can diagnose, probe, and interpret. You still need to do the account-controlled steps in DNS, GitHub Pages, Google Search Console, and Bing Webmaster Tools.

## What Codex Handles

Use these repo commands when you want fresh technical evidence before or after manual changes:

```powershell
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\probe_seo_rollout.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\diagnose_seo_hosts.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\audit_legacy_host_references.ps1
.\tools\bin\generated\pwsh.cmd -NoLogo -NoProfile -File .\scripts\report_seo_rollout_window.ps1 -Label day-7
```

The main artifacts to read are:

- `reports/seo-rollout/baseline.md`
- `reports/seo-rollout/rollout-worksheet.csv`
- `reports/seo-rollout/probe-results.md`
- `reports/seo-rollout/host-diagnostics.md`
- `reports/seo-rollout/legacy-reference-audit.md`

## What You Need To Do Manually

### 1. GitHub Pages custom-domain check

In the repo settings on GitHub, open Pages and confirm:

- the custom domain is `outsideinprint.org`
- HTTPS is enabled
- GitHub is not showing a DNS or certificate warning

If GitHub still shows a certificate or DNS warning, stop there and fix that first.

### 2. DNS check at your domain provider

For `outsideinprint.org`, confirm:

- the apex/root domain points to GitHub Pages correctly
- `www.outsideinprint.org` is configured intentionally
- there are no conflicting old A, AAAA, ALIAS, ANAME, or CNAME records for the same host

The current repo-side diagnostics already expect:

- `outsideinprint.org` apex resolves to GitHub Pages IPs
- `www.outsideinprint.org` currently points to `lpeasy.github.io`

If `www` should resolve to the canonical host, keep that behavior consistent with your GitHub Pages domain settings.

### 3. Legacy host behavior check

Open these URLs in a browser:

- `https://outsideinprint.org/`
- `https://outsideinprint.org/llms.txt`
- `https://lpeasy.github.io/outsideinprint/`
- `https://lpeasy.github.io/outsideinprint/about/`
- `https://lpeasy.github.io/outsideinprint/authors/robert-v-ussley/`
- `https://lpeasy.github.io/outsideinprint/collections/risk-uncertainty/`

Correct behavior:

- `outsideinprint.org` loads cleanly
- `outsideinprint.org/llms.txt` loads cleanly
- legacy URLs do not behave like a second public site
- legacy URLs should end on matching `https://outsideinprint.org/...` paths if path-preserving redirect is available

If the legacy host still serves HTML or dead-end pages, it is still competing with the canonical host and needs to be redirected or retired.

### 4. Google Search Console

In Google Search Console:

1. Add `outsideinprint.org` as a domain property.
2. Complete ownership verification.
3. Submit `https://outsideinprint.org/sitemap.xml`.
4. Inspect these URLs first:
   - `https://outsideinprint.org/`
   - `https://outsideinprint.org/about/`
   - `https://outsideinprint.org/authors/robert-v-ussley/`
   - `https://outsideinprint.org/collections/`
   - `https://outsideinprint.org/collections/risk-uncertainty/`
5. Then inspect the essay URLs frozen in `reports/seo-rollout/priority-urls.json`.

Record for each priority URL:

- indexed or not
- selected canonical
- exclusion reason if excluded

### 5. Bing Webmaster Tools

In Bing Webmaster Tools:

1. Add and verify `outsideinprint.org`.
2. Submit `https://outsideinprint.org/sitemap.xml`.
3. Inspect the same priority URLs.

Record the same fields:

- indexed or not
- selected canonical
- exclusion reason if excluded

## What To Bring Back

After the manual steps, bring back one or more of these:

- a screenshot of GitHub Pages custom-domain and HTTPS status
- a screenshot or copy of the DNS records you checked
- Google Search Console indexing and canonical results for the priority URLs
- Bing Webmaster Tools indexing and canonical results for the priority URLs

Once you bring that back, Codex can tell you whether the problem is:

- DNS / custom-domain configuration
- GitHub Pages legacy-host behavior
- search-engine lag
- stale production output

## Success Criteria

The rollout is ready for the 2/7/14/28-day measurement window only when all of these are true:

- `https://outsideinprint.org/` is reachable from scripted checks
- `https://outsideinprint.org/llms.txt` is reachable
- legacy GitHub Pages URLs no longer act like a second site
- Google accepts the sitemap
- Bing accepts the sitemap
- Google and Bing select `outsideinprint.org` as canonical for the priority URLs
