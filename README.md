# PyTorch Test Infrastructure Alerting System

A production-ready alert normalization pipeline that processes CloudWatch and Grafana alerts, normalizes them into a canonical format, and automatically manages GitHub issues for incident response.

## 🏗️ Architecture Overview

```
Grafana/CloudWatch → SNS → SQS → Lambda → DynamoDB + GitHub Issues
```

**Key Features:**
- 🔄 **Alert Normalization**: Converts CloudWatch and Grafana alerts to canonical schema
- 🎯 **Intelligent Routing**: Team-based alert assignment with priority handling
- 🔍 **Alert Grouping**: Groups recurring alerts by fingerprint with fresh GitHub issues per occurrence
- 📋 **Issue Lifecycle**: Automated GitHub issue creation, updates, and closure
- 🛡️ **Resilience**: Circuit breakers, rate limiting, and graceful degradation
- ⚡ **Serverless**: Fully serverless AWS architecture with auto-scaling

## 🚀 Quick Start

### Prerequisites
- **Terraform** >= 1.6
- **AWS CLI** configured (SSO or profile)
- **Node.js** 18+ and Yarn
- **GitHub App** with issues permissions (see setup below)

### 1. Build Lambda Functions
```bash
make build
```

### 2. Deploy to Development
**Prerequisites**: AWS CLI configured with appropriate credentials for development environment

```bash
make aws-apply-dev
```

### 3. Deploy to Production
**Prerequisites**: AWS CLI configured with appropriate credentials for production environment

```bash
make aws-apply-prod

### 4. Test the Pipeline
```bash
# Tail logs in one terminal
make logs-dev

# Send test alert in another terminal
make aws-publish-dev
```

### 5. Configure Alert Sources
**Grafana Webhook:**
```bash
# Get webhook URL
cd infra && terraform output -raw external_alerts_webhook_url

# Configure in Grafana with header:
# X-Grafana-Token: <your-webhook-token>
```

**CloudWatch Alarms:**
```bash
# Get SNS topic ARN for CloudWatch alarm actions
cd infra && terraform output -raw sns_topic_arn
```

## 📁 Project Structure

```
├── infra/                    # Terraform infrastructure
│   ├── *.tf                 # AWS resource definitions
│   ├── dev.tfvars          # Development environment config
│   ├── prod.tfvars         # Production environment config
│   └── backend-*.hcl       # Remote state configuration
├── lambdas/                 # TypeScript Lambda functions
│   ├── collector/           # Main alert processing engine
│   │   ├── src/            # TypeScript source code
│   │   ├── __tests__/      # Unit tests with Vitest
│   │   └── dist/           # Compiled JavaScript (build output)
│   └── external-alerts-webhook/  # Grafana webhook endpoint
├── ReferenceData/          # Documentation and schemas
├── bootstrap/              # Infrastructure setup utilities
└── scratch/               # Development workspace
```

## 🛠️ Development Commands

### Building & Testing
```bash
# Build all Lambda functions
make build

# Clean build artifacts
make clean

# Run tests for collector Lambda
cd lambdas/collector
yarn test                    # Run unit tests
yarn test:watch             # Watch mode
yarn test:coverage          # With coverage report
yarn lint                   # TypeScript checking
```

### Deployment & Management
```bash
# Development Environment
make aws-init-dev           # Initialize Terraform backend
make aws-apply-dev          # Deploy to dev
make aws-destroy-dev        # Destroy dev resources
make logs-dev              # Tail dev Lambda logs
make aws-publish-dev       # Send test message

# Production Environment
make aws-init-prod         # Initialize Terraform backend
make aws-apply-prod        # Deploy to prod
make aws-destroy-prod      # Destroy prod resources
make logs-prod            # Tail prod Lambda logs
make aws-publish-prod     # Send test message

# Local Development (LocalStack)
make ls-apply             # Deploy to LocalStack
make ls-logs              # Tail LocalStack logs
make ls-publish           # Send test message locally
make ls-destroy           # Clean up LocalStack
```

## ⚙️ Configuration

### Environment Setup

Set variables in your tfvars files or via command line:
```bash
# In dev.tfvars or prod.tfvars
github_repo = "your-org/your-repo"
```

### GitHub App Setup

1. **Create GitHub App** in your organization:
   - Permissions: Issues (Read/Write), Metadata (Read)
   - Note the App ID and generate a private key

2. **Install App** on your target repository

3. **Store Credentials** in AWS Secrets Manager:
```bash
aws secretsmanager create-secret \
  --name "alerting-dev-alerting-app-secrets" \
  --secret-string '{
    "github_app_id": "123456",
    "github_app_key_base64": "<base64-encoded-private-key>"
  }'
