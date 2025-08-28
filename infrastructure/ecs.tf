# --- Data Sources ---
data "aws_caller_identity" "current" {}

# --- IAM Roles & Policies ---
# Task Execution Role 
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.project_name}-ecs-task-execution-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-task-execution-role-${var.environment}"
  }
}

# Attach the necessary permissions for ECS tasks to perform core operations
resource "aws_iam_role_policy_attachment" "ecs_task_execution_policy_attach" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task Role (for application permissions)
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.project_name}-ecs-task-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-task-role-${var.environment}"
  }
}

resource "aws_iam_role_policy" "ecs_task_s3_policy" {
  name = "${var.project_name}-ecs-task-s3-policy-${var.environment}"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ],
        Resource = [
          aws_s3_bucket.profile_images.arn,
          "${aws_s3_bucket.profile_images.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_task_exec_policy" {
  name = "${var.project_name}-ecs-task-exec-policy-${var.environment}"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel"
        ],
        Resource = "*"
      }
    ]
  })
}

# resource "aws_iam_role_policy" "ecs_task_secrets_policy" {
#   name = "${var.project_name}-ecs-task-secrets-policy-${var.environment}"
#   role = aws_iam_role.ecs_task_role.id

#   policy = jsonencode({
#     Version = "2012-10-17",
#     Statement = [
#       {
#         Effect = "Allow",
#         Action = [
#           "secretsmanager:GetSecretValue"
#         ],
#         Resource = [for secret in aws_secretsmanager_secret.app_config : secret.arn]
#       }
#     ]
#   })
# }

# --- Logging Configuration ---
resource "aws_cloudwatch_log_group" "backend_log_group" {
  name              = "/ecs/${var.project_name}-backend-api-${var.environment}"
  retention_in_days = 60

  tags = {
    Name    = "${var.project_name}-backend-api-log-group-${var.environment}"
    Service = "Monitoring"
  }
}

# --- Network Security ---
resource "aws_security_group" "backend_fargate_sg" {
  vpc_id      = aws_vpc.main_vpc.id
  name        = "${var.project_name}-backend-fargate-sg-${var.environment}"
  description = "Allow inbound access to Fargate tasks and outbound to internet"

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.backend_alb_sg.id]
    description     = "Allow HTTP/HTTPS from ALB"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "${var.project_name}-backend-fargate-sg-${var.environment}"
  }
}

resource "aws_security_group" "backend_alb_sg" {
  vpc_id      = aws_vpc.main_vpc.id
  name        = "${var.project_name}-backend-alb-sg-${var.environment}"
  description = "Allow HTTP/HTTPS inbound to ALB"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTP traffic"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow HTTPS traffic"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "${var.project_name}-backend-alb-sg-${var.environment}"
  }
}

# --- ALB Configuration ---
resource "aws_lb" "backend_alb" {
  name               = "${var.project_name}-backend-alb-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.backend_alb_sg.id]
  subnets            = [aws_subnet.public_us_east_1a.id, aws_subnet.public_us_east_1c.id]

  tags = {
    Name = "${var.project_name}-backend-alb-${var.environment}"
  }
}

resource "aws_lb_target_group" "backend_tg" {
  name        = "${var.project_name}-backend-tg-${var.environment}"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main_vpc.id
  target_type = "ip"

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${var.project_name}-backend-tg-${var.environment}"
  }
}

resource "aws_lb_listener" "backend_http_listener" {
  load_balancer_arn = aws_lb.backend_alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = {
    Name = "${var.project_name}-backend-http-listener-${var.environment}"
  }
}

resource "aws_lb_listener" "backend_https_listener" {
  load_balancer_arn = aws_lb.backend_alb.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-Res-2021-06"
  certificate_arn   = aws_acm_certificate.api_cert.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend_tg.arn
  }

  tags = {
    Name = "${var.project_name}-backend-https-listener-${var.environment}"
  }

  depends_on = [
    aws_acm_certificate_validation.cert_validation
  ]
}


# --- ECS Cluster ---
resource "aws_ecs_cluster" "backend_cluster" {
  name = "${var.project_name}-backend-cluster-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name    = "${var.project_name}-backend-cluster-${var.environment}"
    Service = "ECS"
  }
}

# --- ECS Task Definition ---
resource "aws_ecs_task_definition" "backend_task" {
  family                   = "${var.project_name}-backend-task-family-${var.environment}"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "${var.project_name}-backend-api"
      image     = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/${resource.aws_ecr_repository.backend_api_repo.name}:latest"
      cpu       = var.ecs_task_cpu
      memory    = var.ecs_task_memory
      essential = true
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = resource.aws_cloudwatch_log_group.backend_log_group.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "PORT"
          value = "3000"
        },
        {
          name  = "TWELVE_DATA_API_KEY"
          value = var.twelve_data_api_key
        },
        {
    name  = "JWT_SECRET"
    value = var.jwt_secret
  },
  {
    name  = "TWILIO_ACCOUNT_SID"
    value = var.twilio_account_sid
  },
  {
    name  = "TWILIO_AUTH_TOKEN"
    value = var.twilio_auth_token
  },
  {
    name  = "TWILIO_VERIFY_SERVICE_SID"
    value = var.twilio_verify_service_sid
  },
  {
    name  = "PHONE_HASH_SALT"
    value = var.phone_hash_salt
  },
  {
    name  = "REDIS_URL"
    value = "redis://${aws_elasticache_replication_group.redis.configuration_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
  },
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-backend-task-${var.environment}"
  }
}

# --- ECS Service ---
resource "aws_ecs_service" "backend_service" {
  name                              = "${var.project_name}-backend-service-${var.environment}"
  cluster                           = aws_ecs_cluster.backend_cluster.id
  task_definition                   = aws_ecs_task_definition.backend_task.arn
  desired_count                     = var.ecs_service_desired_count
  launch_type                       = "FARGATE"
  scheduling_strategy               = "REPLICA"
  health_check_grace_period_seconds = 60
  enable_execute_command            = true


  lifecycle {
    ignore_changes = [desired_count]
  }

  network_configuration {
    subnets          = [aws_subnet.private_us_east_1a.id, aws_subnet.private_us_east_1c.id]
    security_groups  = [aws_security_group.backend_fargate_sg.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend_tg.arn
    container_name   = "${var.project_name}-backend-api"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  tags = {
    Name    = "${var.project_name}-backend-service-${var.environment}"
    Service = "ECS"
  }

  depends_on = [
    aws_lb_listener.backend_http_listener,
    aws_lb_listener.backend_https_listener,
    aws_iam_role_policy_attachment.ecs_task_execution_policy_attach
  ]
}