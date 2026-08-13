# Deploys the schengen.live landing to its dedicated S3 bucket and invalidates
# CloudFront. Publishes ONLY the explicit list below — repo internals (src/,
# screenshots/, infra/, .git) can never leak to the site by construction.
#
#   .\deploy.ps1
#
# Requires: terraform state in infra/ (for outputs), aws CLI with credentials.
$ErrorActionPreference = 'Stop'

$repo   = $PSScriptRoot
$bucket = terraform -chdir="$repo\infra" output -raw bucket
if ($LASTEXITCODE -ne 0) { throw "terraform output failed - is infra/ initialized?" }
$dist = terraform -chdir="$repo\infra" output -raw distribution_id
if ($LASTEXITCODE -ne 0) { throw "terraform output failed" }

$rootFiles = @(
  'index.html', 'privacy.html', 'terms.html', 'schengen-calculator.html',
  'llms.txt', 'robots.txt', 'sitemap.xml', 'favicon.png'
)
foreach ($f in $rootFiles) {
  aws s3 cp "$repo\$f" "s3://$bucket/$f"
  if ($LASTEXITCODE -ne 0) { throw "upload failed: $f" }
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

$inv = aws cloudfront create-invalidation --distribution-id $dist --paths "/*" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "invalidation failed" }
"Deployed to s3://$bucket, invalidation $($inv.Invalidation.Id) running."
