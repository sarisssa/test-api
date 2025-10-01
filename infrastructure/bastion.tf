# Bastion Host for Development Access to Private Resources
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_iam_role" "bastion_role" {
  name = "${var.project_name}-bastion-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-bastion-role-${var.environment}"
  }
}

resource "aws_iam_role_policy_attachment" "bastion_ssm_policy" {
  role       = aws_iam_role.bastion_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion_profile" {
  name = "${var.project_name}-bastion-profile-${var.environment}"
  role = aws_iam_role.bastion_role.name

  tags = {
    Name = "${var.project_name}-bastion-profile-${var.environment}"
  }
}

# Security group for bastion host
resource "aws_security_group" "bastion_sg" {
  name        = "${var.project_name}-bastion-sg-${var.environment}"
  description = "Security group for bastion host - allows outbound access to private resources"
  vpc_id      = aws_vpc.main_vpc.id

  # Allow outbound access to ElastiCache
  egress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "Redis access within VPC"
  }

  # Allow all outbound HTTPS for package updates and SSM
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS outbound for SSM and updates"
  }

  # Allow all outbound HTTP for package updates
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP outbound for package updates"
  }

  # Allow DNS
  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "DNS resolution"
  }

  tags = {
    Name = "${var.project_name}-bastion-sg-${var.environment}"
  }
}

# Update ElastiCache security group to allow access from bastion
resource "aws_security_group_rule" "elasticache_from_bastion" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion_sg.id
  security_group_id        = aws_security_group.elasticache.id
  description              = "Redis access from bastion host"
}

# Bastion EC2 instance
resource "aws_instance" "bastion" {
  count = var.enable_bastion ? 1 : 0

  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.bastion_instance_type
  subnet_id              = aws_subnet.private_us_east_1a.id
  vpc_security_group_ids = [aws_security_group.bastion_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.bastion_profile.name

  # User data to ensure SSM agent is running
  user_data = base64encode(<<-EOF
    #!/bin/bash
    yum update -y
    yum install -y amazon-ssm-agent
    systemctl enable amazon-ssm-agent
    systemctl start amazon-ssm-agent
    
    # Install useful tools
    yum install -y telnet nc redis
    
    # Create a simple Redis connection test script
    cat > /home/ec2-user/test-redis.sh << 'SCRIPT'
    #!/bin/bash
    echo "Testing Redis connection..."
    redis-cli -h ${aws_elasticache_replication_group.redis.primary_endpoint_address} -p 6379 ping
    SCRIPT
    chmod +x /home/ec2-user/test-redis.sh
    chown ec2-user:ec2-user /home/ec2-user/test-redis.sh
  EOF
  )

  tags = {
    Name        = "${var.project_name}-bastion-${var.environment}"
    Purpose     = "Development access to private resources"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Outputs
output "bastion_instance_id" {
  description = "Instance ID of the bastion host"
  value       = var.enable_bastion ? aws_instance.bastion[0].id : null
}

output "bastion_private_ip" {
  description = "Private IP address of the bastion host"
  value       = var.enable_bastion ? aws_instance.bastion[0].private_ip : null
}

output "redis_connection_command" {
  description = "Command to connect to Redis through the bastion host"
  value = var.enable_bastion ? "aws ssm start-session --target ${aws_instance.bastion[0].id} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{\"host\":[\"${aws_elasticache_replication_group.redis.primary_endpoint_address}\"],\"portNumber\":[\"6379\"],\"localPortNumber\":[\"6379\"]}' --region ${var.aws_region}" : null
}
