param(
  [string]$ApiKey = $env:GOATCOUNTER_API_KEY,
  [string]$SiteUrl = $(if ($env:GOATCOUNTER_SITE_URL) { $env:GOATCOUNTER_SITE_URL } else { "https://outsideinprint.goatcounter.com" }),
  [string]$OutputDir = "./.analytics-refresh/raw",
  [int]$MaxRetries = 3,
  [int]$InitialRetryDelaySeconds = 2,
  [int]$PollIntervalSeconds = 5,
  [int]$MaxPollAttempts = 60
)

$ErrorActionPreference = "Stop"

function Convert-ToText {
  param(
    [object]$Value,
    [string]$Default = ""
  )

  if ($null -eq $Value) {
    return $Default
  }

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $Default
  }

  return $text.Trim()
}

function Write-Utf8Json {
  param(
    [string]$Path,
    [object]$Value
  )

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  if ($Value -is [System.Collections.IDictionary] -and $Value.Count -eq 0) {
    $json = "{}"
  } elseif ($Value -is [array] -and $Value.Count -eq 0) {
    $json = "[]"
  } else {
    $json = ConvertTo-Json -InputObject $Value -Depth 20
  }

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($Path), $json + [Environment]::NewLine, $encoding)
}

function Get-ResponseDetails {
  param([object]$Response)

  if ($null -eq $Response) {
    return ""
  }

  try {
    if ($Response.PSObject.Properties.Name -contains "Content" -and $null -ne $Response.Content) {
      $content = $Response.Content

      if ($content -is [string]) {
        return $content
      }

      if ($content.PSObject.Methods.Name -contains "ReadAsStringAsync") {
        return $content.ReadAsStringAsync().GetAwaiter().GetResult()
      }
    }

    if ($Response.PSObject.Methods.Name -contains "GetResponseStream") {
      $stream = $Response.GetResponseStream()
      if ($null -ne $stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        return $reader.ReadToEnd()
      }
    }
  } catch {
    return ""
  }

  return ""
}

function Normalize-ErrorText {
  param(
    [string]$Value,
    [int]$MaxLength = 600
  )

  $text = Convert-ToText $Value
  if (-not $text) {
    return ""
  }

  $text = [regex]::Replace($text, "\s+", " ").Trim()
  if ($text.Length -le $MaxLength) {
    return $text
  }

  return ($text.Substring(0, $MaxLength).TrimEnd() + " ...")
}

function Get-ResponseStatusCode {
  param([object]$Response)

  if ($null -eq $Response) {
    return 0
  }

  try {
    if ($Response.PSObject.Properties.Name -contains "StatusCode" -and $null -ne $Response.StatusCode) {
      return [int]$Response.StatusCode
    }
  } catch {
    return 0
  }

  return 0
}

function Get-ResponseReasonPhrase {
  param([object]$Response)

  if ($null -eq $Response) {
    return ""
  }

  if ($Response.PSObject.Properties.Name -contains "ReasonPhrase" -and $Response.ReasonPhrase) {
    return Convert-ToText $Response.ReasonPhrase
  }

  if ($Response.PSObject.Properties.Name -contains "StatusDescription" -and $Response.StatusDescription) {
    return Convert-ToText $Response.StatusDescription
  }

  return ""
}

function Get-ResponseUri {
  param(
    [object]$Response,
    [string]$FallbackUri
  )

  if ($null -ne $Response) {
    if ($Response.PSObject.Properties.Name -contains "RequestMessage" -and $null -ne $Response.RequestMessage) {
      if ($Response.RequestMessage.RequestUri) {
        return Convert-ToText ([string]$Response.RequestMessage.RequestUri) $FallbackUri
      }
    }

    if ($Response.PSObject.Properties.Name -contains "ResponseUri" -and $Response.ResponseUri) {
      return Convert-ToText ([string]$Response.ResponseUri) $FallbackUri
    }
  }

  return $FallbackUri
}

