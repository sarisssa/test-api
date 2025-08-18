
resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.project_name}-api-gateway-${var.environment}"
  description = "Main API Gateway for ${var.project_name} ${var.environment}"
  
  endpoint_configuration {
    types = [var.api_gateway_endpoint_type]
  }

  tags = {
    Name = "${var.project_name}-api-${var.environment}"
  }
}

resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  # Ensure deployment happens after method configurations
  depends_on = [
    aws_api_gateway_method.proxy,
    aws_api_gateway_integration.proxy
  ]

  lifecycle {
    create_before_destroy = true
  }
}

# API Gateway stage
resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.environment

  # Enable logging
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip            = "$context.identity.sourceIp"
      caller        = "$context.identity.caller"
      user          = "$context.identity.user"
      requestTime   = "$context.requestTime"
      httpMethod    = "$context.httpMethod"
      resourcePath  = "$context.resourcePath"
      status        = "$context.status"
      protocol      = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }

  # Enable X-Ray tracing for production
  xray_tracing_enabled = var.environment == "prd"

  tags = {
    Name = "${var.project_name}-api-stage-${var.environment}"
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}"
  retention_in_days = var.api_gateway_log_retention_days

  tags = {
    Name = "${var.project_name}-api-gateway-logs-${var.environment}"
  }
}

# API Gateway resource for proxy
resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "{proxy+}"
}

# API Gateway method for proxy
resource "aws_api_gateway_method" "proxy" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"

    request_parameters = {
    "method.request.path.proxy" = true
  }
}

# API Gateway integration - assuming integration with ALB
resource "aws_api_gateway_integration" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.proxy.id
  http_method = aws_api_gateway_method.proxy.http_method

  integration_http_method = "ANY"
  type                   = "HTTP_PROXY"
  uri                    = "http://${aws_lb.backend_alb.dns_name}/{proxy}"

  request_parameters = {
    "integration.request.path.proxy" = "method.request.path.proxy"
  }
}

# API Gateway method for root
resource "aws_api_gateway_method" "root" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_rest_api.main.root_resource_id
  http_method   = "ANY"
  authorization = "NONE"
}

# API Gateway integration for root
resource "aws_api_gateway_integration" "root" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_rest_api.main.root_resource_id
  http_method = aws_api_gateway_method.root.http_method

  integration_http_method = "ANY"
  type                   = "HTTP_PROXY"
  uri                    = "http://${aws_lb.backend_alb.dns_name}/"
}

# API Gateway domain name (if custom domain is configured)
resource "aws_api_gateway_domain_name" "main" {
  count           = var.api_gateway_custom_domain != "" ? 1 : 0
  domain_name     = var.api_gateway_custom_domain
  certificate_arn = var.api_gateway_certificate_arn

  endpoint_configuration {
    types = [var.api_gateway_endpoint_type]
  }

  tags = {
    Name = "${var.project_name}-api-domain-${var.environment}"
  }
}

# API Gateway base path mapping
resource "aws_api_gateway_base_path_mapping" "main" {
  count       = var.api_gateway_custom_domain != "" ? 1 : 0
  api_id      = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  domain_name = aws_api_gateway_domain_name.main[0].domain_name
}

# Usage plan for API throttling
resource "aws_api_gateway_usage_plan" "main" {
  name = "${var.project_name}-usage-plan-${var.environment}"

  api_stages {
    api_id = aws_api_gateway_rest_api.main.id
    stage  = aws_api_gateway_stage.main.stage_name
  }

  quota_settings {
    limit  = var.api_gateway_quota_limit
    period = var.api_gateway_quota_period
  }

  throttle_settings {
    rate_limit  = var.api_gateway_rate_limit
    burst_limit = var.api_gateway_burst_limit
  }

  tags = {
    Name = "${var.project_name}-usage-plan-${var.environment}"
  }
}

