# Generates Play Store feature graphic variants (1024x500 PNG) in the style
# of the promo frames in screenshots/ (300-310): flat pastel panel, bold
# headline, two real device mockups cropped from the frames.
#
# Renders at 2x (2048x1000) and downscales for crisp text.
#
#   powershell -File tool\gen_feature_graphic.ps1
#
# Output: screenshots\feature-graphic-1024x500.png (v1)
#         screenshots\feature-graphic-v2..v6.png
param(
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent)
)

Add-Type -AssemblyName System.Drawing

$shots = Join-Path $RepoRoot 'screenshots'

# Captions come from the approved long set in the app repo's
# marketing/screenshots/README.md — do not invent new claims here.
$variants = @(
    # Final candidates: full-frame device mockups (screenshots/mockup-*.png,
    # transparent corners, never cropped), two approved caption options.
    @{ Out='feature-graphic-1024x500.png'; Bg='#E7E3F8'; Ink='#2E2A55'; Sub='#524C7A'; Accent='#6750A4'
       H1='Track your Schengen days'; H2='with the 90/180 rule'; H1Size=70
       SubLine='Now with an AI travel assistant'
       Pills=@('Free','Offline','No account'); Front='mockup-tracker.png'; Back='mockup-ai.png'; Raw=$true }
    @{ Out='feature-graphic-1024x500-b.png'; Bg='#E7E3F8'; Ink='#2E2A55'; Sub='#524C7A'; Accent='#6750A4'
       H1='Always know how many'; H2='Schengen days remain'
       SubLine='Now with an AI travel assistant'
       Pills=@('Free','Offline','No account'); Front='mockup-tracker.png'; Back='mockup-ai.png'; Raw=$true }
    @{ Out='feature-graphic-v2.png'; Bg='#DDF3E4'; Ink='#1E4634'; Sub='#3A6B54'; Accent='#2E7D5B'
       H1='Track the'; H2='whole family'; SubLine='Up to five profiles free'
       Pills=@('Free','Offline','No account'); Front='302.png'; Back='300.png' }
    @{ Out='feature-graphic-v3.png'; Bg='#E3ECF9'; Ink='#1F3050'; Sub='#465B80'; Accent='#3563A8'
       H1='The AI assistant'; H2='plans your trip'; SubLine='It already knows your days left'
       Pills=@('7 / 14 / 30 days','No subscription'); Front='303.png'; Back='308.png' }
    @{ Out='feature-graphic-v4.png'; Bg='#F8F0E3'; Ink='#4A3A1E'; Sub='#6E5B3A'; Accent='#8A6A2F'
       H1='Will this'; H2='trip fit?'; SubLine='Check the dates before you book'
       Pills=@('Free','Offline'); Front='304.png'; Back='306.png' }
    @{ Out='feature-graphic-v5.png'; Bg='#FDE7EF'; Ink='#521F35'; Sub='#7A4560'; Accent='#B04A72'
       H1='One profile,'; H2='the whole family'; SubLine='Live sharing with Premium'
       Pills=@('Premium'); Front='305.png'; Back='310.png' }
    @{ Out='feature-graphic-v6.png'; Bg='#2E2A55'; Ink='#F0EDFC'; Sub='#C9C2E8'; Accent='#7A64C0'
       H1='Your visa days'; H2='in dark mode'; SubLine='Colours warn before you overstay'
       Pills=@('Free','Offline','No account'); Front='307.png'; Back='300.png'; Dark=$true }
)

# Shared device crop inside every promo frame (same generator, same spot).
$crop = New-Object System.Drawing.Rectangle(370, 635, 1415, 3125)

function Draw-Phone([System.Drawing.Graphics]$gr, [string]$framePath,
                    [int]$x, [int]$y, [int]$w,
                    $cropRect) {
    $img = [System.Drawing.Image]::FromFile($framePath)
    if ($null -eq $cropRect) {
        # Full mockup with its own bezel and transparent corners — draw as
        # is, never crop the source.
        $h = [int]($w * $img.Height / $img.Width)
        $dest = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
        $gr.DrawImage($img, $dest)
        $img.Dispose()
        return
    }
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

foreach ($v in $variants) {
    $W = 2048; $H = 1000
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $bg     = [System.Drawing.ColorTranslator]::FromHtml($v.Bg)
    $ink    = [System.Drawing.ColorTranslator]::FromHtml($v.Ink)
    $inkSub = [System.Drawing.ColorTranslator]::FromHtml($v.Sub)
    $accent = [System.Drawing.ColorTranslator]::FromHtml($v.Accent)
    $g.Clear($bg)

    if ($v.Dark) {
        $deco1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, 255, 255, 255))
        $deco2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(34, 167, 139, 250))
    } else {
        $deco1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(46, 255, 255, 255))
        $deco2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, 0, 0, 0))
    }
    $g.FillEllipse($deco1, -180, 620, 700, 700)
    $g.FillEllipse($deco2, 1050, -300, 620, 620)

    $useCrop = if ($v.Raw) { $null } else { $crop }
    Draw-Phone $g (Join-Path $shots $v.Back)  1090 230 420 $useCrop
    Draw-Phone $g (Join-Path $shots $v.Front) 1420 140 480 $useCrop

    $h1px = if ($v.H1Size) { $v.H1Size } else { 76 }
    $fontH1  = New-Object System.Drawing.Font('Segoe UI', $h1px, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fontSub = New-Object System.Drawing.Font('Segoe UI Semibold', 42, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $fontTag = New-Object System.Drawing.Font('Segoe UI Semibold', 34, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $brushInk = New-Object System.Drawing.SolidBrush($ink)
    $brushSub = New-Object System.Drawing.SolidBrush($inkSub)
    $brushAcc = New-Object System.Drawing.SolidBrush($accent)
    $white    = [System.Drawing.Brushes]::White

    $leftX = 150.0
    $y = 265.0
    $g.DrawString($v.H1, $fontH1, $brushInk, $leftX, $y); $y += 102
    $g.DrawString($v.H2, $fontH1, $brushInk, $leftX, $y); $y += 140
    $g.DrawString($v.SubLine, $fontSub, $brushSub, $leftX, $y); $y += 100

    $tx = $leftX
    foreach ($t in $v.Pills) {
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

    $final = New-Object System.Drawing.Bitmap(1024, 500)
    $gf = [System.Drawing.Graphics]::FromImage($final)
    $gf.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gf.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gf.DrawImage($bmp, 0, 0, 1024, 500)
    $outPath = Join-Path $shots $v.Out
    $final.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $gf.Dispose(); $bmp.Dispose(); $final.Dispose()
    Write-Host "Saved $outPath"
}