function Format-GoatCounterFailure {
  param(
    [string]$Operation,
    [string]$Method,
    [string]$Uri,
    [int]$Attempt,
    [System.Exception]$Exception,
    [object]$Response
  )

  $statusCode = Get-ResponseStatusCode -Response $Response
  $reasonPhrase = Normalize-ErrorText (Get-ResponseReasonPhrase -Response $Response) 120
  $requestUri = Normalize-ErrorText (Get-ResponseUri -Response $Response -FallbackUri $Uri) 300
  $exceptionMessage = Normalize-ErrorText $Exception.Message 300
  $details = Normalize-ErrorText (Get-ResponseDetails -Response $Response)

  $parts = @(
    ("GoatCounter {0} failed after {1} attempt(s)." -f $Operation, $Attempt),
    ("method={0}" -f $Method),
    ("uri={0}" -f $requestUri)
  )

  if ($statusCode -gt 0) {
    $parts += ("status={0}" -f $statusCode)
  }

  if ($reasonPhrase) {
    $parts += ("reason={0}" -f $reasonPhrase)
  }

  if ($exceptionMessage) {
    $parts += ("error={0}" -f $exceptionMessage)
  }

  if ($details) {
    $parts += ("body={0}" -f $details)
  }

  if ($statusCode -in @(401, 403)) {
    $parts += "Check GOATCOUNTER_API_KEY and confirm it has access to this GoatCounter site and export endpoint."
  } elseif ($statusCode -eq 404) {
    $parts += "Check GOATCOUNTER_SITE_URL. The fetch script expects the site root and appends /api/v0/export itself."
  }

  return ($parts -join " ")
}

function Invoke-GoatCounterDownload {
  param(
    [string]$Uri,
    [string]$OutFile
  )

  $headers = @{
    Authorization = "Bearer $ApiKey"
  }

  $attempt = 0
  $delaySeconds = [Math]::Max(1, $InitialRetryDelaySeconds)

  while ($true) {
    $attempt += 1

    try {
      Invoke-WebRequest -Method Get -Uri $Uri -Headers $headers -OutFile $OutFile
      return
    } catch {
      $response = if ($_.Exception.Response) { $_.Exception.Response } else { $null }
      $statusCode = Get-ResponseStatusCode -Response $response
      $isRetryable = ($statusCode -eq 0 -or $statusCode -eq 408 -or $statusCode -eq 429 -or $statusCode -eq 500 -or $statusCode -eq 502 -or $statusCode -eq 503 -or $statusCode -eq 504)
      if ($attempt -lt $MaxRetries -and $isRetryable) {
        $reason = Get-ResponseReasonPhrase -Response $response
        Write-Warning ("GoatCounter download attempt {0}/{1} failed for GET {2} with status {3}{4}. Retrying in {5}s." -f $attempt, $MaxRetries, $Uri, $(if ($statusCode) { $statusCode } else { "network" }), $(if ($reason) { " ($reason)" } else { "" }), $delaySeconds)
        Start-Sleep -Seconds $delaySeconds
        $delaySeconds = [Math]::Min($delaySeconds * 2, 30)
        continue
      }

      throw (Format-GoatCounterFailure -Operation "download" -Method "GET" -Uri $Uri -Attempt $attempt -Exception $_.Exception -Response $response)
    }
  }
}

function Expand-DownloadedCsv {
  param(
    [string]$InputPath,
    [string]$OutputPath
  )

  $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $InputPath))
  $encoding = [System.Text.UTF8Encoding]::new($false)

  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0x1f -and $bytes[1] -eq 0x8b) {
    $inputStream = [System.IO.File]::OpenRead((Resolve-Path $InputPath))
    try {
      $gzipStream = New-Object System.IO.Compression.GzipStream($inputStream, [System.IO.Compression.CompressionMode]::Decompress)
      try {
        $outputStream = [System.IO.File]::Create([System.IO.Path]::GetFullPath($OutputPath))
        try {
          $gzipStream.CopyTo($outputStream)
        } finally {
          $outputStream.Dispose()
        }
      } finally {
        $gzipStream.Dispose()
      }
    } finally {
      $inputStream.Dispose()
    }

    return
  }

  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputPath), $text, $encoding)
}

function Invoke-GoatCounterRequest {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null,
    [switch]$RawResponse
  )

  $headers = @{
    Authorization = "Bearer $ApiKey"
  }

  $attempt = 0
  $delaySeconds = [Math]::Max(1, $InitialRetryDelaySeconds)

  while ($true) {
    $attempt += 1

    try {
      $invokeParams = @{
        Method = $Method
        Uri = $Uri
        Headers = $headers
      }

      if ($null -ne $Body) {
        $invokeParams["ContentType"] = "application/json"
        $invokeParams["Body"] = ($Body | ConvertTo-Json -Depth 20)
      }

      if ($RawResponse) {
        return Invoke-WebRequest @invokeParams
      }

      return Invoke-RestMethod @invokeParams
    } catch {
      $response = if ($_.Exception.Response) { $_.Exception.Response } else { $null }
      $statusCode = Get-ResponseStatusCode -Response $response
      $isRetryable = ($statusCode -eq 0 -or $statusCode -eq 408 -or $statusCode -eq 429 -or $statusCode -eq 500 -or $statusCode -eq 502 -or $statusCode -eq 503 -or $statusCode -eq 504)
      if ($attempt -lt $MaxRetries -and $isRetryable) {
        $reason = Get-ResponseReasonPhrase -Response $response
        Write-Warning ("GoatCounter request attempt {0}/{1} failed for {2} {3} with status {4}{5}. Retrying in {6}s." -f $attempt, $MaxRetries, $Method, $Uri, $(if ($statusCode) { $statusCode } else { "network" }), $(if ($reason) { " ($reason)" } else { "" }), $delaySeconds)
        Start-Sleep -Seconds $delaySeconds
        $delaySeconds = [Math]::Min($delaySeconds * 2, 30)
        continue
      }

      throw (Format-GoatCounterFailure -Operation "request" -Method $Method -Uri $Uri -Attempt $attempt -Exception $_.Exception -Response $response)
    }
  }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "GOATCOUNTER_API_KEY is required."
}

