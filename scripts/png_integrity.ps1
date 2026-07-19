#requires -Version 7.0

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-OipPngIntegrityResult {
  param(
    [bool]$IsValid,
    [string]$Detail,
    [uint32]$Width = 0,
    [uint32]$Height = 0,
    [long]$Bytes = 0
  )

  return [pscustomobject]@{
    IsValid = $IsValid
    Detail = $Detail
    Width = $Width
    Height = $Height
    Bytes = $Bytes
  }
}

function Read-OipUInt32BigEndian {
  param(
    [byte[]]$Bytes,
    [int]$Offset
  )

  return [uint32](($Bytes[$Offset] * 16777216) + ($Bytes[$Offset + 1] * 65536) + ($Bytes[$Offset + 2] * 256) + $Bytes[$Offset + 3])
}

function Test-OipPngIntegrity {
  param([Parameter(Mandatory = $true)][string]$Path)

  try {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
  }
  catch {
    return New-OipPngIntegrityResult -IsValid $false -Detail "Could not read PNG: $($_.Exception.Message)"
  }

  if ($bytes.Length -lt 8) {
    return New-OipPngIntegrityResult -IsValid $false -Detail 'PNG is shorter than its signature.' -Bytes $bytes.Length
  }

  [byte[]]$signature = 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
  for ($index = 0; $index -lt $signature.Length; $index++) {
    if ($bytes[$index] -ne $signature[$index]) {
      return New-OipPngIntegrityResult -IsValid $false -Detail 'PNG signature is invalid.' -Bytes $bytes.Length
    }
  }

  [long]$offset = 8
  $header = $null
  $seenIdat = $false
  $seenIend = $false
  $idatBytes = [System.IO.MemoryStream]::new()

  try {
    while ($offset -lt $bytes.Length) {
      if (($bytes.Length - $offset) -lt 12) {
        return New-OipPngIntegrityResult -IsValid $false -Detail 'PNG has a truncated chunk header.' -Bytes $bytes.Length
      }

      [uint32]$length = Read-OipUInt32BigEndian -Bytes $bytes -Offset ([int]$offset)
      [long]$chunkEnd = $offset + 12 + [long]$length
      if ($chunkEnd -gt $bytes.Length) {
        return New-OipPngIntegrityResult -IsValid $false -Detail "PNG has a truncated chunk at byte $offset." -Bytes $bytes.Length
      }

      $chunkType = [System.Text.Encoding]::ASCII.GetString($bytes, [int]$offset + 4, 4)
      if ($chunkType -notmatch '^[A-Za-z]{4}$') {
        return New-OipPngIntegrityResult -IsValid $false -Detail "PNG has an invalid chunk type at byte $offset." -Bytes $bytes.Length
      }

      [int]$dataOffset = [int]$offset + 8
      switch ($chunkType) {
        'IHDR' {
          if ($null -ne $header -or $offset -ne 8 -or $length -ne 13) {
            return New-OipPngIntegrityResult -IsValid $false -Detail 'PNG has an invalid IHDR chunk.' -Bytes $bytes.Length
          }

          [uint32]$width = Read-OipUInt32BigEndian -Bytes $bytes -Offset $dataOffset
          [uint32]$height = Read-OipUInt32BigEndian -Bytes $bytes -Offset ($dataOffset + 4)
          if ($width -eq 0 -or $height -eq 0) {
            return New-OipPngIntegrityResult -IsValid $false -Detail 'PNG has zero image dimensions.' -Bytes $bytes.Length
          }

          $header = [pscustomobject]@{
            Width = $width
            Height = $height
            BitDepth = $bytes[$dataOffset + 8]
            ColorType = $bytes[$dataOffset + 9]
            Compression = $bytes[$dataOffset + 10]
            Filter = $bytes[$dataOffset + 11]
            Interlace = $bytes[$dataOffset + 12]
          }

          if ($header.Compression -ne 0 -or $header.Filter -ne 0 -or $header.Interlace -notin @(0, 1)) {
            return New-OipPngIntegrityResult -IsValid $false -Detail 'PNG uses unsupported compression, filter, or interlace metadata.' -Bytes $bytes.Length
          }
        }
        'IDAT' {
          if ($null -eq $header) {
            return New-OipPngIntegrityResult -IsValid $false -Detail 'PNG has IDAT data before IHDR.' -Bytes $bytes.Length
          }

          $idatBytes.Write($bytes, $dataOffset, [int]$length)
          $seenIdat = $true
        }
        'IEND' {
          if ($length -ne 0 -or -not $seenIdat -or $chunkEnd -ne $bytes.Length) {
            return New-OipPngIntegrityResult -IsValid $false -Detail 'PNG has an invalid or non-terminal IEND chunk.' -Bytes $bytes.Length
          }

          $seenIend = $true
          break
        }
      }

      if ($seenIend) {
        break
      }

      $offset = $chunkEnd
    }

    if ($null -eq $header -or -not $seenIdat -or -not $seenIend) {
      return New-OipPngIntegrityResult -IsValid $false -Detail 'PNG is missing IHDR, IDAT, or terminal IEND data.' -Bytes $bytes.Length
    }

    $idatBytes.Position = 0
    [long]$decodedBytes = 0
    $zlib = $null
    try {
      $zlib = [System.IO.Compression.ZLibStream]::new($idatBytes, [System.IO.Compression.CompressionMode]::Decompress, $true)
      [byte[]]$buffer = New-Object byte[] 65536
      while (($read = $zlib.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $decodedBytes += $read
      }
    }
    catch {
      return New-OipPngIntegrityResult -IsValid $false -Detail "PNG IDAT data does not decompress: $($_.Exception.Message)" -Bytes $bytes.Length
    }
    finally {
      if ($null -ne $zlib) {
        $zlib.Dispose()
      }
    }

    if ($header.Interlace -eq 0) {
      $channels = @{ 0 = 1; 2 = 3; 3 = 1; 4 = 2; 6 = 4 }
      if (-not $channels.ContainsKey([int]$header.ColorType)) {
        return New-OipPngIntegrityResult -IsValid $false -Detail "PNG has unsupported color type $($header.ColorType)." -Bytes $bytes.Length
      }

      [double]$bitsPerRow = [double]$header.Width * [double]$channels[[int]$header.ColorType] * [double]$header.BitDepth
      [long]$bytesPerRow = [long][math]::Ceiling($bitsPerRow / 8.0)
      [long]$expectedDecodedBytes = ([long]$header.Height) * ($bytesPerRow + 1)
      if ($decodedBytes -ne $expectedDecodedBytes) {
        return New-OipPngIntegrityResult -IsValid $false -Detail "PNG decompressed to $decodedBytes bytes; expected $expectedDecodedBytes." -Width $header.Width -Height $header.Height -Bytes $bytes.Length
      }
    }

    return New-OipPngIntegrityResult -IsValid $true -Detail 'PNG structure and compressed image data are valid.' -Width $header.Width -Height $header.Height -Bytes $bytes.Length
  }
  finally {
    $idatBytes.Dispose()
  }
}
