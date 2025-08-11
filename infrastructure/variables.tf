# ---------------------------------------------------
# Global Configuration
# ---------------------------------------------------

variable "project_name" {
  description = "Name of the project or application."
  type        = string
  default     = "wage"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "aws_region" {
  description = "AWS region to deploy resources."
  type        = string
  default     = "us-east-1"
}

# ---------------------------------------------------
# Networking Configuration
# ---------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the Virtual Private Cloud."
  type        = string
}

variable "domain_name" {
  description = "The domain name for the application"
  type        = string
}

variable "domain_zone_id" {
  description = "The zone ID for the domain name"
  type        = string
}


# ---------------------------------------------------
# Application / ECS Service Configuration
# ---------------------------------------------------

variable "ecs_task_cpu" {
  description = "CPU units allocated to each ECS task."
  type        = number
}

variable "ecs_task_memory" {
  description = "Memory allocated to each ECS task."
  type        = number
}

variable "ecs_service_desired_count" {
  description = "The desired number of ECS tasks to run in the service."
  type        = number
}

# ---------------------------------------------------
# Monitoring & Alerting Configuration
# ---------------------------------------------------

variable "alerts_group_email" {
  description = "Primary email address for general operational alarm notifications."
  type        = string
  nullable    = true
}

variable "budget_notification_email" {
  description = "List of email addresses to receive financial budget notifications."
  type        = set(string)
  nullable    = true
}

variable "alarm_cpu_threshold" {
  description = "CPU utilization percentage threshold (0-100) for triggering a CloudWatch alarm."
  type        = number
  nullable    = true
}

variable "alarm_memory_threshold" {
  description = "Memory utilization percentage threshold (0-100) for triggering a CloudWatch alarm."
  type        = number
  nullable    = true
}

variable "alarm_evaluation_periods" {
  description = "The number of periods over which CloudWatch alarm data is compared to the specified threshold."
  type        = number
  nullable    = true
}

# ---------------------------------------------------
# Budget Configuration
# ---------------------------------------------------

variable "aws_monthly_budget_amount" {
  description = "The target monthly budget amount for overall AWS services, specified in US dollars."
  type        = string
}

variable "ecs_monthly_budget_amount" {
  description = "The target monthly budget amount specifically for ECS services, specified in US dollars."
  type        = string
}

# ---------------------------------------------------
# ElastiCache Configuration
# ---------------------------------------------------

variable "elasticache_node_type" {
  description = "The compute and memory capacity of the nodes in the node group"
  type        = string
  default     = "cache.t3.micro"
}

variable "elasticache_parameter_group" {
  description = "Name of the parameter group to associate with this cache cluster"
  type        = string
  default     = "default.redis7"
}

variable "elasticache_num_cache_nodes" {
  description = "The number of cache nodes that the cache cluster should have"
  type        = number
  default     = 2
}

variable "elasticache_transit_encryption" {
  description = "Whether to enable encryption in transit"
  type        = bool
  default     = true
}

variable "elasticache_automatic_failover" {
  description = "Specifies whether a read-only replica will be automatically promoted to read/write primary if the existing primary fails"
  type        = bool
  default     = true
}

variable "elasticache_multi_az" {
  description = "Specifies whether to enable Multi-AZ Support for the replication group"
  type        = bool
  default     = false
}

variable "elasticache_maintenance_window" {
  description = "Specifies the weekly time range for when maintenance on the cache cluster is performed"
  type        = string
  default     = "sun:05:00-sun:06:00"
}

variable "elasticache_snapshot_retention" {
  description = "The number of days for which ElastiCache will retain automatic cache cluster snapshots before deleting them"
  type        = number
  default     = 5
}

variable "elasticache_snapshot_window" {
  description = "The daily time range during which ElastiCache will begin taking a daily snapshot of the cache cluster"
  type        = string
  default     = "03:00-04:00"
}

# ---------------------------------------------------
# DynamoDB Configuration
# ---------------------------------------------------

variable "dynamodb_billing_mode" {
  description = "Controls how you are charged for read and write throughput and how you manage capacity"
  type        = string
  default     = "PAY_PER_REQUEST"
  validation {
    condition     = contains(["PROVISIONED", "PAY_PER_REQUEST"], var.dynamodb_billing_mode)
    error_message = "DynamoDB billing mode must be either PROVISIONED or PAY_PER_REQUEST."
  }
}

