Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Assert-Match {
  param(
    [string]$Value,
    [string]$Pattern,
    [string]$Message
  )

  if ($Value -notmatch $Pattern) {
    throw $Message
  }
}

  $repoRoot = Split-Path -Parent $PSScriptRoot
  $wrapperPath = Join-Path $repoRoot 'tools\bin\custom\new-essay.cmd'
  $scriptPath = Join-Path $repoRoot 'scripts\new_essay.ps1'
  $pwshWrapperPath = Join-Path $repoRoot 'tools\bin\generated\pwsh.cmd'
  $guardrailPath = Join-Path $repoRoot 'scripts\check_essay_guardrails.ps1'
  $auditPath = Join-Path $repoRoot 'scripts\audit_legacy_essays.ps1'
$tempRoot = Join-Path $repoRoot ('.tmp-new-essay-' + [guid]::NewGuid().ToString('N'))

try {
  New-Item -Path (Join-Path $tempRoot 'content\essays') -ItemType Directory -Force | Out-Null
  New-Item -Path (Join-Path $tempRoot 'scripts') -ItemType Directory -Force | Out-Null
  Copy-Item -LiteralPath $guardrailPath -Destination (Join-Path $tempRoot 'scripts\check_essay_guardrails.ps1')
  Copy-Item -LiteralPath $auditPath -Destination (Join-Path $tempRoot 'scripts\audit_legacy_essays.ps1')

  $titleOnlyCommand = ('"{0}" --title "Signal Garden" --root "{1}"' -f $wrapperPath, $tempRoot)
  $titleOnlyOutput = & cmd /d /c $titleOnlyCommand 2>&1 | Out-String
  $titleOnlyExit = $LASTEXITCODE
  Assert-True ($titleOnlyExit -eq 0) 'Expected wrapper title-only scaffold to succeed.'

  $today = Get-Date -Format 'yyyy-MM-dd'
  $titleOnlyPath = Join-Path $tempRoot 'content\essays\signal-garden.md'
  Assert-True (Test-Path -LiteralPath $titleOnlyPath -PathType Leaf) 'Expected title-only scaffold to create the derived slug path.'

  $titleOnlyContent = (Get-Content -LiteralPath $titleOnlyPath -Raw) -replace "`r", ''
  Assert-Match -Value $titleOnlyContent -Pattern "(?m)^title: 'Signal Garden'$" -Message 'Expected scaffold to preserve the provided title.'
  Assert-Match -Value $titleOnlyContent -Pattern ("(?m)^date: {0}$" -f [regex]::Escape($today)) -Message 'Expected title-only scaffold to default to today''s date.'
  Assert-Match -Value $titleOnlyContent -Pattern "(?m)^draft: true$" -Message 'Expected scaffolded essays to start as drafts.'
  Assert-Match -Value $titleOnlyContent -Pattern "(?m)^slug: 'signal-garden'$" -Message 'Expected scaffold to derive a slug from the title.'
  Assert-Match -Value $titleOnlyContent -Pattern "(?m)^description: ''$" -Message 'Expected scaffold to emit an explicit empty description field.'
  Assert-Match -Value $titleOnlyContent -Pattern "(?m)^collections: \[\]$" -Message 'Expected scaffold to include empty collections metadata.'
  Assert-Match -Value $titleOnlyContent -Pattern '(?s)## Lead.*## Main Argument.*## Evidence.*## Why It Matters' -Message 'Expected scaffold to include the editorial starter structure.'
  Assert-Match -Value $titleOnlyOutput -Pattern 'check_essay_guardrails\.ps1 -Paths \.\\content\\essays\\signal-garden\.md' -Message 'Expected scaffold output to point at the target-file guardrail command.'

  $customOutput = & $pwshWrapperPath -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scriptPath --title 'Authoring by Hand' --slug 'custom-slug' --date '2026-04-12' --subtitle 'A better starting point' --description 'Short deck for a new essay.' --root $tempRoot 2>&1 | Out-String
  $customExit = $LASTEXITCODE
  Assert-True ($customExit -eq 0) 'Expected direct script invocation with custom overrides to succeed.'

  $customPath = Join-Path $tempRoot 'content\essays\custom-slug.md'
  Assert-True (Test-Path -LiteralPath $customPath -PathType Leaf) 'Expected custom slug override to control the output path.'

  $customContent = (Get-Content -LiteralPath $customPath -Raw) -replace "`r", ''
  Assert-Match -Value $customContent -Pattern "(?m)^date: 2026-04-12$" -Message 'Expected scaffold to honor an explicit date override.'
  Assert-Match -Value $customContent -Pattern "(?m)^subtitle: 'A better starting point'$" -Message 'Expected scaffold to honor an explicit subtitle override.'
  Assert-Match -Value $customContent -Pattern "(?m)^description: 'Short deck for a new essay\.'$" -Message 'Expected scaffold to honor an explicit description override.'
  Assert-Match -Value $customContent -Pattern "(?m)^slug: 'custom-slug'$" -Message 'Expected scaffold to honor an explicit slug override.'
  Assert-Match -Value $customOutput -Pattern 'Created essay draft:' -Message 'Expected scaffold to report the created file path.'

  $collisionOutput = & $pwshWrapperPath -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scriptPath --title 'Signal Garden' --root $tempRoot 2>&1 | Out-String
  $collisionExit = $LASTEXITCODE
  Assert-True ($collisionExit -ne 0) 'Expected scaffold to fail when the target file already exists.'
  Assert-Match -Value $collisionOutput -Pattern 'Essay already exists:' -Message 'Expected collision failure to explain why no file was written.'

  $guardrailOutput = & $pwshWrapperPath -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tempRoot 'scripts\check_essay_guardrails.ps1') -Root $tempRoot -Paths 'content/essays/signal-garden.md' 2>&1 | Out-String
  $guardrailExit = $LASTEXITCODE
  Assert-True ($guardrailExit -eq 0) 'Expected a freshly scaffolded draft to pass the essay guardrails.'
  Assert-Match -Value $guardrailOutput -Pattern 'Essay guardrails PASSED\.' -Message 'Expected a freshly scaffolded draft to pass the guardrails.'

  $archetypeContent = (Get-Content -LiteralPath (Join-Path $repoRoot 'archetypes\essays.md') -Raw) -replace "`r", ''
  Assert-Match -Value $archetypeContent -Pattern '(?m)^slug: "\{\{ \.Name \}\}"$' -Message 'Expected the essay archetype fallback to emit an explicit slug.'
  Assert-Match -Value $archetypeContent -Pattern '(?m)^description: ""$' -Message 'Expected the essay archetype fallback to emit an explicit description field.'
  Assert-Match -Value $archetypeContent -Pattern '(?s)## Lead.*## Main Argument.*## Evidence.*## Why It Matters' -Message 'Expected the essay archetype fallback to mirror the starter structure.'
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host 'New essay scaffold tests passed.'
$global:LASTEXITCODE = 0
exit 0
