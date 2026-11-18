# Deploys the schengen.live landing to its dedicated S3 bucket and invalidates
# CloudFront. Publishes ONLY the explicit list below — repo internals (src/,
# screenshots/, infra/, .git) can never leak to the site by construction.
#
#   .\deploy.ps1
#
# Requires: terraform state in infra/ (for outputs), aws CLI with credentials.
#
# index.html, schengen-calculator.html, the language folders and sitemap.xml
# are BUILT files (src/pages + src/i18n -> `bash tool/build.sh`). This script
# does not build them; it refuses to publish pages that differ from what the
# generator would write now.
$ErrorActionPreference = 'Stop'

$repo   = $PSScriptRoot

# The languages and pages come from the same file the generator reads.
$site = Get-Content "$repo\src\site.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$built = @('sitemap.xml')
foreach ($lang in $site.languages) {
  foreach ($page in $site.pages) {
    if ($lang.dir) { $built += "$($lang.dir)\$($page.file)" } else { $built += $page.file }
  }
}
foreach ($f in $built) {
  if (-not (Test-Path "$repo\$f")) { throw "missing $f - build the pages first: bash tool/build.sh" }
}
# Current = what the generator would write today, byte for byte. Comparing
# contents (not file times) also catches a change to the generator itself or
# to a template. The check runs in the same throwaway container as the build.
# Git's own bash, not whatever "bash" is first on PATH (System32\bash.exe is WSL).
# git.exe sits in Git\cmd or Git\mingw64\bin; bash.exe in Git\bin.
$gitExe = (Get-Command git -ErrorAction Stop).Source
$gitBash = $null
$dir = Split-Path $gitExe -Parent
while ($dir -and -not $gitBash) {
  if (Test-Path (Join-Path $dir 'bin\bash.exe')) { $gitBash = Join-Path $dir 'bin\bash.exe' }
  $dir = Split-Path $dir -Parent
}
if (-not $gitBash) { throw "Git Bash not found above $gitExe" }
# The check reports on stderr; under 'Stop' Windows PowerShell 5.1 turns any
# stderr line of a native program into a terminating error, so the exit code
# alone decides here.
Push-Location $repo
$savedPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  & $gitBash tool/build.sh --check 2>&1 | ForEach-Object { "$_" }
  $checkExit = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $savedPreference
  Pop-Location
}
if ($checkExit -ne 0) { throw "the built pages are not current - rebuild them first: bash tool/build.sh" }

$bucket = terraform -chdir="$repo\infra" output -raw bucket
if ($LASTEXITCODE -ne 0) { throw "terraform output failed - is infra/ initialized?" }
$dist = terraform -chdir="$repo\infra" output -raw distribution_id
if ($LASTEXITCODE -ne 0) { throw "terraform output failed" }

# Pages built with folder addresses (/de/) link to them; without the
# CloudFront function those addresses are 404. Publish only once it exists.
if ($site.directoryIndex) {
  $state = terraform -chdir="$repo\infra" state list
  if ($LASTEXITCODE -ne 0) { throw "terraform state list failed" }
  if ($state -notcontains 'aws_cloudfront_function.pretty_urls') {
    throw "the pages use /de/ addresses, but the CloudFront function is not applied yet - terraform apply in infra/ first"
  }
}

$rootFiles = @(
  'index.html', 'privacy.html', 'terms.html', 'schengen-calculator.html',
  'llms.txt', 'robots.txt', 'sitemap.xml', 'favicon.png'
)
foreach ($f in $rootFiles) {
  aws s3 cp "$repo\$f" "s3://$bucket/$f"
  if ($LASTEXITCODE -ne 0) { throw "upload failed: $f" }
}

# The other languages: one folder each, the same pages inside. Still an
# explicit list - nothing else from those folders is published.
foreach ($lang in $site.languages) {
  if (-not $lang.dir) { continue } # English is the root, uploaded above
  foreach ($page in $site.pages) {
    $key = "$($lang.dir)/$($page.file)"
    aws s3 cp "$repo\$($lang.dir)\$($page.file)" "s3://$bucket/$key"
    if ($LASTEXITCODE -ne 0) { throw "upload failed: $key" }
  }
}

# Explicit charset: the file contains Ukrainian text and browsers do not
# assume UTF-8 for bare text/plain.
aws s3 cp "$repo\privacy-policy\privacy.txt" "s3://$bucket/privacy-policy/privacy.txt" --content-type "text/plain; charset=utf-8"
if ($LASTEXITCODE -ne 0) { throw "upload failed: privacy.txt" }

# Android App Links verification - must stay application/json.
aws s3 cp "$repo\.well-known\assetlinks.json" "s3://$bucket/.well-known/assetlinks.json" --content-type "application/json"
if ($LASTEXITCODE -ne 0) { throw "upload failed: assetlinks.json" }

# --delete is safe: the bucket serves only this site (that was the point of
# splitting it out of prod.botolab.net).
aws s3 sync "$repo\assets" "s3://$bucket/assets" --delete
if ($LASTEXITCODE -ne 0) { throw "assets sync failed" }

# Browsers refuse caption tracks served with the wrong MIME type, and the CLI's
# guess for .vtt is not reliable - re-upload with an explicit one.
aws s3 cp "$repo\assets\tutorial_en.vtt" "s3://$bucket/assets/tutorial_en.vtt" --content-type "text/vtt"
if ($LASTEXITCODE -ne 0) { throw "upload failed: tutorial_en.vtt" }

$inv = aws cloudfront create-invalidation --distribution-id $dist --paths "/*" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "invalidation failed" }
"Deployed to s3://$bucket, invalidation $($inv.Invalidation.Id) running."
