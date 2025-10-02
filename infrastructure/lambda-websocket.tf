# WebSocket Lambda Handler

# Create placeholder WebSocket Lambda deployment package
data "archive_file" "websocket_lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/websocket-lambda-placeholder.zip"
  
  source {
    content  = "exports.handler = async (event) => { console.log('WebSocket event:', JSON.stringify(event)); return { statusCode: 200, body: 'WebSocket Placeholder Lambda' }; };"
    filename = "index.js"
  }
}

# IAM role for WebSocket Lambda
resource "aws_iam_role" "lambda_websocket_role" {
  name = "${var.project_name}-lambda-websocket-role-${var.environment}"

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
    Name = "${var.project_name}-lambda-websocket-role-${var.environment}"
  }
}

# IAM policy for WebSocket Lambda
resource "aws_iam_policy" "lambda_websocket_policy" {
  name        = "${var.project_name}-lambda-websocket-policy-${var.environment}"
  description = "IAM policy for WebSocket Lambda function"

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
          "execute-api:ManageConnections"
        ]
        Resource = "arn:aws:execute-api:*:*:*"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-lambda-websocket-policy-${var.environment}"
  }
}

# Attach policy to role
resource "aws_iam_role_policy_attachment" "lambda_websocket_attachment" {
  role       = aws_iam_role.lambda_websocket_role.name
  policy_arn = aws_iam_policy.lambda_websocket_policy.arn
}

resource "aws_cloudwatch_log_group" "websocket_handler_logs" {
  name              = "/aws/lambda/${var.project_name}-websocket-handler-${var.environment}"
  retention_in_days = var.lambda_log_retention_days

  tags = {
    Name = "${var.project_name}-websocket-handler-logs-${var.environment}"
  }
}

resource "aws_lambda_function" "websocket_handler" {
  function_name = "${var.project_name}-websocket-handler-${var.environment}"
  role          = aws_iam_role.lambda_websocket_role.arn
  handler       = "dist/websocket.handler"  
  runtime       = var.lambda_runtime
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory_size

  # Deployment package configuration
  # For initial deployment, uses placeholder. Replace with actual build artifacts for production.
  filename         = var.websocket_lambda_deployment_package != "" ? var.websocket_lambda_deployment_package : "${path.module}/websocket-lambda-placeholder.zip"
  source_code_hash = var.websocket_lambda_deployment_package != "" ? filebase64sha256(var.websocket_lambda_deployment_package) : data.archive_file.websocket_lambda_placeholder.output_base64sha256

  environment {
    variables = {
      WAGE_TABLE_NAME = aws_dynamodb_table.main.name
      NODE_ENV        = var.environment
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.websocket_handler_logs,
    aws_iam_role_policy_attachment.lambda_websocket_attachment
  ]

  tags = {
    Name = "${var.project_name}-websocket-handler-${var.environment}"
  }
}

resource "aws_lambda_permission" "api_gateway_websocket" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket_handler.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket_api.execution_arn}/*/*"
}
