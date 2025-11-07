
resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket = "${var.project_name}-cloudtrail-logs-${var.environment}"

  tags = {
    Name = "${var.project_name}-cloudtrail-logs-${var.environment}"
  }
}

# Block public access to CloudTrail logs bucket
resource "aws_s3_bucket_public_access_block" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Server-side encryption for CloudTrail logs
resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle policy to reduce costs (delete old logs after 90 days)
resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  rule {
    id     = "delete-old-logs"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 60
      storage_class = "GLACIER"
    }

    expiration {
      days = 90
    }
  }
}

# S3 Bucket Policy for CloudTrail
resource "aws_s3_bucket_policy" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail_logs.arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail_logs.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

# CloudWatch Log Group for CloudTrail (optional, for real-time monitoring)
resource "aws_cloudwatch_log_group" "cloudtrail" {
  count             = var.cloudtrail_enable_cloudwatch_logs ? 1 : 0
  name              = "/aws/cloudtrail/${var.project_name}-${var.environment}"
  retention_in_days = 30 

  tags = {
    Name = "${var.project_name}-cloudtrail-logs-${var.environment}"
  }
}

# IAM Role for CloudTrail to write to CloudWatch Logs
resource "aws_iam_role" "cloudtrail_cloudwatch" {
  count = var.cloudtrail_enable_cloudwatch_logs ? 1 : 0
  name  = "${var.project_name}-cloudtrail-cloudwatch-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-cloudtrail-cloudwatch-role-${var.environment}"
  }
}

# IAM Policy for CloudTrail to write to CloudWatch Logs
resource "aws_iam_role_policy" "cloudtrail_cloudwatch" {
  count = var.cloudtrail_enable_cloudwatch_logs ? 1 : 0
  name  = "${var.project_name}-cloudtrail-cloudwatch-policy-${var.environment}"
  role  = aws_iam_role.cloudtrail_cloudwatch[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*"
      }
    ]
  })
}

# CloudTrail Trail
resource "aws_cloudtrail" "main" {
  name                          = "${var.project_name}-trail-${var.environment}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs.id
  include_global_service_events = true
  is_multi_region_trail         = false
  enable_log_file_validation    = true

  # Optional: Send logs to CloudWatch for real-time alerting
  cloud_watch_logs_group_arn = var.cloudtrail_enable_cloudwatch_logs ? "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*" : null
  cloud_watch_logs_role_arn  = var.cloudtrail_enable_cloudwatch_logs ? aws_iam_role.cloudtrail_cloudwatch[0].arn : null

  # Log DynamoDB data events (DeleteItem, PutItem, UpdateItem, etc.)
  event_selector {
    read_write_type           = "All"
    include_management_events = true

    # Track all DynamoDB operations on the wage-main table
    data_resource {
      type = "AWS::DynamoDB::Table"
      
      # Log all operations on your main table
      values = [
        "${aws_dynamodb_table.main.arn}"
      ]
    }
  }

  depends_on = [
    aws_s3_bucket_policy.cloudtrail_logs
  ]

  tags = {
    Name = "${var.project_name}-trail-${var.environment}"
  }
}

# ============================================================================
# CloudWatch Metric Filter - Alert on DeleteItem operations
# ============================================================================

resource "aws_cloudwatch_log_metric_filter" "dynamodb_delete_operations" {
  count          = var.cloudtrail_enable_cloudwatch_logs ? 1 : 0
  name           = "${var.project_name}-dynamodb-deletes-${var.environment}"
  pattern        = "{ $.eventName = \"DeleteItem\" && $.requestParameters.tableName = \"${aws_dynamodb_table.main.name}\" }"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name

  metric_transformation {
    name      = "DynamoDBDeleteOperations"
    namespace = "${var.project_name}/DynamoDB"
    value     = "1"
    unit      = "Count"
  }
}

# CloudWatch Alarm - Alert when matches are deleted
resource "aws_cloudwatch_metric_alarm" "dynamodb_delete_alarm" {
  count               = var.cloudtrail_enable_cloudwatch_logs && var.sns_alert_topic_arn != "" ? 1 : 0
  alarm_name          = "${var.project_name}-dynamodb-deletes-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DynamoDBDeleteOperations"
  namespace           = "${var.project_name}/DynamoDB"
  period              = 60 # 1 minute
  statistic           = "Sum"
  threshold           = 0 # Alert on ANY delete
  alarm_description   = "Alert when DynamoDB items are deleted from ${aws_dynamodb_table.main.name}"
  treat_missing_data  = "notBreaching"

  alarm_actions = [var.sns_alert_topic_arn]

  tags = {
    Name = "${var.project_name}-dynamodb-deletes-${var.environment}"
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "cloudtrail_bucket_name" {
  description = "Name of the S3 bucket storing CloudTrail logs"
  value       = aws_s3_bucket.cloudtrail_logs.id
}

output "cloudtrail_name" {
  description = "Name of the CloudTrail trail"
  value       = aws_cloudtrail.main.name
}

output "cloudtrail_arn" {
  description = "ARN of the CloudTrail trail"
  value       = aws_cloudtrail.main.arn
}

output "cloudtrail_log_group_name" {
  description = "Name of the CloudWatch log group for CloudTrail (if enabled)"
  value       = var.cloudtrail_enable_cloudwatch_logs ? aws_cloudwatch_log_group.cloudtrail[0].name : null
}

