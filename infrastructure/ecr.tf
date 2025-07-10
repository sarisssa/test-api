resource "aws_ecr_repository" "backend_api_repo" {
  #Remove prd from ecr_repository
  name                 = "${var.project_name}-backend-api-${var.environment}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "${title(var.project_name)} Backend API Images"
    Purpose = "Docker images for the main backend API"
    Service = "ECR"
  }
}

