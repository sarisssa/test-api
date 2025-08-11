environment               = "dev"
ecs_task_cpu              = 256
ecs_task_memory           = 512
ecs_service_desired_count = 2
vpc_cidr                  = "10.0.0.0/16"
disable_alarms            = true
alarm_cpu_threshold       = 80
alarm_memory_threshold    = 80
alarm_evaluation_periods  = 2
alerts_group_email        = "sasmikechan@gmail.com"
budget_notification_email = ["sasmikechan@gmail.com"]
aws_monthly_budget_amount = "500"
ecs_monthly_budget_amount = "250"
domain_name               = "callimar.com"
domain_zone_id            = "Z02021623K7HAOYSQNZWG"

# ElastiCache Configuration
elasticache_node_type            = "cache.t3.micro"
elasticache_num_cache_nodes      = 1
elasticache_transit_encryption   = false
elasticache_automatic_failover   = false
elasticache_multi_az            = false

# DynamoDB Configuration
dynamodb_billing_mode           = "PAY_PER_REQUEST"
dynamodb_point_in_time_recovery = false

# SQS Configuration
sqs_visibility_timeout_seconds = 30
sqs_max_receive_count         = 3

# API Gateway Configuration
api_gateway_endpoint_type        = "REGIONAL"
api_gateway_log_retention_days   = 7
api_gateway_quota_limit         = 5000
api_gateway_rate_limit          = 500
api_gateway_burst_limit         = 1000

# S3 Configuration
s3_versioning_enabled       = false
s3_cors_allowed_origins     = ["http://localhost:3000", "https://dev.callimar.com"]
s3_old_version_expiry_days  = 30
enable_cloudfront          = false

# Lambda Configuration
lambda_runtime              = "nodejs18.x"
lambda_timeout              = 30
lambda_memory_size          = 256
lambda_log_retention_days   = 7
# twelve_data_api_key        = "your-api-key-here"  # Set via TF_VAR_twelve_data_api_key
