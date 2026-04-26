param(
  [string]$PriorityUrlsPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/priority-urls.json'),
  [string]$WorksheetPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/rollout-worksheet.csv'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout'),
  [int]$MaxRedirects = 5,
  [switch]$UpdateWorksheet = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-JsonDocument {
  param([string]$Json)

  $trimmed = $Json.Trim()
  $isArrayDocument = $trimmed.StartsWith('[') -and $trimmed.EndsWith(']')

  if ($isArrayDocument -and $trimmed -match '^\[\s*\]$') {
    return ,@()
  }

  $convertFromJson = Get-Command ConvertFrom-Json -ErrorAction Stop
  if ($convertFromJson.Parameters.ContainsKey('NoEnumerate')) {
    return ($Json | ConvertFrom-Json -NoEnumerate)
  }

  $parsed = $Json | ConvertFrom-Json
  if ($isArrayDocument -and $null -eq $parsed) {
    return ,@()
  }

  if ($isArrayDocument -and ($parsed -is [string] -or $parsed -isnot [System.Collections.IEnumerable])) {
    return ,$parsed
  }

  return $parsed
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing required JSON input: $Path"
  }

  return (Convert-JsonDocument -Json (Get-Content -Path $Path -Raw))
}

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  ($Value | ConvertTo-Json -Depth 20) | Out-File -FilePath $Path -Encoding utf8
}

function Join-BaseRelativeUrl {
  param(
    [string]$BaseUrl,
    [string]$Path
  )

  $base = $BaseUrl.TrimEnd('/') + '/'
  $relative = $Path.TrimStart('/')
  return ([System.Uri]($base + $relative)).AbsoluteUri
}

function Get-AttributeValue {
  param(
    [string]$Tag,
    [string]$Name
  )

  $pattern = '\b' + [regex]::Escape($Name) + '\s*=\s*(?:"([^"]*)"|''([^'']*)''|([^\s>]+))'
  $match = [regex]::Match($Tag, $pattern, 'IgnoreCase')
  if (-not $match.Success) {
    return $null
  }

  foreach ($index in 1..3) {
    if ($match.Groups[$index].Success) {
      return $match.Groups[$index].Value
    }
  }

  return $null
}

function Get-OpenTags {
  param(
    [string]$Html,
    [string]$TagName
  )

  return @([regex]::Matches($Html, '<' + [regex]::Escape($TagName) + '\b[^>]*>', 'IgnoreCase') | ForEach-Object { $_.Value })
}

function Get-MetaContent {
  param(
    [string]$Html,
    [string]$AttributeName,
    [string]$AttributeValue
  )

  foreach ($tag in (Get-OpenTags -Html $Html -TagName 'meta')) {
    if ((Get-AttributeValue -Tag $tag -Name $AttributeName) -eq $AttributeValue) {
      return (Get-AttributeValue -Tag $tag -Name 'content')
    }
  }

  return $null
}

function Get-CanonicalHref {
  param([string]$Html)

  foreach ($tag in (Get-OpenTags -Html $Html -TagName 'link')) {
    if ((Get-AttributeValue -Tag $tag -Name 'rel') -eq 'canonical') {
      return (Get-AttributeValue -Tag $tag -Name 'href')
    }
  }

  return $null
}

