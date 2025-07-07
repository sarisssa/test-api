#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Function to display usage
show_usage() {
    echo "Usage: $0 <environment> [command]"
    echo "Environment: dev, prd"
    echo "Commands: plan (default), apply, destroy, output, refresh"
    echo ""
    echo "Examples:"
    echo "  $0 dev         # Runs terraform plan for dev"
    echo "  $0 prd apply   # Runs terraform apply for prd"
    exit 1
}

# Check if an environment argument is provided
if [ -z "$1" ]; then
    show_usage
fi

TF_ENV="$1"
TF_CMD=${2:-plan}  # Default to 'plan' if no command provided
VAR_FILE="environments/${TF_ENV}.tfvars"

case "$TF_ENV" in
    dev|prd) ;;
    *)
        echo "Error: Invalid environment '${TF_ENV}'. Must be 'dev' or 'prd'"
        show_usage
        ;;
esac

case "$TF_CMD" in
    init|plan|apply|destroy|output|refresh) ;;
    *)
        echo "Error: Invalid command '${TF_CMD}'"
        show_usage
        ;;
esac

echo "Running terraform ${TF_CMD} for environment: ${TF_ENV} using ${VAR_FILE}"

if [ ! -f "$VAR_FILE" ]; then
    echo "Error: Variable file '${VAR_FILE}' not found."
    exit 1
fi

# Add confirmation for destructive commands
if [ "$TF_CMD" == "apply" ] || [ "$TF_CMD" == "destroy" ]; then
    read -p "Are you sure you want to run terraform ${TF_CMD} in ${TF_ENV}? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Operation cancelled"
        exit 1
    fi
fi

# Run Terraform command
terraform ${TF_CMD} -var-file="$VAR_FILE"


# ${variables.ENV} // dev or prd

# terraform plan -var-file="${variables.ENV}.tfvars"