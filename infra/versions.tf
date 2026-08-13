# Infrastructure for the schengen.live landing: a dedicated S3 bucket behind
# its own CloudFront distribution, plus the Route 53 zone and registrar
# settings. Split out of the legacy shared prod.botolab.net bucket so a deploy
# here can never touch another site (and `aws s3 sync --delete` is safe).
#
# State lives next to the pdfik project's state, under its own key:
#   terraform init   # backend config is complete below, no flags needed
terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket         = "pdfiknet-terraform-state"
    key            = "schengen-landing/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = "eu-west-2"
}

# CloudFront only accepts ACM certificates from us-east-1, and the
# Route 53 Domains (registrar) API lives there too.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
