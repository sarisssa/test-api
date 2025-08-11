
# Single table for all data types using composite keys
resource "aws_dynamodb_table" "main" {
  name           = "${var.project_name}-main-${var.environment}"
  billing_mode   = var.dynamodb_billing_mode
  read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
  write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  hash_key       = "pk"    # Partition Key
  range_key      = "sk"    # Sort Key

  # Primary key attributes
  attribute {
    name = "pk"    # Partition Key (e.g., USER#123, MATCH#456, ASSET#AAPL)
    type = "S"
  }

  attribute {
    name = "sk"    # Sort Key (e.g., PROFILE, METADATA, PRICE#2024-01-01)
    type = "S"
  }

  # GSI1 for inverted lookups (e.g., find all matches for a user)
  attribute {
    name = "gsi1_pk"
    type = "S"
  }

  attribute {
    name = "gsi1_sk"
    type = "S"
  }

  # GSI2 for type-based queries (e.g., all active matches)
  attribute {
    name = "gsi2_pk"
    type = "S"
  }

  attribute {
    name = "gsi2_sk"
    type = "S"
  }

  # GSI3 for additional access patterns (e.g., email/phone lookup)
  attribute {
    name = "gsi3_pk"
    type = "S"
  }

  attribute {
    name = "gsi3_sk"
    type = "S"
  }

  # GSI1: Inverted index for relationship queries
  global_secondary_index {
    name            = "gsi1-index"
    hash_key        = "gsi1_pk"
    range_key       = "gsi1_sk"
    projection_type = "ALL"
    read_capacity   = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
    write_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  }

  # GSI2: Type-based queries (e.g., all items of a certain type/status)
  global_secondary_index {
    name            = "gsi2-index" 
    hash_key        = "gsi2_pk"
    range_key       = "gsi2_sk"
    projection_type = "ALL"
    read_capacity   = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
    write_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  }

  # GSI3: Email/Phone/Symbol lookup
  global_secondary_index {
    name            = "gsi3-index"
    hash_key        = "gsi3_pk"
    range_key       = "gsi3_sk"
    projection_type = "ALL"
    read_capacity   = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
    write_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  }

  point_in_time_recovery {
    enabled = var.dynamodb_point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-main-${var.environment}"
  }
}

# Outputs
output "dynamodb_table_name" {
  description = "Name of the main DynamoDB table"
  value       = aws_dynamodb_table.main.name
}

output "dynamodb_table_arn" {
  description = "ARN of the main DynamoDB table"
  value       = aws_dynamodb_table.main.arn
}
