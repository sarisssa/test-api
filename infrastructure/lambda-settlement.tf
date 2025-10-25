# ============================================================================
# Lambda Security Group (for VPC access)
# ============================================================================

resource "aws_security_group" "lambda" {
  vpc_id      = aws_vpc.main_vpc.id
  name        = "${var.project_name}-lambda-sg-${var.environment}"
  description = "Security group for Lambda functions requiring VPC access"

  # Allow all outbound traffic (for DynamoDB, Redis, and other AWS services)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "${var.project_name}-lambda-sg-${var.environment}"
  }
}

# ============================================================================
# IAM Roles & Policies
# ============================================================================

# Compute Outcome Lambda IAM Role
resource "aws_iam_role" "lambda_compute_outcome_role" {
  name = "${var.project_name}-lambda-compute-outcome-role-${var.environment}"

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
    Name = "${var.project_name}-lambda-compute-outcome-role-${var.environment}"
  }
}

# Compute Outcome Lambda IAM Policy (read-only DynamoDB + CloudWatch Logs)
resource "aws_iam_policy" "lambda_compute_outcome_policy" {
  name        = "${var.project_name}-lambda-compute-outcome-policy-${var.environment}"
  description = "IAM policy for Compute Outcome Lambda - read-only DynamoDB access"

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
          "dynamodb:GetItem"
        ]
        Resource = [
          aws_dynamodb_table.main.arn,
          "${aws_dynamodb_table.main.arn}/index/*"
        ]
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-lambda-compute-outcome-policy-${var.environment}"
  }
}

resource "aws_iam_role_policy_attachment" "lambda_compute_outcome_attachment" {
  role       = aws_iam_role.lambda_compute_outcome_role.name
  policy_arn = aws_iam_policy.lambda_compute_outcome_policy.arn
}

# Broadcast Completion Lambda IAM Role
resource "aws_iam_role" "lambda_broadcast_completion_role" {
  name = "${var.project_name}-lambda-broadcast-completion-role-${var.environment}"

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
    Name = "${var.project_name}-lambda-broadcast-completion-role-${var.environment}"
  }
}

# Broadcast Completion Lambda IAM Policy (DynamoDB read/update + VPC + CloudWatch Logs)
resource "aws_iam_policy" "lambda_broadcast_completion_policy" {
  name        = "${var.project_name}-lambda-broadcast-completion-policy-${var.environment}"
  description = "IAM policy for Broadcast Completion Lambda - DynamoDB, VPC/ElastiCache access"

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
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.main.arn,
          "${aws_dynamodb_table.main.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-lambda-broadcast-completion-policy-${var.environment}"
  }
}

resource "aws_iam_role_policy_attachment" "lambda_broadcast_completion_attachment" {
  role       = aws_iam_role.lambda_broadcast_completion_role.name
  policy_arn = aws_iam_policy.lambda_broadcast_completion_policy.arn
}

# ============================================================================
# CloudWatch Log Groups
# ============================================================================

resource "aws_cloudwatch_log_group" "compute_outcome_logs" {
  name              = "/aws/lambda/${var.project_name}-compute-outcome-${var.environment}"
  retention_in_days = var.lambda_log_retention_days

  tags = {
    Name = "${var.project_name}-compute-outcome-logs-${var.environment}"
  }
}

resource "aws_cloudwatch_log_group" "broadcast_completion_logs" {
  name              = "/aws/lambda/${var.project_name}-broadcast-completion-${var.environment}"
  retention_in_days = var.lambda_log_retention_days

  tags = {
    Name = "${var.project_name}-broadcast-completion-logs-${var.environment}"
  }
}

# ============================================================================
# Lambda Functions
# ============================================================================

# Compute Outcome Lambda
resource "aws_lambda_function" "compute_outcome" {
  function_name = "${var.project_name}-compute-outcome-${var.environment}"
  role          = aws_iam_role.lambda_compute_outcome_role.arn
  handler       = "compute-outcome.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 512

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = "wage-main-dev"
      AWS_REGION          = var.aws_region
      NODE_ENV            = var.environment
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.compute_outcome_logs,
    aws_iam_role_policy_attachment.lambda_compute_outcome_attachment
  ]

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
      last_modified
    ]
  }

  tags = {
    Name = "${var.project_name}-compute-outcome-${var.environment}"
  }
}

# Broadcast Completion Lambda
resource "aws_lambda_function" "broadcast_completion" {
  function_name = "${var.project_name}-broadcast-completion-${var.environment}"
  role          = aws_iam_role.lambda_broadcast_completion_role.arn
  handler       = "broadcast-completion.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  # VPC configuration for ElastiCache access
  vpc_config {
    subnet_ids         = [aws_subnet.private_us_east_1a.id, aws_subnet.private_us_east_1c.id]
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = "wage-main-dev"
      AWS_REGION          = var.aws_region
      NODE_ENV            = var.environment
      REDIS_URL           = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.broadcast_completion_logs,
    aws_iam_role_policy_attachment.lambda_broadcast_completion_attachment
  ]

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
      last_modified
    ]
  }

  tags = {
    Name = "${var.project_name}-broadcast-completion-${var.environment}"
  }
}

output "compute_outcome_lambda_name" {
  description = "Name of the Compute Outcome Lambda function"
  value       = aws_lambda_function.compute_outcome.function_name
}

output "compute_outcome_lambda_arn" {
  description = "ARN of the Compute Outcome Lambda function"
  value       = aws_lambda_function.compute_outcome.arn
}

output "broadcast_completion_lambda_name" {
  description = "Name of the Broadcast Completion Lambda function"
  value       = aws_lambda_function.broadcast_completion.function_name
}

output "broadcast_completion_lambda_arn" {
  description = "ARN of the Broadcast Completion Lambda function"
  value       = aws_lambda_function.broadcast_completion.arn
}
