$ErrorActionPreference = "Stop"

$repo = Resolve-Path "."
$fixtureSource = Join-Path $repo "tests/fixtures/medium/source"
if (-not (Test-Path $fixtureSource)) {
  throw "Fixture source missing: $fixtureSource"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("medium-import-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$zipPath = Join-Path $tempRoot "fixture-medium-export.zip"
Compress-Archive -Path (Join-Path $fixtureSource "*") -DestinationPath $zipPath -Force

$contentOut = Join-Path $tempRoot "content/essays"
$mediaOut = Join-Path $tempRoot "static/images/medium"
$reportsDir = Join-Path $tempRoot "reports"
New-Item -ItemType Directory -Force -Path $contentOut,$mediaOut,$reportsDir | Out-Null

$reportDry = Join-Path $reportsDir "dryrun.json"
$slugMap = Join-Path $reportsDir "slug-map.json"

powershell -ExecutionPolicy Bypass -File (Join-Path $repo "scripts/import_medium_export.ps1") `
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
if (Get-Command pandoc -ErrorAction SilentlyContinue) {
  powershell -ExecutionPolicy Bypass -File (Join-Path $repo "scripts/import_medium_export.ps1") `
    -ZipPath $zipPath `
    -ContentOut $contentOut `
    -MediaOut $mediaOut `
    -ReportOut $reportWrite `
    -SlugMapPath $slugMap

  $write = Get-Content $reportWrite -Raw | ConvertFrom-Json
  if ($write.totals.converted -ne 2) { throw "Expected 2 converted in write run, got $($write.totals.converted)" }

  $mdFiles = Get-ChildItem -Path $contentOut -File -Filter *.md
  if ($mdFiles.Count -ne 2) { throw "Expected 2 markdown files, got $($mdFiles.Count)" }
} else {
  Write-Host "pandoc not found; skipped write-mode fixture validation." -ForegroundColor Yellow
}

Write-Host "Fixture migration tests passed." -ForegroundColor Green
