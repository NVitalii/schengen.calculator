# schengen.live — hosting & domain (Terraform)

Dedicated S3 bucket (`schengen-live-landing`, private, no versioning — content
is in git) behind a dedicated CloudFront distribution, plus the Route 53 zone,
apex records, the ACM-validation record and the registrar settings
(Route 53 Domains). Split out of the legacy shared `prod.botolab.net` bucket
so deploys here can never touch another site.

State: S3 `pdfiknet-terraform-state`, key `schengen-landing/terraform.tfstate`
(shared bucket, own key), DynamoDB lock `terraform-state-lock`.

## First run (already performed 2026-08-11)

```bash
cd infra
terraform init

# Pre-existing resources are imported, not created:
terraform import aws_route53_zone.main Z024737319PVDIGMIXL5B
terraform import aws_route53_record.apex_a Z024737319PVDIGMIXL5B_schengen.live_A
terraform import aws_route53_record.cert_validation Z024737319PVDIGMIXL5B__bd651d8ebebed1e885e84dbf644e37ae.schengen.live_CNAME
terraform import aws_route53domains_registered_domain.site schengen.live

terraform apply                 # cutover=false: builds the new stack dark
../deploy.ps1                   # content into the new bucket
# smoke-test https://<distribution_domain>/ , then:
aws cloudfront associate-alias --alias schengen.live --target-distribution-id <distribution_id>
terraform apply -var cutover=true   # aligns aliases + flips apex DNS
```

`associate-alias` moves the `schengen.live` alternate domain name off the
legacy distribution atomically — CloudFront routes by Host header across the
whole edge fleet, so this is zero-downtime and independent of DNS TTLs.

## Content deploys

`../deploy.ps1` — explicit file list + `assets/` sync + a `/*` invalidation.
Nothing else in the repo is published.

## Deliberately NOT managed here

- The legacy shared distribution `E2NVWV69VU4FB3` and bucket
  `prod.botolab.net` (they still serve botolab.net; clean out the stale
  schengen files there some day, carefully).
- The ACM certificate object itself (referenced via data source; it
  auto-renews as long as the validation CNAME managed here exists).
- Legacy zone records (`_acme-challenge` TXT) — remnants of old hosting;
  unmanaged, delete manually when confident nothing needs them. (The apex TXT
  set, which also carries the legacy `hosting-site=…` value, IS managed here
  since 2026-09-15 — see below.)

## DNS boundary: do NOT add email records here

The Route 53 zone is shared with the **email stack, which lives in another
project's Terraform state** (SES in us-east-1: inbound MX at the apex, the
`_amazonses` verification TXT, three `_domainkey` DKIM CNAMEs and the
`mail.schengen.live` MAIL FROM records that carry the SPF TXT). This state
manages only:

- apex `A`/`AAAA` -> the landing CloudFront distribution
- `api.schengen.live` `A`/`AAAA` -> the API CloudFront distribution
- the two ACM validation CNAMEs
- the apex `TXT` set (imported 2026-09-15 for the Google Search Console
  verification value; every apex TXT value must be listed inside that one
  resource, because Route 53 keys record sets by (name, type) and the set is
  written as a whole)
- the zone itself and the registrar settings

Record sets are keyed by (name, type), so those sets do not collide today —
`terraform plan` here must always report **no changes** to anything mail
related. Never add an MX record or a `_dmarc` record to this configuration,
and never add a second apex TXT resource — new apex TXT values (e.g. SPF, more
site verifications) go into the existing `apex_txt` records list. Email DNS
changes belong in the project that owns the SES stack.