variable "dynamodb_read_capacity" {
  description = "The number of read units for this table (only applies if billing_mode is PROVISIONED)"
  type        = number
  default     = 5
}

variable "dynamodb_write_capacity" {
  description = "The number of write units for this table (only applies if billing_mode is PROVISIONED)"
  type        = number
  default     = 5
}

variable "dynamodb_point_in_time_recovery" {
  description = "Whether to enable point-in-time recovery"
  type        = bool
  default     = true
}

# ---------------------------------------------------
# SQS Configuration
# ---------------------------------------------------

variable "sqs_delay_seconds" {
  description = "The time in seconds that the delivery of all messages in the queue will be delayed"
  type        = number
  default     = 0
}

variable "sqs_max_message_size" {
  description = "The limit of how many bytes a message can contain before Amazon SQS rejects it"
  type        = number
  default     = 262144
}

variable "sqs_message_retention_seconds" {
  description = "The number of seconds Amazon SQS retains a message"
  type        = number
  default     = 1209600 # 14 days
}

variable "sqs_receive_wait_time_seconds" {
  description = "The time for which a ReceiveMessage call will wait for a message to arrive (long polling)"
  type        = number
  default     = 10
}

variable "sqs_visibility_timeout_seconds" {
  description = "The visibility timeout for the queue"
  type        = number
  default     = 30
}

variable "sqs_max_receive_count" {
  description = "The number of times a message is delivered to the source queue before being moved to the dead-letter queue"
  type        = number
  default     = 3
}

variable "sqs_dlq_message_retention_seconds" {
  description = "The number of seconds Amazon SQS retains a message in the dead letter queue"
  type        = number
  default     = 1209600 # 14 days
}

# ---------------------------------------------------
# API Gateway Configuration
# ---------------------------------------------------

variable "api_gateway_endpoint_type" {
  description = "The type of endpoint for the API Gateway"
  type        = string
  default     = "REGIONAL"
  validation {
    condition     = contains(["EDGE", "REGIONAL", "PRIVATE"], var.api_gateway_endpoint_type)
    error_message = "API Gateway endpoint type must be one of: EDGE, REGIONAL, PRIVATE."
  }
}

variable "api_gateway_log_retention_days" {
  description = "The number of days to retain API Gateway logs"
  type        = number
  default     = 14
}

variable "api_gateway_custom_domain" {
  description = "Custom domain name for the API Gateway"
  type        = string
  default     = ""
}

variable "api_gateway_certificate_arn" {
  description = "ARN of the certificate for the custom domain"
  type        = string
  default     = ""
}

variable "api_gateway_quota_limit" {
  description = "The maximum number of requests that can be made in a given time period"
  type        = number
  default     = 10000
}

variable "api_gateway_quota_period" {
  description = "The time period in which the limit applies"
  type        = string
  default     = "DAY"
}

variable "api_gateway_rate_limit" {
  description = "The API request steady-state rate limit"
  type        = number
  default     = 1000
}

variable "api_gateway_burst_limit" {
  description = "The API request burst limit"
  type        = number
  default     = 2000
}

# ---------------------------------------------------
# S3 Configuration
# ---------------------------------------------------

variable "s3_versioning_enabled" {
  description = "Whether to enable versioning on the S3 bucket"
  type        = bool
  default     = true
}

variable "s3_cors_allowed_origins" {
  description = "List of allowed origins for CORS"
  type        = list(string)
  default     = ["*"]
}

variable "s3_old_version_expiry_days" {
  description = "Number of days after which old versions of objects expire"
  type        = number
  default     = 90
}

variable "enable_cloudfront" {
  description = "Whether to enable CloudFront distribution for S3 bucket"
  type        = bool
  default     = false
}

# ---------------------------------------------------
# Lambda Configuration
# ---------------------------------------------------

variable "lambda_runtime" {
  description = "Lambda function runtime"
  type        = string
  default     = "nodejs18.x"
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 256
}

variable "lambda_log_retention_days" {
  description = "Number of days to retain Lambda logs"
  type        = number
  default     = 14
}

variable "twelve_data_api_key" {
  description = "API key for Twelve Data service"
  type        = string
  sensitive   = true
}

variable "lambda_deployment_package" {
  description = "Path to the Lambda deployment package (zip file). If empty, uses placeholder."
  type        = string
  default     = ""
}

