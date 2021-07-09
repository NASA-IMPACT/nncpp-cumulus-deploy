data "external" "cmr_build" {
  working_dir = "${path.module}/lambdas/cmr"
  program     = ["bash", "-c", "yarn tf:prepare-package >&2 && echo {}"]
}

data "archive_file" "cmr" {
  type        = "zip"
  source_dir  = "${data.external.cmr_build.working_dir}/target/cmr"
  output_path = "${data.external.cmr_build.working_dir}/target/cmr.zip"
}

resource "aws_lambda_function" "discover_granules" {
  function_name = "${var.prefix}-DiscoverGranulesDispatcher"
  filename      = data.archive_file.cmr.output_path
  role          = module.cumulus.lambda_processing_role_arn
  handler       = "index.dispatchDiscoverGranulesHandler"
  runtime       = "nodejs12.x"
  timeout       = 900
  memory_size   = 2048

  source_code_hash = data.archive_file.cmr.output_base64sha256
  layers           = [var.cumulus_message_adapter_lambda_layer_version_arn]

  tags = local.tags

  dynamic "vpc_config" {
    for_each = length(var.lambda_subnet_ids) == 0 ? [] : [1]
    content {
      subnet_ids         = var.lambda_subnet_ids
      security_group_ids = [aws_security_group.sample_egress_only.id]
    }
  }

  environment {
    variables = {
      CMR_HOST                    = var.cmr_custom_host
      CMR_ECHO_TOKEN              = var.cmr_echo_token
      CUMULUS_MESSAGE_ADAPTER_DIR = "/opt/"
      CMR_DRY_RUN                 = var.cmr_dry_run
      CMR_PROVIDER                = var.cmr_provider
    }
  }
}

module "discover_granules_workflow" {
  source = "https://github.com/nasa/cumulus/releases/download/v8.1.0/terraform-aws-cumulus-workflow.zip"

  prefix          = var.prefix
  name            = "DiscoverAndQueueGranulesWorkflow"
  workflow_config = module.cumulus.workflow_config
  system_bucket   = var.system_bucket
  tags            = local.tags

  state_machine_definition = templatefile(
    "${path.module}/discover_and_queue_granules.asl.json",
    {
      discover_granules_task_arn: aws_lambda_function.discover_granules.arn,
      queue_granules_task_arn: module.cumulus.queue_granules_task.task_arn,
      start_sf_queue_url: module.cumulus.start_sf_queue_url
    }
  )
}

resource "aws_security_group" "sample_egress_only" {
  name   = "${var.prefix}-sample-egress-only"
  vpc_id = var.vpc_id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_lambda_function" "publish_granule" {
  function_name = "${var.prefix}-publishGranule"
  filename      = data.archive_file.cmr.output_path
  role          = module.cumulus.lambda_processing_role_arn
  handler       = "index.publishGranuleHandler"
  runtime       = "nodejs12.x"
  timeout       = 900
  memory_size   = 2048

  source_code_hash = data.archive_file.cmr.output_base64sha256
  layers           = [var.cumulus_message_adapter_lambda_layer_version_arn]

  tags = local.tags

  dynamic "vpc_config" {
    for_each = length(var.lambda_subnet_ids) == 0 ? [] : [1]
    content {
      subnet_ids         = var.lambda_subnet_ids
      security_group_ids = [aws_security_group.sample_egress_only.id]
    }
  }

  environment {
    variables = {
      CMR_HOST                    = var.cmr_custom_host
      CMR_ECHO_TOKEN              = var.cmr_echo_token
      CUMULUS_MESSAGE_ADAPTER_DIR = "/opt/"
      CMR_DRY_RUN                 = var.cmr_dry_run
      CMR_PROVIDER                = var.cmr_provider
    }
  }
}

module "publish_granule_workflow" {
  source = "https://github.com/nasa/cumulus/releases/download/v8.1.0/terraform-aws-cumulus-workflow.zip"

  prefix          = var.prefix
  name            = "PublishGranuleWorkflow"
  workflow_config = module.cumulus.workflow_config
  system_bucket   = var.system_bucket
  tags            = local.tags

  state_machine_definition = templatefile(
    "${path.module}/publish_granule.asl.json",
    {
      publish_granule_task_arn: aws_lambda_function.publish_granule.arn,
      sync_granule_task_arn: module.cumulus.sync_granule_task.task_arn,
    }
  )
}