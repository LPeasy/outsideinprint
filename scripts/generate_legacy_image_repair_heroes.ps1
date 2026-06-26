#requires -Version 7.0
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$items = @(
  @{ Slug = 'american-household-debt'; Kind = 'finance'; A = '#1f6f78'; B = '#d9a441' },
  @{ Slug = 'charlie-kirk-how-a-campus-activist-learned-to-command-the-national-conversation'; Kind = 'portrait'; A = '#4d5968'; B = '#b78958' },
  @{ Slug = 'cpi-report-economic-analysis'; Kind = 'chart'; A = '#4a6f98'; B = '#c05746' },
  @{ Slug = 'dick-cheney-how-a-master-of-government-turned-the-vice-presidency-into-a-power-center'; Kind = 'portrait'; A = '#3f4750'; B = '#9b7a55' },
  @{ Slug = 'etfs-and-market-concentration'; Kind = 'market'; A = '#2f5961'; B = '#a9b388' },
  @{ Slug = 'federalism-in-modern-american-society'; Kind = 'civic'; A = '#315c70'; B = '#b9a268' },
  @{ Slug = 'gene-hackman-how-a-reluctant-star-became-the-actor-everyone-believed'; Kind = 'portrait'; A = '#5f5147'; B = '#b4a078' },
  @{ Slug = 'george-foreman-how-a-heavyweight-champion-turned-reinvention-into-his-greatest-skill'; Kind = 'portrait'; A = '#4f5f55'; B = '#b2784a' },
  @{ Slug = 'household-and-individual-wealth-in-america'; Kind = 'household'; A = '#766153'; B = '#6f8a70' },
  @{ Slug = 'its-tough-to-weigh-short-term-costs-against-what-people-perceive-as-low-probability-events'; Kind = 'risk'; A = '#44546a'; B = '#d08b5b' },
  @{ Slug = 'labor-force-participation-trends-in-modern-american-society'; Kind = 'labor'; A = '#3f6658'; B = '#b06b52' },
  @{ Slug = 'natural-asset-companies'; Kind = 'nature'; A = '#436b55'; B = '#b89a54' },
  @{ Slug = 'ozzy-osbourne-how-heavy-metals-most-unruly-star-became-a-cultural-fixture'; Kind = 'portrait'; A = '#41424c'; B = '#8f6d77' },
  @{ Slug = 'pope-francis-how-a-plainspoken-pope-reframed-moral-authority'; Kind = 'portrait'; A = '#59665c'; B = '#c3b489' },
  @{ Slug = 'presidential-elections'; Kind = 'ballot'; A = '#3b5368'; B = '#b85750' },
  @{ Slug = 'rational-ignorance-in-the-u-s-presidential-electorate'; Kind = 'ballot'; A = '#4f5965'; B = '#c5a15a' },
  @{ Slug = 'rethinking-coastal-retreat'; Kind = 'coast'; A = '#426c78'; B = '#c0a978' },
  @{ Slug = 'the-cracked-pot'; Kind = 'vessel'; A = '#6d5c4f'; B = '#b87c5d' },
  @{ Slug = 'the-ledger-vol-2'; Kind = 'ledger'; A = '#394f5c'; B = '#bc9b66' },
  @{ Slug = 'the-ledger-vol-3'; Kind = 'ledger'; A = '#3e4c63'; B = '#9d7654' }
)

function New-Color([string]$Hex, [int]$Alpha = 255) {
  $value = $Hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb($Alpha, [Convert]::ToInt32($value.Substring(0, 2), 16), [Convert]::ToInt32($value.Substring(2, 2), 16), [Convert]::ToInt32($value.Substring(4, 2), 16))
}

function New-Brush([string]$Hex, [int]$Alpha = 255) {
  return [System.Drawing.SolidBrush]::new((New-Color $Hex $Alpha))
}

function New-Pen([string]$Hex, [single]$Width = 2, [int]$Alpha = 255) {
  return [System.Drawing.Pen]::new((New-Color $Hex $Alpha), $Width)
}

