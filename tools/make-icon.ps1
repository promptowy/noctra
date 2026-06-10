# Renders the Noctra crescent icon as PNGs (multiple sizes) using System.Drawing.
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\assets"
New-Item -ItemType Directory -Force $outDir | Out-Null

foreach ($size in 16, 32, 48, 64, 128, 256) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $s = $size / 256.0

    # Rounded dark background
    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = 56 * $s
    $w = $size
    $bgPath.AddArc(0, 0, 2*$r, 2*$r, 180, 90)
    $bgPath.AddArc($w - 2*$r, 0, 2*$r, 2*$r, 270, 90)
    $bgPath.AddArc($w - 2*$r, $w - 2*$r, 2*$r, 2*$r, 0, 90)
    $bgPath.AddArc(0, $w - 2*$r, 2*$r, 2*$r, 90, 90)
    $bgPath.CloseFigure()
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 12, 15, 12))
    $g.FillPath($bgBrush, $bgPath)

    # Crescent: gradient disc minus offset dark disc
    $discRect = New-Object System.Drawing.Rectangle([int](40*$s), [int](40*$s), [int](176*$s), [int](176*$s))
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $discRect,
        [System.Drawing.Color]::FromArgb(255, 52, 210, 75),
        [System.Drawing.Color]::FromArgb(255, 30, 140, 50),
        45.0)
    $g.FillEllipse($grad, $discRect)
    $g.FillEllipse($bgBrush, [int](90*$s), [int](20*$s), [int](176*$s), [int](176*$s))

    $bmp.Save((Join-Path $outDir "noctra-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}
Write-Output "PNGs written to $outDir"
