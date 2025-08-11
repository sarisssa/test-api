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

# ElastiCache Configuration
elasticache_node_type            = "cache.t3.small"
elasticache_num_cache_nodes      = 2
elasticache_transit_encryption   = true
elasticache_automatic_failover   = true
elasticache_multi_az            = true

# DynamoDB Configuration
dynamodb_billing_mode           = "PAY_PER_REQUEST"
dynamodb_point_in_time_recovery = true

# SQS Configuration
sqs_visibility_timeout_seconds = 60
sqs_max_receive_count         = 5

# API Gateway Configuration
api_gateway_endpoint_type        = "REGIONAL"
api_gateway_log_retention_days   = 30
api_gateway_quota_limit         = 50000
api_gateway_rate_limit          = 2000
api_gateway_burst_limit         = 5000

# S3 Configuration
s3_versioning_enabled       = true
s3_cors_allowed_origins     = ["https://callimar.com", "https://www.callimar.com"]
s3_old_version_expiry_days  = 90
enable_cloudfront          = true

# Lambda Configuration
lambda_runtime              = "nodejs18.x"
lambda_timeout              = 60
lambda_memory_size          = 512
lambda_log_retention_days   = 30
# twelve_data_api_key        = "your-api-key-here"  # Set via TF_VAR_twelve_data_api_key

