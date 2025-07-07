# Create SNS Topic for alarms
resource "aws_sns_topic" "alarms" {
  count = var.environment == "prd" ? 1 : 0
  name  = "${var.project_name}-sns-topic-${var.environment}"

  tags = {
    Name = "${var.project_name}-sns-topic-${var.environment}"
  }
}

# Create SNS Topic Policy to allow CloudWatch Alarms to publish
resource "aws_sns_topic_policy" "alarms" {
  count = var.environment == "prd" ? 1 : 0

  arn = aws_sns_topic.alarms[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudWatchAlarms"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.alarms[0].arn
      }
    ]
  })
}

# Subscription for the group email
resource "aws_sns_topic_subscription" "alarms_group" {
  count = var.environment == "prd" ? 1 : 0

  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alerts_group_email
}

# AWS will send a confirmation email to the var.alerts_group_email address. Someone must click the confirmation 
# link in that email for the subscription to become active and for alarms to start sending notifications. 