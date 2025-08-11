# Dead Letter Queue for match processing  
resource "aws_sqs_queue" "match_processing_dlq" {
  name                      = "${var.project_name}-match-processing-dlq-${var.environment}"
  message_retention_seconds = var.sqs_dlq_message_retention_seconds
  
  tags = {
    Name = "${var.project_name}-match-processing-dlq-${var.environment}"
    Type = "DeadLetterQueue"
  }
}

# Main match processing queue - used for Lambda self-scheduling
resource "aws_sqs_queue" "match_processing" {
  name                       = "${var.project_name}-match-processing-${var.environment}"
  delay_seconds              = var.sqs_delay_seconds
  max_message_size           = var.sqs_max_message_size
  message_retention_seconds  = var.sqs_message_retention_seconds
  receive_wait_time_seconds  = var.sqs_receive_wait_time_seconds
  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.match_processing_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })

  tags = {
    Name = "${var.project_name}-match-processing-${var.environment}"
    Type = "MainQueue"
  }
}

# SQS Queue policy for cross-service access
resource "aws_sqs_queue_policy" "match_processing_policy" {
  queue_url = aws_sqs_queue.match_processing.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.match_processing.arn
      }
    ]
  })
}

# IAM Role for Lambda to access SQS
resource "aws_iam_role" "lambda_sqs_role" {
  name = "${var.project_name}-lambda-sqs-role-${var.environment}"

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
    Name = "${var.project_name}-lambda-sqs-role-${var.environment}"
  }
}

# IAM Policy for Lambda to access SQS and CloudWatch Logs
resource "aws_iam_policy" "lambda_sqs_policy" {
  name        = "${var.project_name}-lambda-sqs-policy-${var.environment}"
  description = "Policy for Lambda to access SQS and CloudWatch Logs"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.match_processing.arn,
          aws_sqs_queue.match_processing_dlq.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.main.arn,
          "${aws_dynamodb_table.main.arn}/index/*"
        ]
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-lambda-sqs-policy-${var.environment}"
  }
}

# Attach the policy to the role
resource "aws_iam_role_policy_attachment" "lambda_sqs_attachment" {
  role       = aws_iam_role.lambda_sqs_role.name
  policy_arn = aws_iam_policy.lambda_sqs_policy.arn
}

# Outputs
output "sqs_match_processing_queue_url" {
  description = "URL of the match processing SQS queue"
  value       = aws_sqs_queue.match_processing.id
}

output "sqs_match_processing_queue_arn" {
  description = "ARN of the match processing SQS queue"
  value       = aws_sqs_queue.match_processing.arn
}

output "lambda_sqs_role_arn" {
  description = "ARN of the Lambda IAM role for SQS access"
  value       = aws_iam_role.lambda_sqs_role.arn
}
