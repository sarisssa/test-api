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
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.compute_outcome.arn,
          aws_lambda_function.broadcast_completion.arn
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
    Comment = "Match Settlement - Compute outcome, update match, and broadcast results"
    StartAt = "WaitForMatchEnd"
    States = {
      WaitForMatchEnd = {
        Type          = "Wait"
        TimestampPath = "$.matchTentativeEndTime"
        Next          = "ComputeOutcome"
      }

      ComputeOutcome = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.compute_outcome.arn
          Payload = {
            "matchId.$"   = "$.matchId"
            "tableName.$" = "$.tableName"
            "matchPk.$"   = "$.matchPk"
            "matchSk.$"   = "$.matchSk"
          }
        }
        ResultPath = "$.compute"
        Next       = "CompleteMatchWithOutcome"
        Retry = [
          {
            ErrorEquals     = ["States.TaskFailed"]
            IntervalSeconds = 2
            MaxAttempts     = 2
            BackoffRate     = 2.0
          }
        ]
      }

      CompleteMatchWithOutcome = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:dynamodb:updateItem"
        Parameters = {
          "TableName.$" = "$.tableName"
          Key = {
            pk = { "S.$" = "$.matchPk" }
            sk = { "S.$" = "$.matchSk" }
          }
          UpdateExpression    = "SET #status = :completed, matchEndedAt = :endTime, completionReason = :reason, winner = :winner, loser = :loser, finalScoresJson = :finalScoresJson, returnsJson = :returnsJson"
          ConditionExpression = "#status = :inProgress"
          ExpressionAttributeNames = {
            "#status" = "status"
          }
          ExpressionAttributeValues = {
            ":completed"       = { S = "completed" }
            ":inProgress"      = { S = "in_progress" }
            ":reason"          = { S = "time_expired" }
            ":endTime"         = { "S.$" = "$.matchTentativeEndTime" }
            ":winner"          = { "S.$" = "$.compute.Payload.winnerId" }
            ":loser"           = { "S.$" = "$.compute.Payload.loserId" }
            ":finalScoresJson" = { "S.$" = "States.JsonToString($.compute.Payload.finalScores)" }
            ":returnsJson"     = { "S.$" = "States.JsonToString($.compute.Payload.returns)" }
          }
        }
        ResultPath = null
        Next       = "BroadcastCompletion"
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
            ResultPath  = null
            Next        = "MatchAlreadyCompleted"
          }
        ]
      }

      BroadcastCompletion = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.broadcast_completion.arn
          Payload = {
            "matchId.$"  = "$.matchId"
            "winnerId.$" = "$.compute.Payload.winnerId"
            "loserId.$"  = "$.compute.Payload.loserId"
            "returns.$"  = "$.compute.Payload.returns"
          }
        }
        ResultPath = null
        End        = true
        Retry = [
          {
            ErrorEquals     = ["States.TaskFailed"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2.0
          }
        ]
      }

      MatchAlreadyCompleted = {
        Type    = "Succeed"
        Comment = "Match was already completed by forfeit or other process"
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

output "step_functions_arn" {
  description = "ARN of the Match Settlement Step Functions state machine"
  value       = aws_sfn_state_machine.match_settlement.arn
}