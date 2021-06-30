{%- set camelCaseFunctionName = cookiecutter.camelCaseFunctionName -%}
{%- set camelCaseFunctionNameHead = camelCaseFunctionName | first -%}
{%- set camelCaseFunctionNameHeadUpper = camelCaseFunctionNameHead | upper -%}
{%- set TitleCaseFunctionName = camelCaseFunctionName | replace(camelCaseFunctionNameHead, camelCaseFunctionNameHeadUpper, count=1) -%}
{%- set snake_case_function_name = cookiecutter.snake_case_function_name | lower -%}
data "external" "{{ snake_case_function_name }}" {
  working_dir = "${path.module}/lambdas/{{ camelCaseFunctionName }}"
  program     = ["yarn", "-s", "tf:prepare-package"]
}

data "archive_file" "{{ snake_case_function_name }}" {
  type        = "zip"
  source_dir  = "${data.external.{{ snake_case_function_name }}.working_dir}/${data.external.{{ snake_case_function_name }}.result.dest}"
  output_path = "${data.external.{{ snake_case_function_name }}.working_dir}/${data.external.{{ snake_case_function_name }}.result.dest}.zip"
}

resource "aws_lambda_function" "{{ snake_case_function_name }}" {
  function_name = "${var.prefix}-{{ TitleCaseFunctionName }}"
  filename      = data.archive_file.{{ snake_case_function_name }}.output_path
  role          = module.cumulus.lambda_processing_role_arn
  handler       = "index.{{ camelCaseFunctionName }}Handler"
  runtime       = "nodejs12.x"
  timeout       = 300

  source_code_hash = data.archive_file.{{ snake_case_function_name }}.output_base64sha256
  layers           = [var.cumulus_message_adapter_lambda_layer_arn]

  dynamic "vpc_config" {
    for_each = length(var.lambda_subnet_ids) == 0 ? [] : [1]
    content {
      subnet_ids         = var.lambda_subnet_ids
      security_group_ids = [aws_security_group.sample_egress_only.id]
    }
  }

  environment {
    variables = {
      CUMULUS_MESSAGE_ADAPTER_DIR = "/opt/"
    }
  }
}

#-------------------------------------------------------------------------------
# USAGE NOTE
#-------------------------------------------------------------------------------
# If you want to deploy this Lambda Function as an ECS Task, uncomment
# everything below.  Then, to configure it in a workflow, reference it via the
# following expression:
#
#     aws_sfn_activity.{{ snake_case_function_name }}.id
#
# For reference, see the relevant Cumulus documentation:
# https://nasa.github.io/cumulus/docs/data-cookbooks/run-tasks-in-lambda-or-docker
#-------------------------------------------------------------------------------

# resource "aws_sfn_activity" "{{ snake_case_function_name }}" {
#   name = "${var.prefix}-{{ TitleCaseFunctionName }}"
# }
#
# module "{{ snake_case_function_name }}_service" {
#   source = "https://github.com/nasa/cumulus/releases/download/v6.0.0/terraform-aws-cumulus-ecs-service.zip"
#
#   prefix = var.prefix
#   name   = "{{ TitleCaseFunctionName }}"
#
#   cluster_arn                           = module.cumulus.ecs_cluster_arn
#   desired_count                         = 1
#   image                                 = "cumuluss/cumulus-ecs-task:1.7.0"
#   log2elasticsearch_lambda_function_arn = module.cumulus.log2elasticsearch_lambda_function_arn
#
#   cpu                = 400
#   memory_reservation = 700
#
#   environment = {
#     AWS_DEFAULT_REGION          = data.aws_region.current.name,
#     CUMULUS_MESSAGE_ADAPTER_DIR = "/opt/",
#   }
#   command = [
#     "cumulus-ecs-task",
#     "--activityArn",
#     aws_sfn_activity.{{ snake_case_function_name }}.id,
#     "--lambdaArn",
#     aws_lambda_function.{{ snake_case_function_name }}.arn
#   ]
#   alarms = {
#     TaskCountHigh = {
#       comparison_operator = "GreaterThanThreshold"
#       evaluation_periods  = 1
#       metric_name         = "MemoryUtilization"
#       statistic           = "SampleCount"
#       threshold           = 1
#     }
#   }
# }
#
# resource "null_resource" "restart_{{ snake_case_function_name }}_ecs_task" {
#   triggers = {
#     last_modified = aws_lambda_function.{{ snake_case_function_name }}.last_modified
#   }
#
#   provisioner "local-exec" {
#     interpreter = ["bash", "-c"]
#     command     = "./restart-ecs-task-sync.sh ${module.cumulus.ecs_cluster_arn} ${var.prefix}-{{ TitleCaseFunctionName }}"
#   }
# }
