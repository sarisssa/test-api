resource "aws_budgets_budget" "monthly" {
  name              = "${var.project_name}-monthly-budget-${var.environment}"
  budget_type       = "COST"
  limit_amount      = var.aws_monthly_budget_amount
  limit_unit        = "USD"
  time_period_start = "2025-01-01_00:00"
  time_unit         = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 70
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_notification_email
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.budget_notification_email
  }

  cost_filter {
    name   = "TagKeyValue"
    values = ["user$Environment:${var.environment}"]
  }
}

resource "aws_budgets_budget" "ecs" {
  name              = "${var.project_name}-ecs-budget-${var.environment}"
  budget_type       = "COST"
  limit_amount      = var.ecs_monthly_budget_amount
  limit_unit        = "USD"
  time_period_start = "2024-01-01_00:00"
  time_unit         = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_notification_email
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.budget_notification_email
  }

  cost_filter {
    name   = "Service"
    values = ["Amazon Elastic Container Service"]
  }

  cost_filter {
    name   = "TagKeyValue"
    values = ["user$Environment:${var.environment}"]
  }
}