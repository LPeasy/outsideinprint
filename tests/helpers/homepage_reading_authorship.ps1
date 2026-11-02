function Get-JsonLdReadingWork {
  param([object[]]$Nodes)
  foreach ($type in @('Article', 'CreativeWork', 'ShortStory')) {
    foreach ($node in $Nodes) {
      if (@($node.'@type') -contains $type) { return $node }
    }
  }
  return $null
}

function Test-JsonLdBobReadingWork {
  param([object[]]$Nodes)
  $work = Get-JsonLdReadingWork -Nodes $Nodes
  if ($null -eq $work -or -not $work.PSObject.Properties['author']) { return $false }
  $authors = @($work.author | Where-Object { $null -ne $_ })
  return $authors.Count -gt 0 -and @($authors | Where-Object {
    -not $_.PSObject.Properties['@id'] -or
    (-not ([string]$_.'@id').EndsWith('#author-robert-v-ussley', [StringComparison]::Ordinal) -and
     -not ([string]$_.'@id').EndsWith('#author-robert-v.-ussley', [StringComparison]::Ordinal))
  }).Count -eq 0
}