```

### Webhook Configuration

**Webhook Token Setup**

**Important**: The webhook secret for each environment must be created **before** deploying the infrastructure. Terraform references it but doesn't manage it.

1. **Generate a secure token**:
```bash
# Generate a cryptographically secure token
TOKEN=$(openssl rand -base64 64)
echo "Generated token: $TOKEN"
```

2. **Create the secret** (before running terraform):
```bash
# Create the secret (adjust name for your environment)
aws secretsmanager create-secret \
  --name "alerting-$ENV-webhook-secrets" \
  --description "Authentication tokens for external webhook notifications" \
  --secret-string "{\"x-grafana-token\": \"$TOKEN\"}"
```

3. **Deploy infrastructure**:
```bash
# Now Terraform can reference the existing secret
make aws-apply-dev
```

4. **Configure Grafana notification policy** with:
   - **URL**: Get with `terraform output -raw external_alerts_webhook_url` (after `make aws-init-dev` or `make aws-init-prod`)
   - **Method**: POST
   - **Header**: `X-Grafana-Token: <your-generated-token>`

**Note**: The secret supports multiple webhook tokens. Future alert sources can be added like:
```json
{
  "x-grafana-token": "token-for-grafana",
  "x-pagerduty-signature": "token-for-pagerduty",
}
```

### Adding New Webhook Emitters

To onboard a new webhook emitter (e.g., PagerDuty, Datadog, custom services) to the alerting system:

#### 1. Update Webhook Authentication
Add the new service's authentication header and token to the webhook secret:

```bash
# Get current secret value
CURRENT_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "alerting-$ENV-webhook-secrets" \
  --query SecretString --output text)

# Add new header/token pair (example for PagerDuty)
# Generated the token via: `openssl rand -base64 64`
UPDATED_SECRET=$(echo "$CURRENT_SECRET" | jq '. + {"x-pagerduty-signature": "your-pagerduty-webhook-secret"}')

# Update the secret
aws secretsmanager update-secret \
  --secret-id "alerting-$ENV-webhook-secrets" \
  --secret-string "$UPDATED_SECRET"
```

#### 2. Configure the New Service
Point your new service webhook to the alerting system endpoint:

```bash
# Get webhook URL (make sure you've initialized the correct environment first)
# For dev environment:
make aws-init-dev
cd infra && terraform output -raw external_alerts_webhook_url

# For prod environment:
make aws-init-prod
cd infra && terraform output -raw external_alerts_webhook_url
```

Configure your service to send POST requests to this URL with the appropriate authentication header.

#### 3. Add Alert Transformation (if needed)
If the new service uses a different payload format than existing supported sources (Grafana/CloudWatch), you may need to:

1. **Add a new transformer** in `lambdas/collector/src/transformers/`
2. **Update source detection** in the collector Lambda to recognize the new format
3. **Test the transformation** with sample payloads

#### 4. Test the Integration
```bash
# Monitor logs
make logs-dev

# Send a test webhook from your new service
# Check that alerts are processed and GitHub issues are created correctly
```

#### Example: Adding PagerDuty Webhooks
```bash
# 1. Add PagerDuty webhook secret
aws secretsmanager update-secret \
  --secret-id "alerting-dev-webhook-secrets" \
  --secret-string '{
    "x-grafana-token": "existing-grafana-token",
    "x-pagerduty-signature": "your-pagerduty-secret"
  }'

# 2. Configure PagerDuty webhook
# URL: https://your-webhook-url/webhook
# Headers: X-PagerDuty-Signature: your-pagerduty-secret
# Method: POST

# 3. Test with a PagerDuty incident to verify processing
```

### Alert Source Configuration

**CloudWatch Alarms** - Add to AlarmDescription:
```
TEAM=dev-infra | PRIORITY=P1 | RUNBOOK=https://runbook.example.com
High CPU usage detected on production instances.
```

**Grafana Alerts** - Use labels:
```yaml
labels:
  team: dev-infra
  priority: P2
annotations:
  runbook_url: https://runbook.example.com
  description: Database connection pool exhausted
