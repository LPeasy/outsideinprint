#requires -Version 7.0

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-OipImageManifest {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing responsive-image manifest: $Path"
  }

  try {
    return Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json -Depth 100
  }
  catch {
    throw "Responsive-image manifest is not valid JSON: $($_.Exception.Message)"
  }
}

function Get-OipPropertyNames {
  param([AllowNull()][object]$Value)

  if ($null -eq $Value) {
    return @()
  }

  if ($Value -is [System.Collections.IDictionary]) {
    return @($Value.Keys)
  }

  return @($Value.PSObject.Properties.Name)
}

function Get-OipSha256 {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-OipUInt16BigEndian {
  param(
    [Parameter(Mandatory)]
    [byte[]]$Bytes,
    [Parameter(Mandatory)]
    [int]$Offset
  )

  return ([int]$Bytes[$Offset] -shl 8) -bor [int]$Bytes[$Offset + 1]
}

function Get-OipUInt32BigEndian {
  param(
    [Parameter(Mandatory)]
    [byte[]]$Bytes,
    [Parameter(Mandatory)]
    [int]$Offset
  )

  return ([uint32]$Bytes[$Offset] -shl 24) -bor
    ([uint32]$Bytes[$Offset + 1] -shl 16) -bor
    ([uint32]$Bytes[$Offset + 2] -shl 8) -bor
    [uint32]$Bytes[$Offset + 3]
}

function Test-OipBytesEqual {
  param(
    [Parameter(Mandatory)]
    [byte[]]$Bytes,
    [Parameter(Mandatory)]
    [int]$Offset,
    [Parameter(Mandatory)]
    [byte[]]$Expected
  )

  if ($Offset -lt 0 -or $Offset + $Expected.Length -gt $Bytes.Length) {
    return $false
  }

  for ($index = 0; $index -lt $Expected.Length; $index++) {
    if ($Bytes[$Offset + $index] -ne $Expected[$index]) {
      return $false
    }
  }

  return $true
}

function Test-OipImageSignature {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  switch ($extension) {
    '.png' {
      return Test-OipBytesEqual -Bytes $bytes -Offset 0 -Expected ([byte[]](0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))
    }
    '.jpg' {
      return $bytes.Length -ge 3 -and $bytes[0] -eq 0xff -and $bytes[1] -eq 0xd8 -and $bytes[2] -eq 0xff
    }
    '.jpeg' {
      return $bytes.Length -ge 3 -and $bytes[0] -eq 0xff -and $bytes[1] -eq 0xd8 -and $bytes[2] -eq 0xff
    }
    '.webp' {
      return (Test-OipBytesEqual -Bytes $bytes -Offset 0 -Expected ([System.Text.Encoding]::ASCII.GetBytes('RIFF'))) -and
        (Test-OipBytesEqual -Bytes $bytes -Offset 8 -Expected ([System.Text.Encoding]::ASCII.GetBytes('WEBP')))
    }
    '.avif' {
      if ($bytes.Length -lt 16 -or -not (Test-OipBytesEqual -Bytes $bytes -Offset 4 -Expected ([System.Text.Encoding]::ASCII.GetBytes('ftyp')))) {
        return $false
      }
      $brandText = [System.Text.Encoding]::ASCII.GetString($bytes, 8, [Math]::Min(56, $bytes.Length - 8))
      return $brandText.Contains('avif', [System.StringComparison]::Ordinal) -or
        $brandText.Contains('avis', [System.StringComparison]::Ordinal)
    }
    default {
      return $false
    }
  }
}

function Get-OipImageDimensions {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()

  if ($extension -eq '.png') {
    if (-not (Test-OipImageSignature -Path $Path) -or $bytes.Length -lt 24) {
      throw "Invalid PNG while reading dimensions: $Path"
    }
    return [pscustomobject]@{
      Width = [int](Get-OipUInt32BigEndian -Bytes $bytes -Offset 16)
      Height = [int](Get-OipUInt32BigEndian -Bytes $bytes -Offset 20)
    }
  }

  if ($extension -in @('.jpg', '.jpeg')) {
    if (-not (Test-OipImageSignature -Path $Path)) {
      throw "Invalid JPEG while reading dimensions: $Path"
    }
    $offset = 2
    $startOfFrameMarkers = @(0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf)
    while ($offset + 8 -lt $bytes.Length) {
      if ($bytes[$offset] -ne 0xff) {
        $offset++
        continue
      }
      while ($offset -lt $bytes.Length -and $bytes[$offset] -eq 0xff) {
        $offset++
      }
      if ($offset -ge $bytes.Length) {
        break
      }
      $marker = [int]$bytes[$offset]
      $offset++
      if ($marker -eq 0xd9 -or $marker -eq 0xda) {
        break
      }
      if ($marker -eq 0x01 -or ($marker -ge 0xd0 -and $marker -le 0xd7)) {
        continue
      }
      if ($offset + 1 -ge $bytes.Length) {
        break
      }
      $segmentLength = Get-OipUInt16BigEndian -Bytes $bytes -Offset $offset
      if ($segmentLength -lt 2 -or $offset + $segmentLength -gt $bytes.Length) {
        break
      }
      if ($startOfFrameMarkers -contains $marker) {
        return [pscustomobject]@{
          Width = Get-OipUInt16BigEndian -Bytes $bytes -Offset ($offset + 5)
          Height = Get-OipUInt16BigEndian -Bytes $bytes -Offset ($offset + 3)
        }
      }
      $offset += $segmentLength
    }
    throw "JPEG has no readable start-of-frame dimensions: $Path"
  }

  if ($extension -eq '.webp') {
    if (-not (Test-OipImageSignature -Path $Path)) {
      throw "Invalid WebP while reading dimensions: $Path"
    }
    $offset = 12
    while ($offset + 8 -le $bytes.Length) {
      $chunkType = [System.Text.Encoding]::ASCII.GetString($bytes, $offset, 4)
      $chunkLength = [int]$bytes[$offset + 4] -bor ([int]$bytes[$offset + 5] -shl 8) -bor
        ([int]$bytes[$offset + 6] -shl 16) -bor ([int]$bytes[$offset + 7] -shl 24)
      $dataOffset = $offset + 8
      if ($chunkLength -lt 0 -or $dataOffset + $chunkLength -gt $bytes.Length) {
        break
      }
      if ($chunkType -eq 'VP8X' -and $chunkLength -ge 10) {
        $width = 1 + [int]$bytes[$dataOffset + 4] + ([int]$bytes[$dataOffset + 5] -shl 8) + ([int]$bytes[$dataOffset + 6] -shl 16)
        $height = 1 + [int]$bytes[$dataOffset + 7] + ([int]$bytes[$dataOffset + 8] -shl 8) + ([int]$bytes[$dataOffset + 9] -shl 16)
        return [pscustomobject]@{ Width = $width; Height = $height }
      }
      if ($chunkType -eq 'VP8 ' -and $chunkLength -ge 10 -and
        $bytes[$dataOffset + 3] -eq 0x9d -and $bytes[$dataOffset + 4] -eq 0x01 -and $bytes[$dataOffset + 5] -eq 0x2a) {
        $width = (([int]$bytes[$dataOffset + 6]) -bor ([int]$bytes[$dataOffset + 7] -shl 8)) -band 0x3fff
        $height = (([int]$bytes[$dataOffset + 8]) -bor ([int]$bytes[$dataOffset + 9] -shl 8)) -band 0x3fff
        return [pscustomobject]@{ Width = $width; Height = $height }
      }
      if ($chunkType -eq 'VP8L' -and $chunkLength -ge 5 -and $bytes[$dataOffset] -eq 0x2f) {
        $b1 = [int]$bytes[$dataOffset + 1]
        $b2 = [int]$bytes[$dataOffset + 2]
        $b3 = [int]$bytes[$dataOffset + 3]
        $b4 = [int]$bytes[$dataOffset + 4]
        $width = 1 + $b1 + (($b2 -band 0x3f) -shl 8)
        $height = 1 + ($b2 -shr 6) + ($b3 -shl 2) + (($b4 -band 0x0f) -shl 10)
        return [pscustomobject]@{ Width = $width; Height = $height }
      }
      $offset = $dataOffset + $chunkLength + ($chunkLength % 2)
    }
    throw "WebP has no readable dimensions: $Path"
  }

  if ($extension -eq '.avif') {
    if (-not (Test-OipImageSignature -Path $Path)) {
      throw "Invalid AVIF while reading dimensions: $Path"
    }
    $ispe = [System.Text.Encoding]::ASCII.GetBytes('ispe')
    for ($offset = 4; $offset + 16 -le $bytes.Length; $offset++) {
      if (Test-OipBytesEqual -Bytes $bytes -Offset $offset -Expected $ispe) {
        $width = [int](Get-OipUInt32BigEndian -Bytes $bytes -Offset ($offset + 8))
        $height = [int](Get-OipUInt32BigEndian -Bytes $bytes -Offset ($offset + 12))
        if ($width -gt 0 -and $height -gt 0) {
          return [pscustomobject]@{ Width = $width; Height = $height }
        }
      }
    }
    throw "AVIF has no readable ispe dimensions: $Path"
  }

  throw "Unsupported image format for dimensions: $Path"
}
