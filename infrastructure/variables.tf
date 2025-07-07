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
  default     = "us-west-1"
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

