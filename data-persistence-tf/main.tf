terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 3.14.1"
    }
  }
}

provider "aws" {
  region = var.aws_region

  ignore_tags {
    key_prefixes = ["gsfc-ngap"]
  }
}

module "data_persistence" {
  source = "https://github.com/nasa/cumulus/releases/download/v8.1.2/terraform-aws-cumulus.zip//tf-modules/data-persistence"

  prefix                         = var.prefix
  subnet_ids                     = var.subnet_ids
  include_elasticsearch          = var.include_elasticsearch
  
  tags = merge(var.tags, { Deployment = var.prefix })
}