function Get-RssFeedUrls {
  param([string]$Html)

  return @(
    Get-OpenTags -Html $Html -TagName 'link' |
      Where-Object {
        (Get-AttributeValue -Tag $_ -Name 'rel') -eq 'alternate' -and
        (Get-AttributeValue -Tag $_ -Name 'type') -eq 'application/rss+xml'
      } |
      ForEach-Object { Get-AttributeValue -Tag $_ -Name 'href' } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
}

function Add-JsonLdTypesFromNode {
  param(
    [object]$Node,
    [System.Collections.Generic.HashSet[string]]$Types
  )

  if ($null -eq $Node) {
    return
  }

  if ($Node -is [string] -or $Node.GetType().IsPrimitive -or $Node -is [decimal]) {
    return
  }

  if ($Node -is [System.Collections.IDictionary]) {
    if ($Node.Contains('@type')) {
      foreach ($nodeType in @($Node['@type'])) {
        if (-not [string]::IsNullOrWhiteSpace([string]$nodeType)) {
          [void]$Types.Add([string]$nodeType)
        }
      }
    }

    foreach ($key in @($Node.Keys)) {
      Add-JsonLdTypesFromNode -Node $Node[$key] -Types $Types
    }

    return
  }

  if ($Node -is [System.Collections.IEnumerable]) {
    foreach ($item in $Node) {
      Add-JsonLdTypesFromNode -Node $item -Types $Types
    }

    return
  }

  if ($Node -isnot [pscustomobject]) {
    return
  }

  $properties = @($Node.PSObject.Properties)
  $typeProperty = $properties | Where-Object { $_.Name -eq '@type' } | Select-Object -First 1
  if ($typeProperty) {
    foreach ($nodeType in @($typeProperty.Value)) {
      if (-not [string]::IsNullOrWhiteSpace([string]$nodeType)) {
        [void]$Types.Add([string]$nodeType)
      }
    }
  }

  foreach ($property in $properties) {
    Add-JsonLdTypesFromNode -Node $property.Value -Types $Types
  }
}

function Get-JsonLdTypes {
  param([string]$Html)

  $types = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)
  $matches = [regex]::Matches($Html, '(?is)<script\b[^>]*type\s*=\s*(?:"application/ld\+json"|''application/ld\+json''|application/ld\+json)[^>]*>(.*?)</script>')

  foreach ($match in $matches) {
    $json = $match.Groups[1].Value.Trim()
    if ([string]::IsNullOrWhiteSpace($json)) {
      continue
    }

    try {
      Add-JsonLdTypesFromNode -Node (Convert-JsonDocument -Json $json) -Types $types
    }
    catch {
      continue
    }
  }

  return @($types)
}

function Get-ExpectedJsonLdType {
  param([string]$Path)

  switch -Regex ($Path) {
    '^/$' { return 'WebSite' }
    '^/about/$' { return 'AboutPage' }
    '^/authors/' { return 'ProfilePage' }
    '^/collections/' { return 'CollectionPage' }
    '^/essays/' { return 'Article' }
    default { return $null }
  }
}

function Test-LocalTlsCredentialFailure {
  param([string]$Message)

  if ([string]::IsNullOrWhiteSpace($Message)) {
    return $false
  }

  return ([string]$Message) -match '(?i)SSL connection could not be established|SEC_E_NO_CREDENTIALS|No credentials are available in the security package'
}

function Get-WebResponseFinalUrl {
  param(
    [object]$Response,
    [string]$FallbackUrl
  )

  try {
    if ($Response.BaseResponse.ResponseUri) {
      return [string]$Response.BaseResponse.ResponseUri.AbsoluteUri
    }
  }
  catch {
  }

  try {
    if ($Response.BaseResponse.RequestMessage.RequestUri) {
      return [string]$Response.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
    }
  }
  catch {
  }

  return $FallbackUrl
}

function Get-PythonCommand {
  $repoRoot = Split-Path -Parent $PSScriptRoot
  $candidates = @(
    (Join-Path $repoRoot 'tools/bin/generated/python.cmd'),
    'python',
    'python3',
    'py'
  )

  foreach ($candidate in $candidates) {
    try {
      if ($candidate -match '[\\/]' -and -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        continue
      }

      $null = & $candidate --version 2>$null
      if ($LASTEXITCODE -eq 0) {
        return $candidate
      }
    }
    catch {
    }
  }

  return $null
}