$SiteUrl = Convert-ToText $SiteUrl "https://outsideinprint.goatcounter.com"
$SiteUrl = $SiteUrl.TrimEnd("/")

try {
  $siteUri = [System.Uri]$SiteUrl
} catch {
  throw "GOATCOUNTER_SITE_URL must be an absolute http(s) URL. Found '$SiteUrl'."
}

if (-not $siteUri.IsAbsoluteUri -or $siteUri.Scheme -notin @("http", "https")) {
  throw "GOATCOUNTER_SITE_URL must be an absolute http(s) URL. Found '$SiteUrl'."
}

if ($siteUri.AbsolutePath.TrimEnd("/") -eq "/api/v0") {
  throw "GOATCOUNTER_SITE_URL must point at the GoatCounter site root, not the API base. Use a value like 'https://outsideinprint.goatcounter.com'."
}

$apiBaseUrl = "$SiteUrl/api/v0"

Write-Host "Outside In Print ~ Fetch GoatCounter Analytics" -ForegroundColor Cyan
Write-Host ("Site: {0}" -f $SiteUrl) -ForegroundColor DarkCyan

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$export = Invoke-GoatCounterRequest -Method Post -Uri "$apiBaseUrl/export" -Body @{}
if ($null -eq $export -or $null -eq $export.id) {
  throw "GoatCounter did not return an export ID. Check that the API key has access to the site and that export creation is allowed."
}

$exportId = [int]$export.id
Write-Host ("Started export {0}; waiting for completion..." -f $exportId) -ForegroundColor Yellow

$completedExport = $null
for ($attempt = 1; $attempt -le $MaxPollAttempts; $attempt++) {
  Start-Sleep -Seconds $PollIntervalSeconds
  $status = Invoke-GoatCounterRequest -Method Get -Uri "$apiBaseUrl/export/$exportId"

  if ($status.error) {
    throw ("GoatCounter export {0} failed: {1}" -f $exportId, $status.error)
  }

  if ($status.finished_at) {
    $completedExport = $status
    break
  }
}

if ($null -eq $completedExport) {
  throw ("GoatCounter export {0} did not finish after {1} attempts with a {2}s poll interval." -f $exportId, $MaxPollAttempts, $PollIntervalSeconds)
}

$downloadPath = Join-Path $OutputDir "goatcounter-export.download"
$csvPath = Join-Path $OutputDir "goatcounter-export.csv"
Invoke-GoatCounterDownload -Uri "$apiBaseUrl/export/$exportId/download" -OutFile $downloadPath
Expand-DownloadedCsv -InputPath $downloadPath -OutputPath $csvPath
Remove-Item $downloadPath -Force -ErrorAction SilentlyContinue

$metadata = [ordered]@{
  source = "goatcounter"
  site_url = $SiteUrl
  export_id = $exportId
  exported_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
  created_at = Convert-ToText $completedExport.created_at
  finished_at = Convert-ToText $completedExport.finished_at
  last_hit_id = $completedExport.last_hit_id
  num_rows = $completedExport.num_rows
  size = Convert-ToText $completedExport.size
  hash = Convert-ToText $completedExport.hash
}

$metadataPath = Join-Path $OutputDir "metadata.json"
Write-Utf8Json -Path $metadataPath -Value $metadata

Write-Host ("Wrote {0}" -f $csvPath) -ForegroundColor Green
Write-Host ("Wrote {0}" -f $metadataPath) -ForegroundColor Green
Write-Host ("`nFetched GoatCounter export {0} with {1} row(s)." -f $exportId, $(if ($completedExport.num_rows) { $completedExport.num_rows } else { "unknown" })) -ForegroundColor Green
