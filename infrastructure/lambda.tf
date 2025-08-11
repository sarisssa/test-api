# Lambda Function for Match Processing

# Create placeholder Lambda deployment package
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda-placeholder.zip"
  
  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'Placeholder Lambda - Deploy actual code' });"
    filename = "index.js"
  }
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "match_processor_logs" {
  name              = "/aws/lambda/${var.project_name}-match-processor-${var.environment}"
  retention_in_days = var.lambda_log_retention_days

  tags = {
    Name = "${var.project_name}-match-processor-logs-${var.environment}"
  }
}

# Lambda function for match processing
resource "aws_lambda_function" "match_processor" {
  function_name = "${var.project_name}-match-processor-${var.environment}"
  role          = aws_iam_role.lambda_sqs_role.arn
  handler       = "dist/index.handler"  
  runtime       = var.lambda_runtime
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory_size

  # Deployment package configuration
  # For initial deployment, uses placeholder. Replace with actual build artifacts for production.
  filename         = var.lambda_deployment_package != "" ? var.lambda_deployment_package : "${path.module}/lambda-placeholder.zip"
  source_code_hash = var.lambda_deployment_package != "" ? filebase64sha256(var.lambda_deployment_package) : data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      SQS_QUEUE_URL       = aws_sqs_queue.match_processing.id
      WAGE_TABLE_NAME     = aws_dynamodb_table.main.name
      TWELVE_DATA_API_KEY = var.twelve_data_api_key //TODO: Fetch from Secrets Manager, do not make variable
      NODE_ENV            = var.environment
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.match_processor_logs,
    aws_iam_role_policy_attachment.lambda_sqs_attachment
  ]

  tags = {
    Name = "${var.project_name}-match-processor-${var.environment}"
  }
}

# Lambda event source mapping for SQS
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = aws_sqs_queue.match_processing.arn
  function_name    = aws_lambda_function.match_processor.arn
  batch_size       = 1
  enabled          = true

  # Optional: Configure failure handling
  maximum_batching_window_in_seconds = 5
  
  tags = {
    Name = "${var.project_name}-sqs-trigger-${var.environment}"
  }
}

output "lambda_function_name" {
  description = "Name of the match processor Lambda function"
  value       = aws_lambda_function.match_processor.function_name
}

output "lambda_function_arn" {
  description = "ARN of the match processor Lambda function"
  value       = aws_lambda_function.match_processor.arn
}

output "lambda_log_group_name" {
  description = "Name of the Lambda CloudWatch log group"
  value       = aws_cloudwatch_log_group.match_processor_logs.name
}
