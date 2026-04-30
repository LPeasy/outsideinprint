$ErrorActionPreference = "Stop"

$repo = Resolve-Path "."
$fixtureSource = Join-Path $repo "tests/fixtures/medium/source"
if (-not (Test-Path $fixtureSource)) {
  throw "Fixture source missing: $fixtureSource"
}

$pwsh = Join-Path $repo "tools/bin/generated/pwsh.cmd"
$python = Join-Path $repo "tools/bin/generated/python.cmd"

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("medium-import-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$serverProcess = $null
try {
  $fixtureWork = Join-Path $tempRoot "source"
  Copy-Item -Path $fixtureSource -Destination $fixtureWork -Recurse -Force

  $mediaRoot = Join-Path $tempRoot "fixture-media"
  New-Item -ItemType Directory -Force -Path $mediaRoot | Out-Null
  [System.IO.File]::WriteAllBytes((Join-Path $mediaRoot "fixture.jpeg"), [byte[]](0xff, 0xd8, 0xff, 0xd9))

  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 0)
  $listener.Start()
  $port = $listener.LocalEndpoint.Port
  $listener.Stop()

  $serverOut = Join-Path $tempRoot "media-server.out.log"
  $serverErr = Join-Path $tempRoot "media-server.err.log"
  $serverProcess = Start-Process -FilePath $python -ArgumentList @(
    "-m",
    "http.server",
    [string]$port,
    "--bind",
    "127.0.0.1",
    "--directory",
    $mediaRoot
  ) -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru

  $fixtureImageUrl = "http://127.0.0.1:$port/fixture.jpeg"
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      Invoke-WebRequest -Uri $fixtureImageUrl -UseBasicParsing -TimeoutSec 1 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not $ready) {
    throw "Fixture media server did not start on $fixtureImageUrl."
  }

  $imageFixturePath = Join-Path $fixtureWork "posts/2026-01-02_Subtitle-Image-222222222222.html"
  $imageFixture = Get-Content -Path $imageFixturePath -Raw
  $imageFixture = $imageFixture.Replace("https://cdn-images-1.medium.com/max/1024/1*example.jpeg", $fixtureImageUrl)
  Set-Content -Path $imageFixturePath -Value $imageFixture -Encoding UTF8

  $zipPath = Join-Path $tempRoot "fixture-medium-export.zip"
  Compress-Archive -Path (Join-Path $fixtureWork "*") -DestinationPath $zipPath -Force

  $contentOut = Join-Path $tempRoot "content/essays"
  $mediaOut = Join-Path $tempRoot "static/images/medium"
  $reportsDir = Join-Path $tempRoot "reports"
  New-Item -ItemType Directory -Force -Path $contentOut,$mediaOut,$reportsDir | Out-Null

  $reportDry = Join-Path $reportsDir "dryrun.json"
  $slugMap = Join-Path $reportsDir "slug-map.json"

  & $pwsh -NoLogo -NoProfile -File (Join-Path $repo "scripts/import_medium_export.ps1") `
    -ZipPath $zipPath `
    -ContentOut $contentOut `
    -MediaOut $mediaOut `
    -ReportOut $reportDry `
    -SlugMapPath $slugMap `
    -DryRun

  $dry = Get-Content $reportDry -Raw | ConvertFrom-Json
  if ($dry.totals.converted -ne 2) { throw "Expected 2 converted in dry run, got $($dry.totals.converted)" }
  if ($dry.totals.skipped -lt 3) { throw "Expected at least 3 skipped in dry run, got $($dry.totals.skipped)" }

  $reportWrite = Join-Path $reportsDir "write.json"
  & $pwsh -NoLogo -NoProfile -File (Join-Path $repo "scripts/import_medium_export.ps1") `
    -ZipPath $zipPath `
    -ContentOut $contentOut `
    -MediaOut $mediaOut `
    -ReportOut $reportWrite `
    -SlugMapPath $slugMap

  $write = Get-Content $reportWrite -Raw | ConvertFrom-Json
  if ($write.totals.converted -ne 2) { throw "Expected 2 converted in write run, got $($write.totals.converted)" }

  $mdFiles = Get-ChildItem -Path $contentOut -File -Filter *.md
  if ($mdFiles.Count -ne 2) { throw "Expected 2 markdown files, got $($mdFiles.Count)" }

  $subtitleImport = Get-Content (Join-Path $contentOut "essay-with-subtitle-and-image.md") -Raw
  if ($subtitleImport -notmatch '(?m)^description: "Subtitle line ~ keep exact"$') {
    throw "Expected imported subtitle fixture to preserve the subtitle as description front matter."
  }

  $longImport = Get-Content (Join-Path $contentOut "long-essay-for-import.md") -Raw
  if ($longImport -notmatch '(?m)^description: "This is a longform sentence for migration testing with stable meaning and preserved tilde ~ punctuation') {
    throw "Expected subtitle-free import fixture to derive a conservative description from the first meaningful paragraph."
  }

  Write-Host "Fixture migration tests passed." -ForegroundColor Green
}
finally {
  if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
