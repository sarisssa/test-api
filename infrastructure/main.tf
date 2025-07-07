# main.tf

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  #Make this dynamic based on the environment
  backend "s3" {
    bucket         = "wage-terraform-state-prd-us-west-1"
    key            = "terraform.tfstate"
    region         = "us-west-1"
    dynamodb_table = "wage-terraform-state-lock-prd"
    encrypt        = "true"
    acl            = "private"
  }

  required_version = ">= 1.0.0"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy   = "Terraform"
      Environment = var.environment
      Project     = var.project_name
    }
  }
}

locals {
  app_secrets = {
    database_url = {
      description = "Database connection URL"
      service_tag = "Database"
    },
    provider_url = {
      description = "Third-party provider service URL"
      service_tag = "ExternalProvider"
    }
  }
}

