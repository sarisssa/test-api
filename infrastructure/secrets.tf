# resource "aws_secretsmanager_secret" "app_config" {
#   for_each = local.app_secrets

#   name = "${var.project_name}-${var.environment}-${each.key}"

#   description = "${each.value.description} for ${var.project_name} ${var.environment}"

#   tags = {
#     Name    = "${var.project_name}-${var.environment}-${each.key}"
#     Service = each.value.service_tag

#   }

#   recovery_window_in_days = 30
# }