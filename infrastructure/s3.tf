
resource "aws_s3_bucket" "profile_images" {
  bucket = "${var.project_name}-profile-images-${var.environment}"

  tags = {
    Name        = "${var.project_name}-profile-images-${var.environment}"
    Purpose     = "ProfileImages"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "profile_images" {
  bucket = aws_s3_bucket.profile_images.id
  versioning_configuration {
    status = var.s3_versioning_enabled ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "profile_images" {
  bucket = aws_s3_bucket.profile_images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "profile_images" {
  bucket = aws_s3_bucket.profile_images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "profile_images" {
  bucket = aws_s3_bucket.profile_images.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "POST", "PUT", "DELETE", "HEAD"]
    allowed_origins = var.s3_cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "profile_images" {
  bucket = aws_s3_bucket.profile_images.id

  rule {
    id     = "profile_images_lifecycle"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    # Transition to IA after 30 days (for non-production)
    dynamic "transition" {
      for_each = var.environment != "prd" ? [1] : []
      content {
        days          = 30
        storage_class = "STANDARD_IA"
      }
    }

    # Delete old versions after specified days
    noncurrent_version_expiration {
      noncurrent_days = var.s3_old_version_expiry_days
    }
  }
}

# S3 bucket notification removed - not needed based on actual usage
# Profile image uploads don't require immediate processing

# IAM policy for S3 bucket access
resource "aws_iam_policy" "s3_profile_images_policy" {
  name        = "${var.project_name}-s3-profile-images-policy-${var.environment}"
  description = "Policy for accessing profile images S3 bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.profile_images.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = aws_s3_bucket.profile_images.arn
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-s3-profile-images-policy-${var.environment}"
  }
}

# CloudFront distribution for S3 bucket (optional, for production)
resource "aws_cloudfront_distribution" "profile_images" {
  count = var.enable_cloudfront ? 1 : 0

  origin {
    domain_name              = aws_s3_bucket.profile_images.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.profile_images.bucket}"
    origin_access_control_id = aws_cloudfront_origin_access_control.profile_images[0].id
  }

  enabled = true
  comment = "CloudFront distribution for ${var.project_name} profile images ${var.environment}"

  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.profile_images.bucket}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project_name}-profile-images-cdn-${var.environment}"
  }
}

# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "profile_images" {
  count = var.enable_cloudfront ? 1 : 0

  name                              = "${var.project_name}-profile-images-oac-${var.environment}"
  description                       = "OAC for profile images S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# S3 bucket policy for CloudFront access
resource "aws_s3_bucket_policy" "profile_images_cloudfront" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.profile_images.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.profile_images.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.profile_images[0].arn
          }
        }
      }
    ]
  })
}

# Outputs
output "s3_profile_images_bucket_name" {
  description = "Name of the profile images S3 bucket"
  value       = aws_s3_bucket.profile_images.bucket
}

output "s3_profile_images_bucket_arn" {
  description = "ARN of the profile images S3 bucket"
  value       = aws_s3_bucket.profile_images.arn
}

output "s3_profile_images_bucket_domain_name" {
  description = "Domain name of the profile images S3 bucket"
  value       = aws_s3_bucket.profile_images.bucket_domain_name
}

output "s3_profile_images_bucket_regional_domain_name" {
  description = "Regional domain name of the profile images S3 bucket"
  value       = aws_s3_bucket.profile_images.bucket_regional_domain_name
}

output "cloudfront_profile_images_domain_name" {
  description = "Domain name of the CloudFront distribution for profile images"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.profile_images[0].domain_name : null
}

output "s3_profile_images_policy_arn" {
  description = "ARN of the IAM policy for S3 profile images access"
  value       = aws_iam_policy.s3_profile_images_policy.arn
}
