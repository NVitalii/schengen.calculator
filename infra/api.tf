# api.schengen.live — the app's own front door to its backend HTTP
# endpoints (today: the aiImage place-photo endpoint). Shipped app builds
# and the URLs stored in chat history carry THIS host, so the backend can
# later move off Google by re-pointing the origin here — no app update,
# nothing already shipped breaks.

locals {
  api_domain = "api.${local.domain}"
  # Gen2 Cloud Functions keep a deterministic per-project host (the
  # run.app URL carries a random hash). Keep in step with FUNCTIONS_REGION
  # and the project id in the app repo's functions/index.js.
  api_origin = "europe-west1-schengen-90-180.cloudfunctions.net"
}

resource "aws_acm_certificate" "api" {
  provider          = aws.us_east_1
  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# ACM re-checks the validation record on every auto-renewal — it must stay.
resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 300
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "api" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

# An API front, not a CDN: responses are per-user (Bearer token), so edge
# caching stays off — the phones disk-cache the images themselves.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards every viewer header EXCEPT Host: Google's front end routes by
# Host and must keep seeing the origin's own name. Authorization passes
# through because caching is disabled.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "api" {
  comment         = "api.schengen.live -> app backend (currently Cloud Functions)"
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  # Same audience as the landing (ja/zh/tr users included).
  price_class = "PriceClass_All"

  aliases = [local.api_domain]

  origin {
    domain_name = local.api_origin
    origin_id   = "backend"

    custom_origin_config {
      https_port             = 443
      http_port              = 80
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    # All methods: aiImage is GET today, but this is the app's general API
    # door — a future endpoint must not need an infra change.
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "backend"
    viewer_protocol_policy   = "https-only"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.api.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_route53_record" "api_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.api.domain_name
    zone_id                = local.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_aaaa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.api_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.api.domain_name
    zone_id                = local.cloudfront_zone_id
    evaluate_target_health = false
  }
}
