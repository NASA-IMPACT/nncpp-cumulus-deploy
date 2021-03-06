terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 3.14.1"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 2.1"
    }
    archive = {
      source = "hashicorp/archive"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  ignore_tags {
    key_prefixes = ["gsfc-ngap"]
  }
}

locals {
  tags                            = merge(var.tags, { Deployment = var.prefix })
  elasticsearch_alarms            = lookup(data.terraform_remote_state.data_persistence.outputs, "elasticsearch_alarms", [])
  elasticsearch_domain_arn        = lookup(data.terraform_remote_state.data_persistence.outputs, "elasticsearch_domain_arn", null)
  elasticsearch_hostname          = lookup(data.terraform_remote_state.data_persistence.outputs, "elasticsearch_hostname", null)
  elasticsearch_security_group_id = lookup(data.terraform_remote_state.data_persistence.outputs, "elasticsearch_security_group_id", "")
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "terraform_remote_state" "data_persistence" {
  backend   = "s3"
  config    = var.data_persistence_remote_state_config
  workspace = terraform.workspace
}

module "cumulus" {
  source = "https://github.com/nasa/cumulus/releases/download/v8.1.2/terraform-aws-cumulus.zip//tf-modules/cumulus"

  cumulus_message_adapter_lambda_layer_version_arn = var.cumulus_message_adapter_lambda_layer_version_arn

  prefix = var.prefix

  # DO NOT CHANGE THIS VARIABLE UNLESS DEPLOYING OUTSIDE NGAP
  deploy_to_ngap = false

  vpc_id            = var.vpc_id
  lambda_subnet_ids = var.lambda_subnet_ids

  ecs_cluster_instance_image_id   = var.ecs_cluster_instance_image_id
  ecs_cluster_instance_subnet_ids = length(var.ecs_cluster_instance_subnet_ids) == 0 ? var.lambda_subnet_ids : var.ecs_cluster_instance_subnet_ids
  ecs_cluster_min_size            = 1
  ecs_cluster_desired_size        = 1
  ecs_cluster_max_size            = 2
  key_name                        = var.key_name

  urs_url             = var.urs_url
  urs_client_id       = var.urs_client_id
  urs_client_password = var.urs_client_password

  ems_host              = var.ems_host
  ems_port              = var.ems_port
  ems_path              = var.ems_path
  ems_datasource        = var.ems_datasource
  ems_private_key       = var.ems_private_key
  ems_provider          = var.ems_provider
  ems_retention_in_days = var.ems_retention_in_days
  ems_submit_report     = var.ems_submit_report
  ems_username          = var.ems_username

  metrics_es_host     = var.metrics_es_host
  metrics_es_password = var.metrics_es_password
  metrics_es_username = var.metrics_es_username

  cmr_client_id   = var.cmr_client_id
  cmr_environment = var.cmr_environment
  cmr_username    = var.cmr_username
  cmr_password    = var.cmr_password
  cmr_provider    = var.cmr_provider
  cmr_custom_host = var.cmr_custom_host

  cmr_oauth_provider = var.cmr_oauth_provider

  launchpad_api         = var.launchpad_api
  launchpad_certificate = var.launchpad_certificate
  launchpad_passphrase  = var.launchpad_passphrase

  oauth_provider   = var.oauth_provider
  oauth_user_group = var.oauth_user_group

  saml_entity_id                  = var.saml_entity_id
  saml_assertion_consumer_service = var.saml_assertion_consumer_service
  saml_idp_login                  = var.saml_idp_login
  saml_launchpad_metadata_url     = var.saml_launchpad_metadata_url

  permissions_boundary_arn = var.permissions_boundary_arn

  system_bucket = var.system_bucket
  buckets       = var.buckets

  elasticsearch_alarms            = local.elasticsearch_alarms
  elasticsearch_domain_arn        = local.elasticsearch_domain_arn
  elasticsearch_hostname          = local.elasticsearch_hostname
  elasticsearch_security_group_id = local.elasticsearch_security_group_id

  dynamo_tables = data.terraform_remote_state.data_persistence.outputs.dynamo_tables

  # Archive API settings
  token_secret                = var.token_secret
  archive_api_users           = var.api_users
  archive_api_port            = var.archive_api_port
  private_archive_api_gateway = var.private_archive_api_gateway
  api_gateway_stage           = var.api_gateway_stage

  # Thin Egress App settings
  # must match stage_name variable for thin-egress-app module
  tea_api_gateway_stage = local.tea_stage_name

  tea_rest_api_id               = module.thin_egress_app.rest_api.id
  tea_rest_api_root_resource_id = module.thin_egress_app.rest_api.root_resource_id
  tea_internal_api_endpoint     = module.thin_egress_app.internal_api_endpoint
  tea_external_api_endpoint     = module.thin_egress_app.api_endpoint

  log_destination_arn          = var.log_destination_arn
  additional_log_groups_to_elk = var.additional_log_groups_to_elk

  deploy_distribution_s3_credentials_endpoint = var.deploy_distribution_s3_credentials_endpoint

  ems_deploy = var.ems_deploy

  tags = local.tags

  throttled_queues = [{
    url = aws_sqs_queue.background_job_queue.id,
    execution_limit = 15
  }]

}


data "aws_iam_policy_document" "api_gateway_access_es" {
  statement {
    actions = [
      "es:*"
    ]
    resources = [
      local.elasticsearch_domain_arn
    ]
  }
}
resource "aws_iam_role_policy" "api_gateway_es_policy" {
  name   = "${var.prefix}-api-gateway-access-es"
  role   = "${var.prefix}-lambda-api-gateway"
  policy = data.aws_iam_policy_document.api_gateway_access_es.json
}
