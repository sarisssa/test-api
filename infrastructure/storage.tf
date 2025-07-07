resource "aws_s3_bucket" "avatar_profiles" {
  bucket = "${var.project_name}-avatar-profile-images-${var.environment}"

  tags = {
    Name    = "${title(var.project_name)} Avatar Profile Images"
    Service = "Storage"
  }
}

resource "aws_s3_bucket_versioning" "avatar_profiles_versioning" {
  bucket = aws_s3_bucket.avatar_profiles.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "avatar_profiles_public_access_block" {
  bucket = aws_s3_bucket.avatar_profiles.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}