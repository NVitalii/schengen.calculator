output "bucket" {
  value = aws_s3_bucket.site.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "distribution_domain" {
  description = "Pre-cutover test URL: https://<this value>/"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "zone_id" {
  value = aws_route53_zone.main.zone_id
}
