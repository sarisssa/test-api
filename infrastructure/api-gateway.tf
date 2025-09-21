resource "aws_apigatewayv2_api" "websocket_api" {
  name          = "${var.project_name}-websocket-api-${var.environment}"
  protocol_type = "WEBSOCKET"
  route_selection_expression = "$request.body.action"

  tags = {
    Name = "${var.project_name}-websocket-api-${var.environment}"
  }
}

resource "aws_apigatewayv2_stage" "websocket_stage" {
  api_id      = aws_apigatewayv2_api.websocket_api.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.websocket_api_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      extendedRequestId = "$context.extendedRequestId"
      ip             = "$context.identity.sourceIp"
      caller         = "$context.identity.caller"
      user           = "$context.identity.user"
      requestTime    = "$context.requestTime"
      eventType      = "$context.eventType"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      connectionId   = "$context.connectionId"
      error = {
        message      = "$context.error.message"
        messageString = "$context.error.messageString"
      }
    })
  }

  tags = {
    Name = "${var.project_name}-websocket-stage-${var.environment}"
  }
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id           = aws_apigatewayv2_api.websocket_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.websocket_handler.invoke_arn
}

resource "aws_apigatewayv2_route" "connect_route" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "disconnect_route" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "default_route" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_cloudwatch_log_group" "websocket_api_logs" {
  name              = "/aws/apigateway/${aws_apigatewayv2_api.websocket_api.name}"
  retention_in_days = var.api_gateway_log_retention_days
}