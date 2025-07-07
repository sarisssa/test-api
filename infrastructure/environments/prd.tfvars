environment               = "prd"
ecs_task_cpu              = 1024
ecs_task_memory           = 2048
ecs_service_desired_count = 4
vpc_cidr                  = "10.1.0.0/16"
alarm_cpu_threshold       = 70
alarm_memory_threshold    = 70
alarm_evaluation_periods  = 3
alerts_group_email        = "sasmikechan@gmail.com"
budget_notification_email = ["sasmikechan@gmail.com"]
aws_monthly_budget_amount = "1000"
ecs_monthly_budget_amount = "500"
domain_name               = "callimar.com"
domain_zone_id            = "Z02021623K7HAOYSQNZWG"

