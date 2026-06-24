# Backend (S3 + DynamoDB) for OpenTofu state — shared for dev/prod
# Edit these before running bootstrap.sh
aws_region     = "us-east-1"
bucket_name    = "tf-state-alerting-pt-dev" # must be globally unique
env            = "dev"
