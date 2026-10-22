#requires -Version 7.0

param(
  [string]$FixtureRoot = '',
  [string]$HugoPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $HugoPath) {
  $HugoPath = if ($IsWindows) {
    Join-Path $repoRoot 'tools/bin/generated/hugo.cmd'
  } else {
    (Get-Command hugo -ErrorAction Stop).Source
  }
}
if (-not $FixtureRoot) {
  $FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('oip-current-cartoon-' + [guid]::NewGuid().ToString('N'))
}
if (Test-Path -LiteralPath $FixtureRoot) {
  throw "Fixture path must be new: $FixtureRoot"
}

function Write-Fixture([string]$RelativePath, [string]$Text) {
  $path = Join-Path $FixtureRoot $RelativePath
  [IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
  [IO.File]::WriteAllText($path, $Text, [Text.UTF8Encoding]::new($false))
}

function Assert-Contract([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

$version = & $HugoPath version
Assert-Contract ($LASTEXITCODE -eq 0 -and "$version" -match '^hugo v0\.167\.0') 'The current-illustration fixture requires pinned Hugo 0.167.0.'

foreach ($relativePath in @(
  'layouts/partials/editorial/current-cartoon.html',
  'layouts/partials/editorial/registered-cartoons.html',
  'layouts/partials/editorial/published-cartoons.html',
  'layouts/partials/editorial/cartoon-is-published.html',
  'layouts/partials/collections/is-published.html',
  'layouts/partials/metadata/policy.html',
  'layouts/partials/metadata/route.html',
  'layouts/partials/images/resolve.html'
)) {
  Write-Fixture $relativePath ([IO.File]::ReadAllText((Join-Path $repoRoot $relativePath)))
}
Write-Fixture 'layouts/index.html' '{{ with partial "editorial/current-cartoon.html" . }}{{ .slug }}{{ else }}none{{ end }}'
Write-Fixture 'hugo.toml' @'
baseURL = "https://example.test/"
timeZone = "America/New_York"
disableKinds = ["taxonomy", "term", "RSS", "sitemap"]
'@

$cases = @(
  @{
    Name = 'stale-pin-and-effective-release'; Expected = 'backdated-new-release'; Clock = '2020-09-01T12:00:00Z'
    Current = 'pinned-old'
    Cartoons = @(
      @{ slug = 'pinned-old'; date = '2020-08-01' },
      @{ slug = 'later-display-date'; date = '2020-08-31'; publishDate = '2020-08-20T12:00:00Z' },
      @{ slug = 'backdated-new-release'; date = '2020-08-15'; publishDate = '2020-08-30T12:00:00Z' }
    )
  },
  @{
    Name = 'same-day-release-time'; Expected = 'z-later'; Clock = '2020-09-01T12:00:00Z'
    Cartoons = @(
      @{ slug = 'a-earlier'; date = '2020-08-30'; publishDate = '2020-08-30T08:00:00-04:00' },
      @{ slug = 'z-later'; date = '2020-08-30'; publishDate = '2020-08-30T13:00:00Z' }
    )
  },
  @{
    Name = 'fractional-release-time'; Expected = 'z-later'; Clock = '2020-09-01T12:00:00Z'
    Cartoons = @(
      @{ slug = 'a-earlier'; date = '2020-08-30'; publishDate = '2020-08-30T12:00:00.100Z' },
      @{ slug = 'z-later'; date = '2020-08-30'; publishDate = '2020-08-30T12:00:00.900Z' }
    )
  },
  @{
    Name = 'date-fallback'; Expected = 'date-only-newest'; Clock = '2020-09-01T12:00:00Z'
    Cartoons = @(
      @{ slug = 'explicit-release'; date = '2020-08-30'; publishDate = '2020-08-30T23:00:00-04:00' },
      @{ slug = 'date-only-newest'; date = '2020-08-31' }
    )
  },
  @{
    Name = 'equal-instants'; Expected = 'alpha'; Clock = '2020-09-01T12:00:00Z'
    Cartoons = @(
      @{ slug = 'zulu'; date = '2020-08-30'; publishDate = '2020-08-30T12:00:00Z' },
      @{ slug = 'alpha'; date = '2020-08-30'; publishDate = '2020-08-30T08:00:00-04:00' }
    )
  },
  @{
    Name = 'equal-instants-reversed'; Expected = 'alpha'; Clock = '2020-09-01T12:00:00Z'
    Cartoons = @(
      @{ slug = 'alpha'; date = '2020-08-30'; publishDate = '2020-08-30T08:00:00-04:00' },
      @{ slug = 'zulu'; date = '2020-08-30'; publishDate = '2020-08-30T12:00:00Z' }
    )
  },
  @{
    Name = 'future-release-hidden'; Expected = 'published'; Clock = '2020-09-01T11:59:59Z'
    Current = 'queued'
    Cartoons = @(
      @{ slug = 'published'; date = '2020-08-30' },
      @{ slug = 'queued'; date = '2020-08-31'; publishDate = '2020-09-01T12:00:00Z' },
      @{ slug = 'future-date-only'; date = '2020-09-02' }
    )
  },
  @{
    Name = 'release-boundary'; Expected = 'queued'; Clock = '2020-09-01T12:00:00Z'
    Current = 'published'
    Cartoons = @(
      @{ slug = 'published'; date = '2020-08-30' },
      @{ slug = 'queued'; date = '2020-08-31'; publishDate = '2020-09-01T12:00:00Z' }
    )
  },
  @{
    Name = 'no-published-art'; Expected = 'none'; Clock = '2020-09-01T12:00:00Z'
    Cartoons = @(@{ slug = 'queued'; date = '2020-09-02' })
  },
  @{
    Name = 'empty-gallery'; Expected = 'none'; Clock = '2020-09-01T12:00:00Z'
    Cartoons = @()
  }
)

$originalFutureSetting = [Environment]::GetEnvironmentVariable('HUGO_BUILD_FUTURE_CARTOONS')
try {
  # Test public eligibility regardless of a preview override in the caller.
  $env:HUGO_BUILD_FUTURE_CARTOONS = 'false'
  foreach ($case in $cases) {
    $data = @{ cartoons = @($case.Cartoons) }
    if ($case.ContainsKey('Current')) { $data.current = $case.Current }
    Write-Fixture 'data/editorial_cartoons.json' (ConvertTo-Json -InputObject $data -Depth 5)
    $buildOutput = & $HugoPath --source $FixtureRoot --clock $case.Clock --panicOnWarning 2>&1
    Assert-Contract ($LASTEXITCODE -eq 0) ("Current-illustration fixture '$($case.Name)' failed to build:`n" + ($buildOutput -join "`n"))
    $actual = [IO.File]::ReadAllText((Join-Path $FixtureRoot 'public/index.html')).Trim()
    Assert-Contract ($actual -ceq $case.Expected) "Current-illustration fixture '$($case.Name)' selected '$actual'; expected '$($case.Expected)'."
  }
}
finally {
  [Environment]::SetEnvironmentVariable('HUGO_BUILD_FUTURE_CARTOONS', $originalFutureSetting)
}

Write-Host "Current illustration contract passed: $($cases.Count) isolated rendered cases."
Write-Host "Fixture retained at: $FixtureRoot"
$global:LASTEXITCODE = 0