function Invoke-PythonHttpProbe {
  param(
    [string]$Url,
    [int]$RedirectLimit,
    [switch]$FollowRedirects
  )

  $pythonCommand = Get-PythonCommand
  if ([string]::IsNullOrWhiteSpace($pythonCommand)) {
    throw 'Python fallback client is unavailable.'
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('seo-python-probe-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  $scriptPath = Join-Path $tempRoot 'probe.py'
  $script = @'
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

url = sys.argv[1]
redirect_limit = int(sys.argv[2])
follow_redirects = sys.argv[3].lower() == "true"



class RedirectFailure(Exception):
    def __init__(self, error, current_url, redirect_count, redirect_history):
        super().__init__(error)
        self.error = error
        self.current_url = current_url
        self.redirect_count = redirect_count
        self.redirect_history = list(redirect_history)

class RedirectLimitExceeded(RedirectFailure):
    pass

class RedirectLoop(RedirectFailure):
    pass

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def open_once(opener, request_url):
    request = urllib.request.Request(request_url, headers={"User-Agent": "OutsideInPrintSEOProbe/1.0"})
    try:
        response = opener.open(request, timeout=25)
        try:
            body = response.read(2_000_000).decode("utf-8", errors="replace")
            return {
                "ok": getattr(response, "status", response.getcode()) < 400,
                "status_code": getattr(response, "status", response.getcode()),
                "final_url": response.geturl(),
                "location": response.headers.get("location"),
                "content_type": response.headers.get("content-type"),
                "content": body,
                "error": "",
            }
        finally:
            response.close()
    except urllib.error.HTTPError as exc:
        body = exc.read(2_000_000).decode("utf-8", errors="replace")
        return {
            "ok": exc.code < 400,
            "status_code": exc.code,
            "final_url": exc.geturl(),
            "location": exc.headers.get("location"),
            "content_type": exc.headers.get("content-type"),
            "content": body,
            "error": "" if exc.code < 400 else str(exc),
        }


def normalize_redirect_url(current_url, location, redirect_count, redirect_history):
    if not location:
        raise RedirectLimitExceeded(
            "redirect_missing_location",
            current_url,
            redirect_count,
            redirect_history,
        )
    return urllib.parse.urljoin(current_url, location)


def probe_url(url, redirect_limit, follow_redirects):
    opener = urllib.request.build_opener(
        urllib.request.HTTPHandler(),
        urllib.request.HTTPSHandler(),
        NoRedirectHandler()
    )
    redirect_count = 0
    redirect_history = []
    visited = set()
    current_url = url

    while True:
        response = open_once(opener, current_url)
        status_code = response.get("status_code", 0)
        location = response.get("location")
        response["redirect_count"] = redirect_count
        response["redirect_history"] = redirect_history

        if not follow_redirects:
            return response

        if status_code < 300 or status_code >= 400:
            return response

        if redirect_count >= redirect_limit:
            raise RedirectLimitExceeded("redirect_limit_exceeded", current_url, redirect_count, redirect_history)

        resolved_location = normalize_redirect_url(current_url, location, redirect_count, redirect_history)
        hop = "{0} -> {1}".format(current_url, resolved_location)

        if resolved_location in visited:
            raise RedirectLoop(
                "redirect_loop_detected",
                resolved_location,
                redirect_count + 1,
                redirect_history + [hop],
            )

        visited.add(current_url)
        redirect_count += 1
        response["redirect_count"] = redirect_count
        redirect_history.append(hop)
        current_url = resolved_location


def make_failure_payload(current_url, error, redirect_count, redirect_history):
    return {
        "ok": False,
        "status_code": 0,
        "final_url": current_url,
        "location": None,
        "content_type": None,
        "content": "",
        "error": error,
        "redirect_count": redirect_count,
        "redirect_history": redirect_history,
    }

start = time.time()
try:
    payload = probe_url(url, redirect_limit, follow_redirects)
except RedirectFailure as exc:
    payload = make_failure_payload(exc.current_url, exc.error, exc.redirect_count, exc.redirect_history)
except Exception as exc:
    payload = make_failure_payload(url, "probe_error: {0}".format(str(exc)), 0, [])
payload["elapsed_ms"] = int((time.time() - start) * 1000)
print(json.dumps(payload))
'@

  try {
    $script | Out-File -FilePath $scriptPath -Encoding utf8
    $raw = @(& $pythonCommand $scriptPath $Url $RedirectLimit ([string]([bool]$FollowRedirects)).ToLowerInvariant() 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw (($raw | ForEach-Object { [string]$_ }) -join [Environment]::NewLine)
    }

    $payload = Convert-JsonDocument -Json (($raw | ForEach-Object { [string]$_ }) -join [Environment]::NewLine)
    return [pscustomobject]@{
      Ok = [bool]$payload.ok
      StatusCode = [int]$payload.status_code
      FinalUrl = [string]$payload.final_url
      RedirectLocation = [string]$payload.location
      ContentType = [string]$payload.content_type
      Content = [string]$payload.content
      Error = [string]$payload.error
      RedirectCount = [int]$payload.redirect_count
      RedirectHistory = @($payload.redirect_history)
      ElapsedMs = [int]$payload.elapsed_ms
    }
  }
  finally {
    Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue
  }
}

function Invoke-CanonicalRequest {
  param(
    [string]$Url,
    [int]$RedirectLimit
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -MaximumRedirection $RedirectLimit
    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      FinalUrl = Get-WebResponseFinalUrl -Response $response -FallbackUrl $Url
      Content = [string]$response.Content
      ResponseClient = 'powershell'
      FallbackReason = ''
    }
  }
  catch {
    $message = [string]$_.Exception.Message
    if (-not (Test-LocalTlsCredentialFailure -Message $message)) {
      throw
    }

    $fallback = Invoke-PythonHttpProbe -Url $Url -RedirectLimit $RedirectLimit -FollowRedirects
    if (-not $fallback.Ok) {
      throw ("PowerShell request failed with '{0}'. Python fallback also failed with '{1}'." -f $message, $fallback.Error)
    }

    return [pscustomobject]@{
      StatusCode = [int]$fallback.StatusCode
      FinalUrl = [string]$fallback.FinalUrl
      Content = [string]$fallback.Content
      ResponseClient = 'python_urllib'
      FallbackReason = $message
    }
  }
}

function Resolve-LegacyRequest {
  param(
    [string]$Url,
    [int]$RedirectLimit
  )

  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $false
  $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(20)
  $client.DefaultRequestHeaders.UserAgent.ParseAdd('OutsideInPrintSEOProbe/1.0')

  try {
    $currentUrl = $Url
    $hops = New-Object System.Collections.Generic.List[string]
    $firstRedirectStatusCode = $null
    $firstRedirectLocation = $null
    for ($i = 0; $i -le $RedirectLimit; $i++) {
      $response = $client.GetAsync($currentUrl).GetAwaiter().GetResult()
      $statusCode = [int]$response.StatusCode
      $locationHeader = $response.Headers.Location
      $resolvedLocation = $null
      if ($locationHeader) {
        $resolvedLocation = ([System.Uri]::new([System.Uri]$currentUrl, $locationHeader)).AbsoluteUri
        $hops.Add(('{0} -> {1}' -f $statusCode, $resolvedLocation))
        if ($statusCode -ge 300 -and $statusCode -lt 400) {
          if ($null -eq $firstRedirectStatusCode) {
            $firstRedirectStatusCode = $statusCode
            $firstRedirectLocation = $resolvedLocation
          }
          $currentUrl = $resolvedLocation
          continue
        }
      }

      $content = $null
      if ($response.Content) {
        $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      }

      return [pscustomobject]@{
        StatusCode = if ($null -ne $firstRedirectStatusCode) { $firstRedirectStatusCode } else { $statusCode }
        FinalUrl = $currentUrl
        RedirectLocation = if ($null -ne $firstRedirectLocation) { $firstRedirectLocation } else { $resolvedLocation }
        RedirectHops = @($hops)
        Content = $content
        ResponseClient = 'powershell'
        FallbackReason = ''
      }
    }

    throw "Exceeded redirect limit while probing $Url"
  }
  catch {
    $message = [string]$_.Exception.Message
    if (-not (Test-LocalTlsCredentialFailure -Message $message)) {
      throw
    }

    $firstHop = Invoke-PythonHttpProbe -Url $Url -RedirectLimit $RedirectLimit
    $followed = Invoke-PythonHttpProbe -Url $Url -RedirectLimit $RedirectLimit -FollowRedirects
    if (-not $firstHop.Ok -and -not $followed.Ok) {
      throw ("PowerShell request failed with '{0}'. Python fallback also failed with '{1}'." -f $message, $followed.Error)
    }

    $hops = @()
    if (-not [string]::IsNullOrWhiteSpace($firstHop.RedirectLocation)) {
      $hops = @('{0} -> {1}' -f $firstHop.StatusCode, $firstHop.RedirectLocation)
    }

    return [pscustomobject]@{
      StatusCode = [int]$firstHop.StatusCode
      FinalUrl = [string]$followed.FinalUrl
      RedirectLocation = [string]$firstHop.RedirectLocation
      RedirectHops = @($hops)
      Content = [string]$followed.Content
      ResponseClient = 'python_urllib'
      FallbackReason = $message
    }
  }
  finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

function Join-Notes {
  param([string[]]$Items)

  return (($Items | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join '; ')
}

function Format-Bool {
  param([bool]$Value)

  if ($Value) {
    return 'yes'
  }

  return 'no'
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$priorityRows = @((Read-JsonFile -Path $PriorityUrlsPath))
if ($priorityRows.Count -eq 0) {
  throw "Priority URL list is empty: $PriorityUrlsPath"
}

$canonicalResults = @()
$legacyResults = @()
$canonicalBaseUrl = ([System.Uri]$priorityRows[0].canonical_url).GetLeftPart([System.UriPartial]::Authority)

foreach ($row in $priorityRows) {
  $path = [string]$row.path
  $canonicalUrl = [string]$row.canonical_url
  $legacyUrl = [string]$row.legacy_url
  $title = [string]$row.title
  $priorityTier = [string]$row.priority_tier
  $kind = [string]$row.kind

  try {
    $response = Invoke-CanonicalRequest -Url $canonicalUrl -RedirectLimit $MaxRedirects
    $html = [string]$response.Content
    $canonicalHref = Get-CanonicalHref -Html $html
    $robots = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'robots'
    $ogImage = Get-MetaContent -Html $html -AttributeName 'property' -AttributeValue 'og:image'
    $twitterImage = Get-MetaContent -Html $html -AttributeName 'name' -AttributeValue 'twitter:image'
    $rssFeeds = @(Get-RssFeedUrls -Html $html)
    $jsonLdTypes = @(Get-JsonLdTypes -Html $html)
    $expectedJsonLdType = Get-ExpectedJsonLdType -Path $path
    $issues = New-Object System.Collections.Generic.List[string]

    if ([string]$response.FinalUrl -ne $canonicalUrl) {
      $issues.Add(("final URL was '{0}'" -f $response.FinalUrl))
    }

    if ($canonicalHref -ne $canonicalUrl) {
      $issues.Add(("canonical href was '{0}'" -f $canonicalHref))
    }

    if ([string]::IsNullOrWhiteSpace($robots) -or $robots -notmatch 'max-image-preview:large') {
      $issues.Add('robots meta missing max-image-preview:large')
    }

    if ([string]::IsNullOrWhiteSpace($ogImage)) {
      $issues.Add('missing og:image')
    }

    if ([string]::IsNullOrWhiteSpace($twitterImage)) {
      $issues.Add('missing twitter:image')
    }

    if ($rssFeeds.Count -eq 0) {
      $issues.Add('missing RSS autodiscovery')
    }

    if (-not [string]::IsNullOrWhiteSpace($expectedJsonLdType) -and $jsonLdTypes -notcontains $expectedJsonLdType) {
      $issues.Add(("missing JSON-LD type '{0}'" -f $expectedJsonLdType))
    }

    if ($path -eq '/' -and $jsonLdTypes -notcontains 'SearchAction') {
      $issues.Add('homepage missing SearchAction')
    }

    $canonicalResults += [pscustomobject][ordered]@{
        probe_type = 'canonical'
        title = $title
        priority_tier = $priorityTier
        kind = $kind
        path = $path
        url = $canonicalUrl
        status_code = [int]$response.StatusCode
        final_url = [string]$response.FinalUrl
        canonical_href = [string]$canonicalHref
        robots = [string]$robots
        has_og_image = -not [string]::IsNullOrWhiteSpace($ogImage)
        has_twitter_image = -not [string]::IsNullOrWhiteSpace($twitterImage)
        rss_feed_count = $rssFeeds.Count
        rss_feed_urls = @($rssFeeds)
        expected_jsonld_type = $expectedJsonLdType
        jsonld_types = @($jsonLdTypes)
        smoke_passed = ($issues.Count -eq 0)
        response_client = [string]$response.ResponseClient
        fallback_reason = [string]$response.FallbackReason
        issues = @($issues)
      }
  }
  catch {
    $canonicalResults += [pscustomobject][ordered]@{
        probe_type = 'canonical'
        title = $title
        priority_tier = $priorityTier
        kind = $kind
        path = $path
        url = $canonicalUrl
        status_code = 0
        final_url = ''
        canonical_href = ''
        robots = ''
        has_og_image = $false
        has_twitter_image = $false
        rss_feed_count = 0
        rss_feed_urls = @()
        expected_jsonld_type = Get-ExpectedJsonLdType -Path $path
        jsonld_types = @()
        smoke_passed = $false
        response_client = ''
        fallback_reason = ''
        issues = @([string]$_.Exception.Message)
      }
  }

  try {
    $legacyResponse = Resolve-LegacyRequest -Url $legacyUrl -RedirectLimit $MaxRedirects
    $classification = 'broken_or_stale'
    if ($legacyResponse.StatusCode -eq 301 -and [string]$legacyResponse.RedirectLocation -eq $canonicalUrl) {
      $classification = 'full_path_301'
    }
    elseif ($legacyResponse.StatusCode -eq 200 -and ([string]$legacyResponse.FinalUrl).StartsWith('https://lpeasy.github.io/', [System.StringComparison]::OrdinalIgnoreCase)) {
      $classification = 'live_duplicate_html'
    }
    elseif ($legacyResponse.StatusCode -ge 300 -and $legacyResponse.StatusCode -lt 400) {
      $classification = 'redirect_wrong_destination'
    }

    $legacyResults += [pscustomobject][ordered]@{
        probe_type = 'legacy'
        title = $title
        priority_tier = $priorityTier
        kind = $kind
        path = $path
        url = $legacyUrl
        status_code = [int]$legacyResponse.StatusCode
        final_url = [string]$legacyResponse.FinalUrl
        redirect_location = [string]$legacyResponse.RedirectLocation
        classification = $classification
        redirect_requirement_met = ($classification -eq 'full_path_301')
        response_client = [string]$legacyResponse.ResponseClient
        fallback_reason = [string]$legacyResponse.FallbackReason
        redirect_hops = @($legacyResponse.RedirectHops)
      }
  }
  catch {
    $legacyResults += [pscustomobject][ordered]@{
        probe_type = 'legacy'
        title = $title
        priority_tier = $priorityTier
        kind = $kind
        path = $path
        url = $legacyUrl
        status_code = 0
        final_url = ''
        redirect_location = ''
        classification = 'broken_or_stale'
        redirect_requirement_met = $false
        response_client = ''
        fallback_reason = ''
        redirect_hops = @([string]$_.Exception.Message)
      }
  }
}

$llmsProbe = [ordered]@{
  url = Join-BaseRelativeUrl -BaseUrl $canonicalBaseUrl -Path '/llms.txt'
  reachable = $false
  contains_canonical_url = $false
  response_client = ''
  fallback_reason = ''
  issues = @()
}

try {
  $llmsContent = Invoke-WebRequest -Uri $llmsProbe.url -MaximumRedirection $MaxRedirects
  $llmsProbe.reachable = $true
  $llmsProbe.contains_canonical_url = [string]$llmsContent.Content -match [regex]::Escape($canonicalBaseUrl)
  $llmsProbe.response_client = 'powershell'
  if (-not $llmsProbe.contains_canonical_url) {
    $llmsProbe.issues += 'llms.txt did not contain the canonical host'
  }
}
catch {
  $message = [string]$_.Exception.Message
  if (Test-LocalTlsCredentialFailure -Message $message) {
    try {
      $fallback = Invoke-PythonHttpProbe -Url $llmsProbe.url -RedirectLimit $MaxRedirects -FollowRedirects
      $llmsProbe.reachable = [bool]$fallback.Ok
      $llmsProbe.contains_canonical_url = [string]$fallback.Content -match [regex]::Escape($canonicalBaseUrl)
      $llmsProbe.response_client = 'python_urllib'
      $llmsProbe.fallback_reason = $message
      if (-not $llmsProbe.contains_canonical_url) {
        $llmsProbe.issues += 'llms.txt did not contain the canonical host'
      }
    }
    catch {
      $llmsProbe.issues += ('PowerShell request failed with ''{0}''. Python fallback also failed with ''{1}''.' -f $message, [string]$_.Exception.Message)
    }
  }
  else {
    $llmsProbe.issues += $message
  }
}

if ($UpdateWorksheet -and (Test-Path -LiteralPath $WorksheetPath -PathType Leaf)) {
  $worksheetRows = @((Import-Csv -Path $WorksheetPath))
  foreach ($worksheetRow in $worksheetRows) {
    $canonicalMatch = @($canonicalResults | Where-Object { $_.url -eq [string]$worksheetRow.url }) | Select-Object -First 1
    $legacyMatch = @($legacyResults | Where-Object { $_.path -eq (([System.Uri]$worksheetRow.url).AbsolutePath) }) | Select-Object -First 1

    if ($canonicalMatch) {
      $worksheetRow.deployed = Format-Bool -Value ([int]$canonicalMatch.status_code -eq 200)
      $worksheetRow.live_smoke_passed = Format-Bool -Value ([bool]$canonicalMatch.smoke_passed)
      $worksheetRow.selected_canonical = [string]$canonicalMatch.canonical_href
      $canonicalClientNote = if ([string]$canonicalMatch.response_client -eq 'python_urllib') { ' via python_urllib fallback' } else { '' }
      $canonicalNote = if (@($canonicalMatch.issues).Count -gt 0) { ('canonical: ' + ((@($canonicalMatch.issues)) -join ', ') + $canonicalClientNote) } else { ('canonical: passed' + $canonicalClientNote) }
      $worksheetRow.notes = $canonicalNote
    }

    if ($legacyMatch) {
      $worksheetRow.legacy_redirect_passed = Format-Bool -Value ([bool]$legacyMatch.redirect_requirement_met)
      $legacyClientNote = if ([string]$legacyMatch.response_client -eq 'python_urllib') { ' via python_urllib fallback' } else { '' }
      $legacyNote = ('legacy: {0}{1}' -f [string]$legacyMatch.classification, $legacyClientNote)
      $worksheetRow.notes = Join-Notes -Items @([string]$worksheetRow.notes, $legacyNote)
    }
  }

  $worksheetRows | Export-Csv -Path $WorksheetPath -NoTypeInformation -Encoding utf8
}

$summary = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  canonical_base_url = $canonicalBaseUrl
  canonical_pages_total = $canonicalResults.Count
  canonical_pages_passed = @($canonicalResults | Where-Object { $_.smoke_passed }).Count
  legacy_pages_total = $legacyResults.Count
  legacy_redirects_passing = @($legacyResults | Where-Object { $_.redirect_requirement_met }).Count
  llms_reachable = [bool]$llmsProbe.reachable
  llms_contains_canonical_url = [bool]$llmsProbe.contains_canonical_url
}

$report = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  canonical_base_url = $canonicalBaseUrl
  llms_probe = $llmsProbe
  summary = $summary
  canonical_results = @($canonicalResults)
  legacy_results = @($legacyResults)
}

$reportPath = Join-Path $OutputDir 'probe-results.json'
$csvPath = Join-Path $OutputDir 'probe-results.csv'
$markdownPath = Join-Path $OutputDir 'probe-results.md'
Write-JsonFile -Path $reportPath -Value $report

$flatRows = @($canonicalResults) + @($legacyResults)
$flatRows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding utf8

$markdown = New-Object System.Collections.Generic.List[string]
$markdown.Add('# SEO Rollout Probe')
$markdown.Add('')
$markdown.Add(('- Generated at: {0}' -f $report.generated_at))
$markdown.Add(('- Canonical host: {0}' -f $canonicalBaseUrl))
$markdown.Add(('- Canonical pages passed: {0}/{1}' -f $summary.canonical_pages_passed, $summary.canonical_pages_total))
$markdown.Add(('- Legacy redirects passing: {0}/{1}' -f $summary.legacy_redirects_passing, $summary.legacy_pages_total))
$markdown.Add(('- llms.txt reachable: {0}' -f (Format-Bool -Value $summary.llms_reachable)))
$markdown.Add(('- llms.txt contains canonical host: {0}' -f (Format-Bool -Value $summary.llms_contains_canonical_url)))
$markdown.Add('')
$markdown.Add('## Canonical Host Results')
$markdown.Add('')
$markdown.Add('| Title | URL | Smoke | Client | Canonical href | Robots | Issues |')
$markdown.Add('| --- | --- | --- | --- | --- | --- | --- |')
foreach ($row in $canonicalResults) {
  $issueText = if (@($row.issues).Count -gt 0) { (@($row.issues) -join ', ') } else { 'passed' }
  $clientText = if ([string]$row.response_client -eq 'python_urllib') { 'python_urllib fallback' } else { [string]$row.response_client }
  $markdown.Add(('| {0} | {1} | {2} | {3} | {4} | {5} | {6} |' -f $row.title, $row.url, (Format-Bool -Value ([bool]$row.smoke_passed)), $clientText, $row.canonical_href, $row.robots, $issueText))
}

$markdown.Add('')
$markdown.Add('## Legacy Host Results')
$markdown.Add('')
$markdown.Add('| Title | Legacy URL | Status | Client | Final URL | Redirect target |')
$markdown.Add('| --- | --- | --- | --- | --- | --- |')
foreach ($row in $legacyResults) {
  $clientText = if ([string]$row.response_client -eq 'python_urllib') { 'python_urllib fallback' } else { [string]$row.response_client }
  $markdown.Add(('| {0} | {1} | {2} | {3} | {4} | {5} |' -f $row.title, $row.url, $row.classification, $clientText, $row.final_url, $row.redirect_location))
}

$markdown -join [Environment]::NewLine | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host ("Wrote SEO rollout probe outputs to {0}" -f $OutputDir)
$global:LASTEXITCODE = 0
exit 0
