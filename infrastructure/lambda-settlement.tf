# Match Settlement Lambda Handler
data "archive_file" "settlement_lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/settlement-lambda-placeholder.zip"

  source {
    content  = "exports.handler = async (event) => { console.log('DynamoDB Stream event:', JSON.stringify(event, null, 2)); const records = event.Records || []; for (const record of records) { if (record.eventName === 'MODIFY' && record.dynamodb?.NewImage?.status?.S === 'completed') { console.log('Processing match settlement for:', record.dynamodb.NewImage); const completionReason = record.dynamodb.NewImage.completionReason?.S; console.log('Completion reason:', completionReason); if (completionReason === 'time_expired') { console.log('Processing time-expired match settlement'); } else if (completionReason === 'forfeited') { console.log('Processing forfeited match settlement'); } } } return { statusCode: 200, body: JSON.stringify({ message: 'Settlement processing completed', recordsProcessed: records.length }) }; };"
    filename = "index.js"
  }
}

resource "aws_iam_role" "lambda_settlement_role" {
  name = "${var.project_name}-lambda-settlement-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-lambda-settlement-role-${var.environment}"
  }
}

resource "aws_iam_policy" "lambda_settlement_policy" {
  name        = "${var.project_name}-lambda-settlement-policy-${var.environment}"
  description = "IAM policy for Match Settlement Lambda function"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.main.arn,
          "${aws_dynamodb_table.main.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams"
        ]
        Resource = "${aws_dynamodb_table.main.arn}/stream/*"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-lambda-settlement-policy-${var.environment}"
  }
}

# Attach policy to role
resource "aws_iam_role_policy_attachment" "lambda_settlement_attachment" {
  role       = aws_iam_role.lambda_settlement_role.name
  policy_arn = aws_iam_policy.lambda_settlement_policy.arn
}

# CloudWatch Log Group for Settlement Lambda
resource "aws_cloudwatch_log_group" "settlement_handler_logs" {
  name              = "/aws/lambda/${var.project_name}-settlement-handler-${var.environment}"
  retention_in_days = var.lambda_log_retention_days

  tags = {
    Name = "${var.project_name}-settlement-handler-logs-${var.environment}"
  }
}

# Lambda function for Match Settlement
resource "aws_lambda_function" "settlement_handler" {
  function_name = "${var.project_name}-settlement-handler-${var.environment}"
  role          = aws_iam_role.lambda_settlement_role.arn
  handler       = "dist/settlement.handler"
  runtime       = var.lambda_runtime
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory_size

  # Deployment package configuration
  # For initial deployment, uses placeholder. Replace with actual build artifacts for production.
  filename         = var.settlement_lambda_deployment_package != "" ? var.settlement_lambda_deployment_package : "${path.module}/settlement-lambda-placeholder.zip"
  source_code_hash = var.settlement_lambda_deployment_package != "" ? filebase64sha256(var.settlement_lambda_deployment_package) : data.archive_file.settlement_lambda_placeholder.output_base64sha256

  environment {
    variables = {
      WAGE_TABLE_NAME = aws_dynamodb_table.main.name
      NODE_ENV        = var.environment
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.settlement_handler_logs,
    aws_iam_role_policy_attachment.lambda_settlement_attachment
  ]

  tags = {
    Name = "${var.project_name}-settlement-handler-${var.environment}"
  }
}

# Outputs
output "settlement_lambda_function_name" {
  description = "Name of the Settlement handler Lambda function"
  value       = aws_lambda_function.settlement_handler.function_name
}

output "settlement_lambda_function_arn" {
  description = "ARN of the Settlement handler Lambda function"
  value       = aws_lambda_function.settlement_handler.arn
}
