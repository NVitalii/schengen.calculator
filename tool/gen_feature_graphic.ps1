# Generates the Play Store feature graphic (1024x500 PNG) in the style of
# the promo frames in screenshots/ (300-310): flat pastel panel, dark indigo
# headline, real device mockup cropped from frame 300.png.
#
# Renders at 2x (2048x1000) and downscales for crisp text.
#
#   powershell -File tool\gen_feature_graphic.ps1
#
# Output: screenshots\feature-graphic-1024x500.png
param(
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent),
    [string]$OutName = 'feature-graphic-1024x500.png'
)

Add-Type -AssemblyName System.Drawing

$srcFrame = Join-Path $RepoRoot 'screenshots\300.png'
$outPath  = Join-Path $RepoRoot ("screenshots\" + $OutName)

# --- 2x canvas ---------------------------------------------------------
$W = 2048; $H = 1000
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Brand palette (see marketing/screenshots/README.md in the app repo)
$bg     = [System.Drawing.ColorTranslator]::FromHtml('#E7E3F8')  # lavender
$ink    = [System.Drawing.ColorTranslator]::FromHtml('#2E2A55')  # dark indigo
$inkSub = [System.Drawing.ColorTranslator]::FromHtml('#524C7A')  # muted indigo
$accent = [System.Drawing.ColorTranslator]::FromHtml('#6750A4')  # app purple

$g.Clear($bg)

# Soft decorative circles (subtle, same hue family)
$deco1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(46, 255, 255, 255))
$deco2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, 103, 80, 164))
$g.FillEllipse($deco1, -180, 620, 700, 700)
$g.FillEllipse($deco2, 1050, -300, 620, 620)

# --- Phone mockups (tight crop + rounded clip) -------------------------
# Both frames come from the same generator, so the device sits in the same
# place: crop rect is shared.
$crop = New-Object System.Drawing.Rectangle(370, 635, 1415, 3125)

function Draw-Phone([System.Drawing.Graphics]$gr, [string]$framePath,
                    [int]$x, [int]$y, [int]$w,
                    [System.Drawing.Rectangle]$cropRect) {
    $img = [System.Drawing.Image]::FromFile($framePath)
    $h = [int]($w * $cropRect.Height / $cropRect.Width)
    $radius = [int]($w * 0.155)
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r2 = $radius * 2
    $clip.AddArc($x, $y, $r2, $r2, 180, 90)
    $clip.AddArc($x + $w - $r2, $y, $r2, $r2, 270, 90)
    $clip.AddArc($x + $w - $r2, $y + $h - $r2, $r2, $r2, 0, 90)
    $clip.AddArc($x, $y + $h - $r2, $r2, $r2, 90, 90)
    $clip.CloseFigure()
    $state = $gr.Save()
    $gr.SetClip($clip)
    $dest = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $gr.DrawImage($img, $dest, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
    $gr.Restore($state)
    $clip.Dispose(); $img.Dispose()
}

# AI frame behind-left, main tracking frame in front-right
Draw-Phone $g (Join-Path $RepoRoot 'screenshots\303.png') 1060 230 420 $crop
Draw-Phone $g $srcFrame 1400 140 480 $crop

# --- Text block --------------------------------------------------------
$fontH1  = New-Object System.Drawing.Font('Segoe UI', 76, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fontSub = New-Object System.Drawing.Font('Segoe UI Semibold', 42, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fontTag = New-Object System.Drawing.Font('Segoe UI Semibold', 34, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brushInk  = New-Object System.Drawing.SolidBrush($ink)
$brushSub  = New-Object System.Drawing.SolidBrush($inkSub)
$brushAcc  = New-Object System.Drawing.SolidBrush($accent)
$white     = [System.Drawing.Brushes]::White

$leftX = 150.0
$y = 265.0
$g.DrawString('Know exactly how', $fontH1, $brushInk, $leftX, $y);            $y += 102
$g.DrawString('many days are left', $fontH1, $brushInk, $leftX, $y);          $y += 140
$g.DrawString('Schengen 90/180, counted for you', $fontSub, $brushSub, $leftX, $y); $y += 100

# Tag pills: Free / Offline / No account
$tags = @('Free', 'Offline', 'No account')
$tx = $leftX
foreach ($t in $tags) {
    $size = $g.MeasureString($t, $fontTag)
    $pw = [int]($size.Width + 44); $ph = 62
    $pill = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pr = 31; $pr2 = $pr * 2
    $pill.AddArc($tx, $y, $pr2, $pr2, 90, 180)
    $pill.AddArc($tx + $pw - $pr2, $y, $pr2, $pr2, 270, 180)
    $pill.CloseFigure()
    $g.FillPath($brushAcc, $pill)
    $g.DrawString($t, $fontTag, $white, $tx + 22, $y + 9)
    $tx += $pw + 24
    $pill.Dispose()
}

# --- Downscale to 1024x500 and save ------------------------------------
$final = New-Object System.Drawing.Bitmap(1024, 500)
$gf = [System.Drawing.Graphics]::FromImage($final)
$gf.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gf.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gf.DrawImage($bmp, 0, 0, 1024, 500)
$final.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $gf.Dispose(); $bmp.Dispose(); $final.Dispose()
Write-Host "Saved $outPath"