function Fill-RoundedRect($Graphics, $Brush, [System.Drawing.RectangleF]$Rect, [single]$Radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

function Draw-Grid($Graphics) {
  $pen = New-Pen '#f6efe2' 1 34
  for ($x = 80; $x -lt 1600; $x += 80) { $Graphics.DrawLine($pen, $x, 0, $x, 900) }
  for ($y = 80; $y -lt 900; $y += 80) { $Graphics.DrawLine($pen, 0, $y, 1600, $y) }
  $pen.Dispose()
}

function Draw-PaperStack($Graphics, [single]$X, [single]$Y, [single]$W, [single]$H, [string]$Accent) {
  $shadow = New-Brush '#1b1b1b' 34
  $paper = New-Brush '#f3ead8' 245
  $line = New-Pen '#594c3d' 2 95
  for ($i = 4; $i -ge 0; $i--) {
    Fill-RoundedRect $Graphics $shadow ([System.Drawing.RectangleF]::new($X + ($i * 18) + 12, $Y + ($i * 12) + 16, $W, $H)) 12
    Fill-RoundedRect $Graphics $paper ([System.Drawing.RectangleF]::new($X + ($i * 18), $Y + ($i * 12), $W, $H)) 12
  }
  for ($r = 0; $r -lt 7; $r++) { $Graphics.DrawLine($line, $X + 70, $Y + 70 + ($r * 48), $X + $W - 80, $Y + 70 + ($r * 48)) }
  $bar = New-Brush $Accent 150
  $Graphics.FillRectangle($bar, $X + 70, $Y + 80, 150, 250)
  $shadow.Dispose(); $paper.Dispose(); $line.Dispose(); $bar.Dispose()
}

function Draw-Bars($Graphics, [single]$X, [single]$Y, [string]$Accent) {
  $brush = New-Brush $Accent 165
  $base = New-Pen '#2e2923' 4 120
  $Graphics.DrawLine($base, $X, $Y + 320, $X + 600, $Y + 320)
  $heights = @(210, 150, 255, 180, 295, 225, 270)
  for ($i = 0; $i -lt $heights.Count; $i++) {
    $height = $heights[$i]
    Fill-RoundedRect $Graphics $brush ([System.Drawing.RectangleF]::new($X + 35 + ($i * 80), $Y + 320 - $height, 48, $height)) 8
  }
  $brush.Dispose(); $base.Dispose()
}

function Draw-Ballot($Graphics, [string]$Accent) {
  $paper = New-Brush '#f3ead8' 245
  $mark = New-Pen $Accent 8 200
  Fill-RoundedRect $Graphics $paper ([System.Drawing.RectangleF]::new(560, 230, 440, 500)) 16
  for ($i = 0; $i -lt 5; $i++) {
    $y = 310 + ($i * 72)
    $boxPen = New-Pen '#5a5148' 2 90
    $linePen = New-Pen '#5a5148' 2 65
    $Graphics.DrawRectangle($boxPen, 620, $y, 36, 36)
    $Graphics.DrawLine($linePen, 690, $y + 10, 930, $y + 10)
    $boxPen.Dispose(); $linePen.Dispose()
  }
  $Graphics.DrawLine($mark, 625, 392, 640, 412)
  $Graphics.DrawLine($mark, 640, 412, 675, 365)
  $paper.Dispose(); $mark.Dispose()
}

function Draw-Portrait($Graphics, [string]$Accent) {
  $body = New-Brush '#1f2528' 150
  $face = New-Brush '#e1d2b2' 230
  $line = New-Pen $Accent 4 160
  $Graphics.FillEllipse($face, 700, 205, 200, 230)
  Fill-RoundedRect $Graphics $body ([System.Drawing.RectangleF]::new(620, 460, 360, 280)) 120
  $Graphics.DrawArc($line, 660, 175, 280, 300, 205, 130)
  $Graphics.DrawLine($line, 520, 760, 1080, 760)
  $body.Dispose(); $face.Dispose(); $line.Dispose()
}

function Draw-Motif($Graphics, [string]$Kind, [string]$Accent) {
  switch ($Kind) {
    'finance' { Draw-PaperStack $Graphics 455 220 520 420 $Accent; Draw-Bars $Graphics 885 315 $Accent }
    'chart' { Draw-PaperStack $Graphics 390 250 500 385 $Accent; Draw-Bars $Graphics 820 300 $Accent }
    'market' {
      Draw-Bars $Graphics 440 300 $Accent
      $pen = New-Pen $Accent 7 190
      $Graphics.DrawLines($pen, [System.Drawing.PointF[]]@(
          [System.Drawing.PointF]::new(430, 545), [System.Drawing.PointF]::new(560, 470),
          [System.Drawing.PointF]::new(680, 500), [System.Drawing.PointF]::new(820, 390),
          [System.Drawing.PointF]::new(980, 430), [System.Drawing.PointF]::new(1120, 320)
        ))
      $pen.Dispose()
    }
    'civic' {
      $brush = New-Brush '#f1eadb' 210
      $roof = New-Pen $Accent 8 180
      for ($i = 0; $i -lt 5; $i++) { $Graphics.FillRectangle($brush, 560 + ($i * 90), 360, 42, 330) }
      $Graphics.DrawLine($roof, 500, 350, 800, 220); $Graphics.DrawLine($roof, 800, 220, 1100, 350); $Graphics.DrawLine($roof, 500, 710, 1100, 710)
      $brush.Dispose(); $roof.Dispose()
    }
    'household' {
      $pen = New-Pen '#f2eadc' 7 210
      $brush = New-Brush $Accent 145
      $window = New-Brush '#efe3c8' 180
      $Graphics.DrawLine($pen, 520, 560, 800, 340); $Graphics.DrawLine($pen, 800, 340, 1080, 560)
      Fill-RoundedRect $Graphics $brush ([System.Drawing.RectangleF]::new(590, 560, 420, 190)) 10
      $Graphics.FillRectangle($window, 650, 610, 90, 70); $Graphics.FillRectangle($window, 860, 610, 90, 70)
      $pen.Dispose(); $brush.Dispose(); $window.Dispose()
    }
    'risk' {
      $pen = New-Pen $Accent 8 190
      $Graphics.DrawEllipse($pen, 555, 210, 490, 490)
      $Graphics.DrawLine($pen, 800, 300, 800, 520); $Graphics.DrawLine($pen, 800, 565, 800, 615)
      Draw-PaperStack $Graphics 300 390 380 260 $Accent
      $pen.Dispose()
    }
    'labor' {
      Draw-Bars $Graphics 430 330 $Accent
      $brush = New-Brush '#f1eadb' 185
      for ($i = 0; $i -lt 6; $i++) {
        $x = 910 + ($i * 65)
        $y = 360 + (($i % 2) * 28)
        $Graphics.FillEllipse($brush, $x, $y, 46, 46)
        Fill-RoundedRect $Graphics $brush ([System.Drawing.RectangleF]::new($x - 10, $y + 60, 66, 110)) 24
      }
      $brush.Dispose()
    }
    'nature' {
      $stem = New-Pen '#f1eadb' 7 200
      $leaf = New-Brush $Accent 170
      for ($i = 0; $i -lt 6; $i++) {
        $x = 520 + ($i * 90)
        $y = 330 + (($i % 3) * 55)
        $Graphics.DrawLine($stem, $x, 690, $x + 50, $y)
        $Graphics.FillEllipse($leaf, $x + 15, $y, 135, 70)
      }
      Draw-PaperStack $Graphics 820 365 360 260 $Accent
      $stem.Dispose(); $leaf.Dispose()
    }
    'ballot' { Draw-Ballot $Graphics $Accent }
    'coast' {
      $water = New-Brush '#d8eceb' 170
      $sand = New-Brush $Accent 150
      $pen = New-Pen '#f1eadb' 5 170
      $Graphics.FillRectangle($water, 0, 0, 1600, 620)
      $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
      $path.AddBezier(0, 620, 360, 540, 480, 720, 820, 640)
      $path.AddBezier(820, 640, 1040, 590, 1240, 650, 1600, 570)
      $path.AddLine(1600, 900, 0, 900); $path.CloseFigure()
      $Graphics.FillPath($sand, $path)
      for ($y = 180; $y -lt 560; $y += 75) { $Graphics.DrawBezier($pen, 80, $y, 420, $y + 40, 680, $y - 45, 1040, $y + 15) }
      $water.Dispose(); $sand.Dispose(); $pen.Dispose(); $path.Dispose()
    }
    'vessel' {
      $pot = New-Brush $Accent 170
      $line = New-Pen '#f1eadb' 6 190
      Fill-RoundedRect $Graphics $pot ([System.Drawing.RectangleF]::new(610, 370, 380, 300)) 70
      $Graphics.DrawLine($line, 700, 375, 760, 470); $Graphics.DrawLine($line, 760, 470, 720, 560)
      $Graphics.DrawLine($line, 850, 390, 810, 510); $Graphics.DrawLine($line, 810, 510, 900, 650)
      $pot.Dispose(); $line.Dispose()
    }
    'ledger' {
      Draw-PaperStack $Graphics 480 225 560 430 $Accent
      $pen = New-Pen $Accent 5 190
      $Graphics.DrawLine($pen, 610, 305, 610, 610); $Graphics.DrawLine($pen, 800, 305, 800, 610); $Graphics.DrawLine($pen, 990, 305, 990, 610)
      $pen.Dispose()
    }
    'portrait' { Draw-Portrait $Graphics $Accent }
  }
}

foreach ($item in $items) {
  $dir = Join-Path $Root (Join-Path 'static/images/essays' $item.Slug)
  New-Item -Path $dir -ItemType Directory -Force | Out-Null

  $bitmap = [System.Drawing.Bitmap]::new(1600, 900)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $rect = [System.Drawing.Rectangle]::new(0, 0, 1600, 900)
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (New-Color '#f4ead8'), (New-Color $item.A), 18)
  $graphics.FillRectangle($gradient, $rect)
  Draw-Grid $graphics

  $veil = New-Brush '#111111' 22
  $graphics.FillRectangle($veil, 0, 0, 1600, 900)
  Draw-Motif $graphics $item.Kind $item.B

  $border = New-Pen '#f3ead8' 3 120
  $graphics.DrawRectangle($border, 38, 38, 1524, 824)

  $outPath = Join-Path $dir 'hero.png'
  $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $border.Dispose(); $veil.Dispose(); $gradient.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  Write-Host "Wrote $outPath"
}
