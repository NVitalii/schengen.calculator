# The zone and the registrar registration both already exist — they are
# IMPORTED, not created (see infra/README.md for the exact commands).

resource "aws_route53_zone" "main" {
  name = local.domain
}

# Apex A/AAAA -> CloudFront. Until cutover they keep pointing at the legacy
# shared distribution so applying this config changes nothing user-visible.
locals {
  legacy_distribution_domain = "d2p19rx7oscisk.cloudfront.net"
  # CloudFront's fixed alias hosted zone id (global, same for every
  # distribution).
  cloudfront_zone_id = "Z2FDTNDATAQYW2"
  apex_alias_target  = var.cutover ? aws_cloudfront_distribution.site.domain_name : local.legacy_distribution_domain
}

resource "aws_route53_record" "apex_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.domain
  type    = "A"

  alias {
    name                   = local.apex_alias_target
    zone_id                = local.cloudfront_zone_id
    evaluate_target_health = false
  }
}

# There is deliberately no AAAA record today; add it only at cutover so the
# pre-cutover apply leaves live serving byte-for-byte untouched.
resource "aws_route53_record" "apex_aaaa" {
  count = var.cutover ? 1 : 0

  zone_id = aws_route53_zone.main.zone_id
  name    = local.domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = local.cloudfront_zone_id
    evaluate_target_health = false
  }
}

# ACM DNS-validation record for the schengen.live certificate. ACM re-checks
# it on every auto-renewal — deleting it would let the cert lapse.
resource "aws_route53_record" "cert_validation" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_bd651d8ebebed1e885e84dbf644e37ae.${local.domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["_96c1909dbf00470f535ac4856a41afac.jkddzztszm.acm-validations.aws."]
}

# Registrar-level settings (Route 53 Domains). Deleting this resource does
# not unregister the domain; it only stops managing these flags.
resource "aws_route53domains_registered_domain" "site" {
  provider = aws.us_east_1

  domain_name   = local.domain
  auto_renew    = true
  transfer_lock = true
}
