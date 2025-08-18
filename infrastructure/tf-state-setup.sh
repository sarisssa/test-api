#!/bin/bash


# --- Configuration Variables ---
# Set the environment (e.g., dev, stage, prod).
# This variable will determine the naming of your S3 bucket and DynamoDB table.
# Usage: ./bootstrap.sh <env> (e.g., ./bootstrap.sh dev)
# If not provided, it will default to 'dev'.
ENV="${1:-dev}"

# IMPORTANT: Base names and region. The 'env' variable will be appended.
BASE_S3_BUCKET_NAME="wage-terraform-state"
BASE_DYNAMODB_TABLE_NAME="wage-terraform-state-lock"
AWS_REGION="us-east-1" # Or your desired region (e.g., us-east-2, eu-east-1)

# Derived names based on the environment
S3_BUCKET_NAME="${BASE_S3_BUCKET_NAME}-${ENV}-${AWS_REGION}"
DYNAMODB_TABLE_NAME="${BASE_DYNAMODB_TABLE_NAME}-${ENV}"

# --- Colors for better output (optional) ---
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Function to check if a command succeeded ---
check_command() {
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: $1 failed. Exiting.${NC}"
        exit 1
    fi
}

echo -e "${GREEN}--- Starting Terraform State Backend Bootstrapping ---${NC}"
echo "Environment: ${ENV}"
echo "S3 Bucket Name: ${S3_BUCKET_NAME}"
echo "DynamoDB Table Name: ${DYNAMODB_TABLE_NAME}"
echo "AWS Region: ${AWS_REGION}"
echo ""

# --- Part 1: Create S3 Bucket ---
echo -e "${GREEN}1. Creating S3 bucket: ${S3_BUCKET_NAME} in ${AWS_REGION}${NC}"

# Check if bucket already exists
if aws s3api head-bucket --bucket "${S3_BUCKET_NAME}" --region "${AWS_REGION}" 2>/dev/null; then
    echo "S3 bucket '${S3_BUCKET_NAME}' already exists. Skipping creation."
else
    # For regions other than us-east-1, include --create-bucket-configuration
    # For us-east-1, LocationConstraint is not needed.
    if [ "${AWS_REGION}" == "us-east-1" ]; then
        aws s3api create-bucket \
            --bucket "${S3_BUCKET_NAME}" \
            --region "${AWS_REGION}"
    else
        aws s3api create-bucket \
            --bucket "${S3_BUCKET_NAME}" \
            --region "${AWS_REGION}" \
            --create-bucket-configuration LocationConstraint="${AWS_REGION}"
    fi
    check_command "S3 bucket creation"
    echo -e "${GREEN}S3 bucket created successfully.${NC}"
fi


echo -e "${GREEN}2. Enabling versioning on ${S3_BUCKET_NAME}${NC}"
aws s3api put-bucket-versioning \
    --bucket "${S3_BUCKET_NAME}" \
    --versioning-configuration Status=Enabled
check_command "S3 bucket versioning enablement"
echo -e "${GREEN}Versioning enabled.${NC}"

echo -e "${GREEN}3. Enabling default encryption (SSE-S3) on ${S3_BUCKET_NAME}${NC}"
aws s3api put-bucket-encryption \
    --bucket "${S3_BUCKET_NAME}" \
    --server-side-encryption-configuration '{"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]}'
check_command "S3 bucket encryption enablement"
echo -e "${GREEN}Default encryption enabled.${NC}"

echo -e "${GREEN}4. Blocking all public access for ${S3_BUCKET_NAME}${NC}"
aws s3api put-public-access-block \
    --bucket "${S3_BUCKET_NAME}" \
    --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
check_command "S3 public access block configuration"
echo -e "${GREEN}Public access blocked.${NC}"

echo -e "${GREEN}5. Adding tags to ${S3_BUCKET_NAME}${NC}"
aws s3api put-bucket-tagging \
    --bucket "${S3_BUCKET_NAME}" \
    --tagging '{"TagSet": [
        {"Key": "Name", "Value": "terraform-state-'${ENV}'"},
        {"Key": "Environment", "Value": "'${ENV}'"},
        {"Key": "Project", "Value": "core-infrastructure"},
        {"Key": "ManagedBy", "Value": "Terraform-Bootstrap"},
        {"Key": "Owner", "Value": "devops-team"},
        {"Key": "CostCenter", "Value": "12345"},
        {"Key": "DoNotDelete", "Value": "true"}
    ]}'
check_command "S3 bucket tagging"
echo -e "${GREEN}Tags added to S3 bucket.${NC}"


# --- Part 2: Create DynamoDB Table ---
echo -e "${GREEN}6. Creating DynamoDB table for state locking: ${DYNAMODB_TABLE_NAME} in ${AWS_REGION}${NC}"

# Check if DynamoDB table already exists
if aws dynamodb describe-table --table-name "${DYNAMODB_TABLE_NAME}" --region "${AWS_REGION}" 2>/dev/null; then
    echo "DynamoDB table '${D3NAMODB_TABLE_NAME}' already exists. Skipping creation."
else
    aws dynamodb create-table \
        --table-name "${DYNAMODB_TABLE_NAME}" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --tags \
            Key=Name,Value=terraform-state-lock-${ENV} \
            Key=Environment,Value=${ENV} \
            Key=Project,Value=core-infrastructure \
            Key=ManagedBy,Value=Terraform-Bootstrap \
            Key=Owner,Value=devops-team \
            Key=CostCenter,Value=12345 \
            Key=DoNotDelete,Value=true \
        --region "${AWS_REGION}"
    check_command "DynamoDB table creation"
    echo -e "${GREEN}DynamoDB table created successfully.${NC}"
fi


echo -e "${GREEN}7. Waiting for DynamoDB table to become active...${NC}"
aws dynamodb wait table-exists \
    --table-name "${DYNAMODB_TABLE_NAME}" \
    --region "${AWS_REGION}"
check_command "DynamoDB table active check"
echo -e "${GREEN}DynamoDB table '${DYNAMODB_TABLE_NAME}' is now active.${NC}"

echo -e "${GREEN}--- Terraform State Backend Bootstrapping Complete! ---${NC}"
echo ""
echo "Next steps:"
echo "1. Update your main Terraform project's backend configuration:"
echo "   terraform {"
echo "     backend \"s3\" {"
echo "       bucket         = \"${S3_BUCKET_NAME}\""
echo "       key            = \"path/to/your/environment/terraform.tfstate\""
echo "       region         = \"${AWS_REGION}\""
echo "       dynamodb_table = \"${DYNAMODB_TABLE_NAME}\""
echo "       encrypt        = true"
echo "       acl            = \"private\""
echo "     }"
echo "   }"
echo "2. Run 'terraform init' in your main Terraform project directory."