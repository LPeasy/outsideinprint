$ErrorActionPreference = "Stop"

$repo = Resolve-Path "."
$fixtureSource = Join-Path $repo "tests/fixtures/medium/source"
if (-not (Test-Path $fixtureSource)) {
  throw "Fixture source missing: $fixtureSource"
}

function Get-TestPowerShellExecutable {
  $isWindowsHost = [System.IO.Path]::DirectorySeparatorChar -eq '\'
  $currentProcess = Get-Process -Id $PID
  if ($currentProcess.Path -and (Test-Path -LiteralPath $currentProcess.Path -PathType Leaf) -and ([System.IO.Path]::GetFileNameWithoutExtension($currentProcess.Path) -ieq 'pwsh')) {
    return $currentProcess.Path
  }

  $wrapper = Join-Path $repo "tools/bin/generated/pwsh.cmd"
  if ($isWindowsHost -and (Test-Path -LiteralPath $wrapper -PathType Leaf)) {
    return $wrapper
  }

  $command = Get-Command pwsh -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command -and $command.Source) {
    return $command.Source
  }

  throw "PowerShell 7 is required to run the Medium import test."
}

function Get-TestPythonExecutable {
  $isWindowsHost = [System.IO.Path]::DirectorySeparatorChar -eq '\'
  if ($isWindowsHost) {
    $bundledPython = @(
      Get-ChildItem -LiteralPath (Join-Path $repo 'tools/vendor') -Directory -Filter 'python-*' -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'python.exe' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
    )
    if ($bundledPython.Count -eq 1) {
      return $bundledPython[0]
    }

    $wrapper = Join-Path $repo "tools/bin/generated/python.cmd"
    if (Test-Path -LiteralPath $wrapper -PathType Leaf) {
      return $wrapper
    }
  }

  foreach ($name in @('python3', 'python')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and $command.Source) {
      return $command.Source
    }
  }

  throw "Python is required to run the Medium import test."
}

$pwsh = Get-TestPowerShellExecutable
$python = Get-TestPythonExecutable

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("medium-import-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$serverProcess = $null
try {
  $fixtureWork = Join-Path $tempRoot "source"
  Copy-Item -Path $fixtureSource -Destination $fixtureWork -Recurse -Force

  $mediaRoot = Join-Path $tempRoot "fixture-media"
  New-Item -ItemType Directory -Force -Path $mediaRoot | Out-Null
  $fixtureImageSource = Join-Path $repo 'assets/images/originals/essays/biter-the-slang-word-that-hits/hero-cassette.jpg'
  if (-not (Test-Path -LiteralPath $fixtureImageSource -PathType Leaf)) {
    throw "Managed JPEG fixture source missing: $fixtureImageSource"
  }
  $fixtureImagePath = Join-Path $mediaRoot 'fixture.jpeg'
  Copy-Item -LiteralPath $fixtureImageSource -Destination $fixtureImagePath
  $fixtureImageHash = (Get-FileHash -LiteralPath $fixtureImagePath -Algorithm SHA256).Hash.ToLowerInvariant()

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
  $mediaOut = Join-Path $tempRoot "assets/images/originals/medium"
  $reportsDir = Join-Path $tempRoot "reports"
  New-Item -ItemType Directory -Force -Path $contentOut,$mediaOut,$reportsDir | Out-Null

  $reportDry = Join-Path $reportsDir "dryrun.json"
  $slugMap = Join-Path $reportsDir "slug-map.json"

  & $pwsh -NoLogo -NoProfile -File (Join-Path $repo "scripts/import_medium_export.ps1") `
    -ZipPath $zipPath `
    -Root $tempRoot `
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
    -Root $tempRoot `
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
  if ($subtitleImport -notmatch [regex]::Escape("oip-image:medium/$fixtureImageHash")) {
    throw "Expected imported image to use its registered medium/<sha256> asset ID."
  }

  $managedSource = Join-Path $mediaOut "$fixtureImageHash.jpeg"
  if (-not (Test-Path -LiteralPath $managedSource -PathType Leaf)) {
    throw "Expected one canonical managed Medium source: $managedSource"
  }
  if (Test-Path -LiteralPath (Join-Path $tempRoot 'static/images/medium')) {
    throw 'Medium import wrote a duplicate image beneath static/images/medium.'
  }

  $manifestPath = Join-Path $tempRoot 'data/image-assets.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'Medium import did not write the managed image manifest.'
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -AsHashtable -Depth 20
  $assetId = "medium/$fixtureImageHash"
  if (-not $manifest.assets.ContainsKey($assetId)) {
    throw "Medium import did not register $assetId."
  }
  $asset = $manifest.assets[$assetId]
  if ([string]$asset.source -ne "images/originals/medium/$fixtureImageHash.jpeg") {
    throw "Medium import registered an unexpected canonical source: $($asset.source)"
  }
  if ([string]$asset.image_class -ne 'medium_import' -or [string]$asset.processing_state -ne 'derivative_capable') {
    throw 'Medium import registered invalid image class or processing state.'
  }
  $legacyAlias = "/images/medium/essay-with-subtitle-and-image/$fixtureImageHash.jpeg"
  if (-not $manifest.aliases.ContainsKey($legacyAlias) -or [string]$manifest.aliases[$legacyAlias] -ne $assetId) {
    throw "Medium import did not preserve the expected legacy URL alias: $legacyAlias"
  }

  $longImport = Get-Content (Join-Path $contentOut "long-essay-for-import.md") -Raw
  if ($longImport -notmatch '(?m)^description: "This is a longform sentence for migration testing with stable meaning and preserved tilde ~ punctuation') {
    throw "Expected subtitle-free import fixture to derive a conservative description from the first meaningful paragraph."
  }

  Write-Host "Fixture migration tests passed." -ForegroundColor Green
}
catch {
  Write-Host ("Medium import fixture failed: {0}" -f $_.Exception.ToString()) -ForegroundColor Red
  throw
}
finally {
  if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
    $resolvedSystemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (-not $resolvedTempRoot.StartsWith($resolvedSystemTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove Medium-import fixture outside the system temp root: $resolvedTempRoot"
    }
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
}
