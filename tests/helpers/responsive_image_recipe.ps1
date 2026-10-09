#requires -Version 7.0

# Independent inventory of legal public derivatives. Assets not rendered on a
# route may contribute no files; no asset may emit a variant outside this set.
function Get-OipAllowedDerivativePaths {
  param([Parameter(Mandatory)][object]$Manifest)

  $paths = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $defaults = $Manifest.defaults
  $renderCap = [int]$defaults.max_render_width
  $socialCap = [int]$defaults.social_max_width
  if ($renderCap -le 0 -or $renderCap -gt 1600 -or $socialCap -le 0 -or $socialCap -gt 1200) {
    throw 'Invalid responsive-image width caps.'
  }
  foreach ($id in @(Get-OipPropertyNames -Value $Manifest.assets)) {
    $asset = $Manifest.assets.$id
    if ([string]$asset.review_state -cne 'approved' -or
        [string]$asset.processing_state -cne 'derivative_capable') { continue }
    $sourceWidth = [int]$asset.width
    if ($sourceWidth -le 0 -or [string]$asset.sha256 -cnotmatch '^[0-9a-f]{64}$') {
      throw "Invalid derivative source identity: $id"
    }
    $terminal = [Math]::Min($sourceWidth, $renderCap)
    $widths = [System.Collections.Generic.HashSet[int]]::new()
    foreach ($candidate in @($defaults.widths)) {
      $width = [int]$candidate
      if ($width -le 0) { throw 'Responsive widths must be positive.' }
      if ($width -le $terminal) { [void]$widths.Add($width) }
    }
    [void]$widths.Add($terminal)
    $prefix = 'images/rendered/{0}/{1}' -f $id, ([string]$asset.sha256).Substring(0, 12)
    foreach ($width in $widths) {
      foreach ($format in @('avif', 'webp')) {
        [void]$paths.Add(('{0}/{1}w.{2}' -f $prefix, $width, $format))
      }
    }
    [void]$paths.Add(('{0}/social-{1}w.jpg' -f $prefix, [Math]::Min($sourceWidth, $socialCap)))
  }
  return ,$paths
}
