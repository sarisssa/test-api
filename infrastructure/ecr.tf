resource "aws_ecr_repository" "backend_api_repo" {
  name                 = "${var.project_name}-backend-ecr"
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