```

## 🏛️ Infrastructure Details

### AWS Resources Created
- **SNS Topic**: `{prefix}-alerts` - Multi-source alert ingestion
- **SQS Queue**: `{prefix}-alerts` - Alert buffering with DLQ
- **Lambda Functions**: Collector (processing) + Webhook (Grafana)
- **DynamoDB Table**: `{prefix}-alerts-state` - Alert state tracking
- **IAM Roles**: Least-privilege access for Lambda execution
- **CloudWatch**: Logs, metrics, and monitoring alarms

### Alert Deduplication & GitHub Issue Behavior

**Important**: This system creates **fresh GitHub issues** for each alert occurrence, even for recurring alerts.

**How it works:**
- **Alert Grouping**: Alerts with the same fingerprint (alert rule + resource) are grouped logically
- **DynamoDB State**: One record per unique alert fingerprint tracks the current state and most recent GitHub issue
- **GitHub Issues**: Each alert firing creates a **new GitHub issue** for clean discussion context
- **Fresh Context**: When an alert recurs after being resolved, it gets a new issue number (not reopened)

**Example behavior:**
1. Alert "CPU High" fires → Create GitHub issue #101 → DynamoDB tracks fingerprint with issue #101
2. Alert resolves → Close GitHub issue #101 → DynamoDB status = CLOSED
3. Same alert fires again → Create **NEW** GitHub issue #102 → DynamoDB tracks same fingerprint with issue #102
4. Alert resolves → Close GitHub issue #102

**Result**: Multiple GitHub issues may exist for the same logical alert, but only one DynamoDB state record per unique alert fingerprint.

### Environment Isolation
- **Development**: `us-west-2` region, `alerting-dev` prefix
- **Production**: `us-east-1` region, `alerting-prod` prefix
- **State Management**: Separate S3 backends with DynamoDB locking

### Remote State Configuration

Create backend configuration files:

**`infra/backend-dev.hcl`:**
```hcl
bucket         = "your-terraform-state-dev"
key            = "alerting/dev/terraform.tfstate"
region         = "us-west-2"
dynamodb_table = "terraform-locks-dev"
encrypt        = true
```

**`infra/backend-prod.hcl`:**
```hcl
bucket         = "your-terraform-state-prod"
key            = "alerting/prod/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks-prod"
encrypt        = true
```

## 📊 Monitoring & Observability
(Aspirational: Not yet implmented)

### CloudWatch Metrics
- **Alert Processing**: Success/failure rates by source and team
- **GitHub Integration**: API success rates and rate limiting
- **Queue Depth**: SQS and DLQ message counts
- **Processing Latency**: P50/P95/P99 response times

### CloudWatch Alarms (Auto-Created)
- **DLQ High Depth**: Failed message accumulation
- **High Error Rate**: Processing failures above threshold
- **Lambda Duration**: Function timeout approaching

### Structured Logging
All logs use structured JSON with correlation IDs:
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "messageId": "12345-abcde",
  "fingerprint": "abc123...",
  "action": "CREATE",
  "team": "dev-infra",
  "priority": "P1",
  "source": "grafana"
}
```

## 🔧 Troubleshooting

### Common Issues

**Alert not creating GitHub issue:**
1. Check CloudWatch logs for `NORMALIZED_ALERT` entries
2. Verify GitHub App installation and permissions
3. Check DynamoDB `alerts_state` table for alert state
4. Look for circuit breaker or rate limiting logs

**Missing required fields error:**
```bash
# CloudWatch alerts need TEAM and PRIORITY in AlarmDescription
TEAM=dev-infra | PRIORITY=P1 | RUNBOOK=https://...

# Grafana alerts need team and priority labels
labels:
  team: dev-infra
  priority: P2
```

**High DLQ depth:**
1. Check DLQ messages for common error patterns
2. Review CloudWatch error logs for processing failures
3. Verify alert payload format matches expected schema

### Debugging Commands
```bash
# View recent Lambda logs
aws logs tail /aws/lambda/alerting-dev-collector --follow

# Check DynamoDB alert state
aws dynamodb scan --table-name alerting-dev-alerts-state --limit 10

# View DLQ messages
aws sqs receive-message --queue-url $(terraform output -raw dlq_url)

# Test alert processing locally
cd lambdas/collector && yarn test --verbose

# Validate Terraform configuration
cd infra && terraform validate && terraform plan
```

## 🔐 Security Features

- **Input Validation**: Comprehensive sanitization and size limits
- **Authentication**: Timing-safe webhook token comparison
- **GitHub Integration**: App-based authentication with scoped permissions
- **Secret Management**: AWS Secrets Manager
- **IAM**: Least-privilege roles with resource-specific permissions

## 🧪 Testing

### Unit Tests
```bash
cd lambdas/collector
yarn test                    # Run all tests
yarn test fingerprint       # Run specific test file
yarn test --coverage        # Generate coverage report
yarn test --ui              # Interactive test UI
```

### Integration Testing
```bash
# LocalStack full pipeline test
make ls-apply
make ls-publish
make ls-logs

# Cleanup
make ls-destroy
```

### Test Data
Realistic test payloads available in `lambdas/collector/test-data/`:
- `grafana-firing.json` - Grafana alert in firing state
- `cloudwatch-alarm.json` - CloudWatch alarm notification
- `grafana-resolved.json` - Grafana alert resolution

## 🤝 Contributing

1. **Development Setup**: Follow quick start guide
2. **Testing**: Ensure tests pass (`make build && cd lambdas/collector && yarn test`)
3. **Code Style**: Use Prettier formatting (`yarn format`)
4. **Commits**: Use conventional commit format with scope prefixes
5. **Pull Requests**: Include test results and infrastructure changes

### Commit Examples
```bash
feat(collector): add circuit breaker for GitHub API resilience
fix(webhook): resolve timing attack vulnerability in auth
docs: update architecture overview with new components
test: add fingerprint edge cases for CloudWatch alarms
```

## 📜 License

This repo is BSD 3-Clause licensed, as found in the LICENSE file.

---

**Need Help?** Check the troubleshooting section above or review CloudWatch logs for detailed error information.