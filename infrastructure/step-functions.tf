resource "aws_iam_role" "step_functions_role" {
  name = "${var.project_name}-step-functions-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-step-functions-role-${var.environment}"
  }
}

resource "aws_cloudwatch_log_group" "step_functions_logs" {
  name              = "/aws/stepfunctions/${var.project_name}-match-settlement-${var.environment}"
  retention_in_days = var.lambda_log_retention_days

  tags = {
    Name = "${var.project_name}-step-functions-logs-${var.environment}"
  }
}

resource "aws_cloudwatch_log_resource_policy" "step_functions_logging_policy" {
  policy_name = "${var.project_name}-step-functions-logging-policy-${var.environment}"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = aws_cloudwatch_log_group.step_functions_logs.arn
      }
    ]
  })
}

resource "aws_iam_policy" "step_functions_policy" {
  name        = "${var.project_name}-step-functions-policy-${var.environment}"
  description = "IAM policy for Step Functions to update DynamoDB and manage log delivery"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups"
        ]
        Resource = [
          aws_cloudwatch_log_group.step_functions_logs.arn,
          "${aws_cloudwatch_log_group.step_functions_logs.arn}:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:UpdateItem",
          "dynamodb:PutItem",
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
    Name = "${var.project_name}-step-functions-policy-${var.environment}"
  }
}

resource "aws_iam_role_policy_attachment" "step_functions_attachment" {
  role       = aws_iam_role.step_functions_role.name
  policy_arn = aws_iam_policy.step_functions_policy.arn
}

resource "aws_sfn_state_machine" "match_settlement" {
  name     = "${var.project_name}-match-settlement-${var.environment}"
  role_arn = aws_iam_role.step_functions_role.arn

  definition = jsonencode({
    Comment = "Match Settlement Workflow - Waits until match end time and settles match"
    StartAt = "WaitForMatchEnd"
    States = {
      WaitForMatchEnd = {
        Type          = "Wait"
        TimestampPath = "$.matchTentativeEndTime"
        Next          = "SettleMatch"
      }
      SettleMatch = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = aws_dynamodb_table.main.name
          Key = {
            pk = {
              "S.$" = "$.matchId"
            }
            sk = {
              S = "METADATA"
            }
          }
          UpdateExpression    = "SET #status = :completed, #matchEndedAt = :endTime, #completionReason = :reason"
          ConditionExpression = "#status = :inProgress"
          ExpressionAttributeNames = {
            "#status"           = "status"
            "#matchEndedAt"     = "matchEndedAt"
            "#completionReason" = "completionReason"
          }
          ExpressionAttributeValues = {
            ":completed" = {
              S = "completed"
            }
            ":endTime" = {
              "S.$" = "$.matchTentativeEndTime"
            }
            ":reason" = {
              S = "time_expired"
            }
            ":inProgress" = {
              S = "in_progress"
            }
          }
        }
        End = true
        Retry = [
          {
            ErrorEquals     = ["States.TaskFailed"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2.0
          }
        ]
        Catch = [
          {
            ErrorEquals = ["DynamoDB.ConditionalCheckFailedException"]
            Next        = "MatchAlreadyCompleted"
          }
        ]
      }
      MatchAlreadyCompleted = {
        Type    = "Succeed"
        Comment = "Match was already completed by forfeiture or another process"
      }
    }
  })

  # Temporarily disable logging to get state machine created
  # Can be re-enabled later once the core functionality is working
  # logging_configuration {
  #   log_destination        = "${aws_cloudwatch_log_group.step_functions_logs.arn}:*"
  #   include_execution_data = true
  #   level                  = "ERROR"
  # }

  depends_on = [
    aws_iam_role_policy_attachment.step_functions_attachment
  ]

  tags = {
    Name = "${var.project_name}-match-settlement-${var.environment}"
  }
}