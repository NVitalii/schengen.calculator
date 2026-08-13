locals {
  domain = "schengen.live"
}

# The certificate already exists (issued for schengen.live, auto-renewing via
# the DNS validation record managed in dns.tf) — reference, don't recreate.
data "aws_acm_certificate" "site" {
  provider    = aws.us_east_1
  domain      = local.domain
  statuses    = ["ISSUED"]
  most_recent = true
}

resource "aws_s3_bucket" "site" {
  bucket = "schengen-live-landing"
}

# The bucket is fully private; only CloudFront (via OAC) can read it.
resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "schengen-live-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "site" {
  comment             = "schengen.live landing (dedicated)"
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  default_root_object = "index.html"
  # The whole audience matters: the app ships ja/zh/tr locales, so keep all
  # edge locations like the legacy distribution did.
  price_class = "PriceClass_All"

  aliases = var.cutover ? [local.domain] : []

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-site"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = data.aws_acm_certificate.site.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# GetObject lets CloudFront serve files; ListBucket turns missing keys into
# real 404s instead of 403s.
resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = ["s3:GetObject", "s3:ListBucket"]
      Resource  = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.site.arn }
      }
    }]
  })
}
