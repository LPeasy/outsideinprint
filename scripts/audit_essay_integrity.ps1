param(
  [string]$EssayRoot = "./content/essays",
  [string]$ReportPath = "./reports/essay-integrity-audit.json",
  [int]$SampleSize = 32,
  [int]$SampleSeed = 42
)

$ErrorActionPreference = "Stop"

$essays = Get-ChildItem -Path $EssayRoot -File -Filter "*.md" | Where-Object { $_.Name -ne "_index.md" }

$badPatterns = @(
  ([string][char]0x00E2)+([string][char]0x20AC)+([string][char]0x2122),
  ([string][char]0x00E2)+([string][char]0x20AC)+([string][char]0x0153),
  ([string][char]0x00E2)+([string][char]0x20AC)+([string][char]0x009D),
  ([string][char]0x00C2)+([string][char]0x00A0),
  ([string][char]0x00C3)+([string][char]0x00A2),
  ([string][char]0x00C3)+([string][char]0x201A),
  ([string][char]0x00F0)+([string][char]0x0178)
)

$rows = @()
foreach ($f in $essays) {
  $text = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($f.FullName))
  $moji = 0
  foreach ($p in $badPatterns) {
    $moji += ([regex]::Matches($text, [regex]::Escape($p))).Count
  }
  $moji += 3 * ([regex]::Matches($text, [regex]::Escape([string][char]0xFFFD))).Count

  $captionGlue = ([regex]::Matches($text, '!\[[^\]]*\]\([^\)]+\)(Source:|Made by|Image:)')).Count
  $dateMatch = [regex]::Match($text, '(?m)^date:\s*(\d{4}-\d{2}-\d{2})\s*$')
  $date = if ($dateMatch.Success) { $dateMatch.Groups[1].Value } else { "" }
  $wordCount = (($text -replace '(?s)^---.*?---\s*', '') -split '\s+' | Where-Object { $_ -match '\w' }).Count

  $rows += [pscustomobject]@{
    file = $f.Name
    date = $date
    words = $wordCount
    mojibake_score = $moji
    caption_glue = $captionGlue
  }
}

$summary = [pscustomobject]@{
  essays = $rows.Count
  essays_with_mojibake = (@($rows | Where-Object { $_.mojibake_score -gt 0 })).Count
  essays_with_caption_glue = (@($rows | Where-Object { $_.caption_glue -gt 0 })).Count
  total_mojibake_score = ($rows | Measure-Object mojibake_score -Sum).Sum
  total_caption_glue = ($rows | Measure-Object caption_glue -Sum).Sum
}

# Stratified sample by date quartile for representative review.
$sorted = $rows | Sort-Object date, file
$n = $sorted.Count
$q = [Math]::Max(1, [Math]::Floor($n / 4))
for ($i = 0; $i -lt $sorted.Count; $i++) {
  $sorted[$i] | Add-Member -NotePropertyName quartile -NotePropertyValue ([Math]::Min(4, [Math]::Floor($i / $q) + 1)) -Force
}

$rand = New-Object System.Random($SampleSeed)
$sample = @()
foreach ($group in ($sorted | Group-Object quartile)) {
  $arr = @($group.Group)
  for ($i = 0; $i -lt $arr.Count; $i++) {
    $j = $rand.Next($i, $arr.Count)
    $tmp = $arr[$i]; $arr[$i] = $arr[$j]; $arr[$j] = $tmp
  }
  $take = [Math]::Min([Math]::Max(1, [Math]::Floor($SampleSize / 4)), $arr.Count)
  $sample += $arr | Select-Object -First $take
}

$sampleSummary = [pscustomobject]@{
  sample_size = $sample.Count
  quartiles_covered = (@($sample | Group-Object quartile)).Count
  sample_with_mojibake = (@($sample | Where-Object { $_.mojibake_score -gt 0 })).Count
  sample_with_caption_glue = (@($sample | Where-Object { $_.caption_glue -gt 0 })).Count
}

$report = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  summary = $summary
  sample_summary = $sampleSummary
  rows = $rows
  sample = $sample
}

$reportDir = Split-Path -Path $ReportPath -Parent
if ($reportDir) { New-Item -Path $reportDir -ItemType Directory -Force | Out-Null }
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $ReportPath -Encoding UTF8

Write-Host "Essay integrity audit complete" -ForegroundColor Cyan
Write-Host ("Essays: {0}" -f $summary.essays)
Write-Host ("Mojibake hits: {0}" -f $summary.essays_with_mojibake)
Write-Host ("Caption glue hits: {0}" -f $summary.essays_with_caption_glue)
Write-Host ("Sample size: {0}" -f $sampleSummary.sample_size)
Write-Host "Report: $ReportPath"
