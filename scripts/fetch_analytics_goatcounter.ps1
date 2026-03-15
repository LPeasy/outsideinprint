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
      $statusCode = 0
      $details = ""
      if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode.value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $details = $reader.ReadToEnd()
      }

      $isRetryable = ($statusCode -eq 0 -or $statusCode -eq 429 -or $statusCode -eq 502 -or $statusCode -eq 503 -or $statusCode -eq 504)
      if ($attempt -lt $MaxRetries -and $isRetryable) {
        Write-Warning ("GoatCounter request attempt {0}/{1} failed with status {2}. Retrying in {3}s." -f $attempt, $MaxRetries, $(if ($statusCode) { $statusCode } else { "network" }), $delaySeconds)
        Start-Sleep -Seconds $delaySeconds
        $delaySeconds = [Math]::Min($delaySeconds * 2, 30)
        continue
      }

      throw "GoatCounter request failed after $attempt attempt(s). $details"
    }
  }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "GOATCOUNTER_API_KEY is required."
}

$SiteUrl = Convert-ToText $SiteUrl "https://outsideinprint.goatcounter.com"
$SiteUrl = $SiteUrl.TrimEnd("/")
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

$download = Invoke-GoatCounterRequest -Method Get -Uri "$apiBaseUrl/export/$exportId/download" -RawResponse
$csvPath = Join-Path $OutputDir "goatcounter-export.csv"
$encoding = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($csvPath), $download.Content, $encoding)

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
