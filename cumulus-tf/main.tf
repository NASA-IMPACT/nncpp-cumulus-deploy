module "cumulus" {
  source = "https://github.com/nasa/cumulus/releases/download/v1.16.0/terraform-aws-cumulus.zip//tf-modules/cumulus"

  cumulus_message_adapter_lambda_layer_arn = var.cumulus_message_adapter_lambda_layer_arn

  archive_api_port            = var.archive_api_port
  private_archive_api_gateway = var.private_archive_api_gateway
  api_gateway_stage = var.api_gateway_stage

  prefix = var.prefix
  region = var.region

  vpc_id            = var.vpc_id
  lambda_subnet_ids = var.subnet_ids

  ecs_cluster_instance_subnet_ids = var.subnet_ids
  ecs_cluster_min_size            = 1
  ecs_cluster_desired_size        = 1
  ecs_cluster_max_size            = 2
  key_name                        = var.key_name

  urs_url             = "https://uat.urs.earthdata.nasa.gov"
  urs_client_id       = var.urs_client_id
  urs_client_password = var.urs_client_password

  cmr_client_id   = var.cmr_client_id
  cmr_environment = "UAT"
  cmr_username    = var.cmr_username
  cmr_password    = var.cmr_password
  cmr_provider    = var.cmr_provider

  permissions_boundary_arn = var.permissions_boundary_arn

  system_bucket = var.system_bucket
  buckets       = var.buckets

  elasticsearch_alarms            = data.terraform_remote_state.data_persistence.outputs.elasticsearch_alarms
  elasticsearch_domain_arn        = data.terraform_remote_state.data_persistence.outputs.elasticsearch_domain_arn
  elasticsearch_hostname          = data.terraform_remote_state.data_persistence.outputs.elasticsearch_hostname
  elasticsearch_security_group_id = data.terraform_remote_state.data_persistence.outputs.elasticsearch_security_group_id

  dynamo_tables = data.terraform_remote_state.data_persistence.outputs.dynamo_tables

  token_secret = var.token_secret

  archive_api_users = var.api_users

  distribution_url = var.distribution_url

  sts_credentials_lambda_function_arn = data.aws_lambda_function.sts_credentials.arn
  archive_api_port = var.archive_api_port
  private_archive_api_gateway = var.private_archive_api_gateway
}

locals {
  default_tags = {
    Deployment = var.prefix
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "terraform_remote_state" "data_persistence" {
  backend = "s3"
  config  = var.data_persistence_remote_state_config
}

data "aws_lambda_function" "sts_credentials" {
  function_name = "gsfc-ngap-sh-s3-sts-get-keys"
}


resource "aws_security_group" "no_ingress_all_egress" {
  name   = "${var.prefix}-cumulus-tf-no-ingress-all-egress"
  vpc_id = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.default_tags
}
