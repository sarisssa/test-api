
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-cache-subnet-group-${var.environment}"
  subnet_ids = [aws_subnet.private_us_east_1a.id, aws_subnet.private_us_east_1c.id]

  tags = {
    Name = "${var.project_name}-cache-subnet-group-${var.environment}"
  }
}

resource "aws_security_group" "elasticache" {
  name        = "${var.project_name}-elasticache-sg-${var.environment}"
  description = "Security group for ElastiCache Redis cluster"
  vpc_id      = aws_vpc.main_vpc.id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "Redis port access from VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = {
    Name = "${var.project_name}-elasticache-sg-${var.environment}"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id         = "${var.project_name}-redis-${var.environment}"
  description                  = "Redis cluster for ${var.project_name} ${var.environment}"
  
  node_type                    = var.elasticache_node_type
  port                         = 6379
  parameter_group_name         = var.elasticache_parameter_group
  
  num_cache_clusters           = var.elasticache_num_cache_nodes
  
  subnet_group_name            = aws_elasticache_subnet_group.main.name
  security_group_ids           = [aws_security_group.elasticache.id]
  
  at_rest_encryption_enabled   = true
  transit_encryption_enabled   = var.elasticache_transit_encryption
  
  automatic_failover_enabled   = var.elasticache_automatic_failover
  multi_az_enabled            = var.elasticache_multi_az
  
  maintenance_window          = var.elasticache_maintenance_window
  snapshot_retention_limit    = var.elasticache_snapshot_retention
  snapshot_window            = var.elasticache_snapshot_window
  
  auto_minor_version_upgrade  = true
  
  tags = {
    Name = "${var.project_name}-redis-${var.environment}"
  }
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
}

output "redis_port" {
  description = "Redis cluster port"
  value       = aws_elasticache_replication_group.redis.port
}
