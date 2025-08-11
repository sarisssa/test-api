resource "aws_cloudwatch_metric_alarm" "ecs_cpu_utilization" {
  count = var.environment == "prd" ? 1 : 0

  alarm_name          = "${var.project_name}-ecs-cpu-utilization-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = var.alarm_cpu_threshold
  alarm_description   = "This metric monitors ECS CPU utilization"
  alarm_actions       = [aws_sns_topic.alarms[0].arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.backend_cluster.name
    ServiceName = aws_ecs_service.backend_service.name
  }

  tags = {
    Name    = "${var.project_name}-ecs-cpu-alarm-${var.environment}"
    Service = "Monitoring"
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_utilization" {
  count = var.environment == "prd" ? 1 : 0

  alarm_name          = "${var.project_name}-ecs-memory-utilization-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = var.alarm_memory_threshold
  alarm_description   = "This metric monitors ECS memory utilization"
  alarm_actions       = [aws_sns_topic.alarms[0].arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.backend_cluster.name
    ServiceName = aws_ecs_service.backend_service.name
  }

  tags = {
    Name    = "${var.project_name}-ecs-memory-alarm-${var.environment}"
    Service = "Monitoring"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_errors" {
  count = var.environment == "prd" ? 1 : 0

  alarm_name          = "${var.project_name}-alb-5xx-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "This metric monitors ALB 5XX errors"
  alarm_actions       = [aws_sns_topic.alarms[0].arn]

  dimensions = {
    LoadBalancer = aws_lb.backend_alb.arn_suffix
  }

  tags = {
    Name    = "${var.project_name}-alb-5xx-alarm-${var.environment}"
    Service = "Monitoring"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_4xx_errors" {
  count = var.environment == "prd" ? 1 : 0
  
  alarm_name          = "${var.project_name}-alb-4xx-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "HTTPCode_Target_4XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "50"
  alarm_description   = "This metric monitors ALB 4XX errors"
  alarm_actions       = [aws_sns_topic.alarms[0].arn]

  dimensions = {
    LoadBalancer = aws_lb.backend_alb.arn_suffix
  }

  tags = {
    Name    = "${var.project_name}-alb-4xx-alarm-${var.environment}"
    Service = "Monitoring"
  }
}

resource "aws_cloudwatch_metric_alarm" "target_response_time" {
  count = var.environment == "prd" ? 1 : 0

  alarm_name          = "${var.project_name}-target-response-time-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Average"
  threshold           = "3"
  alarm_description   = "This metric monitors target response time"
  alarm_actions       = [aws_sns_topic.alarms[0].arn]

  dimensions = {
    LoadBalancer = aws_lb.backend_alb.arn_suffix
    TargetGroup  = aws_lb_target_group.backend_tg.arn_suffix
  }

  tags = {
    Name    = "${var.project_name}-response-time-alarm-${var.environment}"
    Service = "Monitoring"
  }
}

resource "aws_cloudwatch_metric_alarm" "healthy_host_count" {
  count = var.environment == "prd" ? 1 : 0

  alarm_name          = "${var.project_name}-healthy-host-count-${var.environment}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Minimum"
  threshold           = "2"
  alarm_description   = "This metric monitors number of healthy hosts"
  alarm_actions       = [aws_sns_topic.alarms[0].arn]

  dimensions = {
    LoadBalancer = aws_lb.backend_alb.arn_suffix
    TargetGroup  = aws_lb_target_group.backend_tg.arn_suffix
  }

  tags = {
    Name    = "${var.project_name}-healthy-host-alarm-${var.environment}"
    Service = "Monitoring"
  }
}