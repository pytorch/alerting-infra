# PyTorch Test Infrastructure Alerting System

This project implements a comprehensive alert normalization pipeline that processes CloudWatch and Grafana alerts, normalizes them into a canonical format, and creates GitHub issues for incident management.

## Project Structure
- `infra/` - Terraform infrastructure definitions (SNS, SQS, DynamoDB, Lambda, IAM)
- `lambdas/` - TypeScript Lambda functions
  - `lambdas/collector/` - Main alert processing Lambda with transformers
  - `lambdas/external-alerts-webhook/` - Webhook Lambda for Grafana integration
- `ReferenceData/` - Reference documentation and schemas
- `bootstrap/` - Infrastructure bootstrapping utilities
- `scratch/` - Development workspace

## Prerequisites
- Terraform >= 1.6
- AWS CLI configured (SSO or profile)
- Node.js 18+ and Yarn
- Optional: LocalStack + `tflocal`/`awslocal` for local testing

## Allowed Commands
The following commands are pre-approved for this project:

### Build Commands
- `make build` - Build all Lambda functions (collector + webhook)
- `make clean` - Clean all build artifacts
- `cd lambdas/collector && yarn install && yarn build` - Build collector Lambda
- `cd lambdas/collector && yarn test` - Run collector tests
- `cd lambdas/collector && yarn test:watch` - Run tests in watch mode
- `cd lambdas/collector && yarn test:coverage` - Run tests with coverage
- `cd lambdas/collector && yarn lint` - TypeScript type checking

### Deployment Commands (AWS)
- `make aws-init-dev` - Initialize Terraform backend for dev
- `make aws-init-prod` - Initialize Terraform backend for prod
- `make aws-apply-dev` - Deploy to dev environment
- `make aws-apply-prod` - Deploy to prod environment
- `make aws-destroy-dev` - Destroy dev environment
- `make aws-destroy-prod` - Destroy prod environment

### Monitoring Commands
- `make aws-logs-dev` / `make logs-dev` - Tail dev Lambda logs
- `make aws-logs-prod` / `make logs-prod` - Tail prod Lambda logs
- `make aws-publish-dev` - Send test message to dev SNS
- `make aws-publish-prod` - Send test message to prod SNS

### LocalStack Commands (Local Testing)
- `make ls-apply` - Deploy to LocalStack
- `make ls-destroy` - Destroy LocalStack deployment
- `make ls-publish` - Send test message to LocalStack SNS
- `make ls-logs` - Tail LocalStack Lambda logs

## Development Workflow
1. Use `/read-alerting` to analyze the current project state
2. Make changes to Lambda source code in `lambdas/*/src/`
3. Run `make build` to compile TypeScript
4. Test locally with `cd lambdas/collector && yarn test`
5. Deploy to dev with `make aws-apply-dev` for integration testing
6. Monitor with `make logs-dev` to verify functionality

## Architecture Overview
**Alert Flow**: Grafana/CloudWatch → SNS → SQS → Lambda → DynamoDB + GitHub Issues

- **SNS Topic**: Receives alerts from multiple sources
- **SQS Queue**: Buffers alerts with DLQ for failed processing
- **Collector Lambda**: Normalizes alerts, manages GitHub issues, tracks state
- **Webhook Lambda**: Secure endpoint for Grafana alerts
- **DynamoDB**: Stores alert state with fingerprint-based deduplication
- **GitHub App Integration**: Creates, updates, and closes issues automatically

## Key Implementation Details

### Alert Processing Flow
1. **Ingestion**: Alerts arrive via SNS (Grafana webhook or CloudWatch)
2. **Queuing**: SNS fans out to SQS with dead letter queue for failures
3. **Processing**: Collector Lambda processes batches with partial failure support
4. **Transformation**: Provider-specific transformers normalize to canonical schema
5. **Fingerprinting**: SHA-256 hash of stable alert identifiers for deduplication
6. **State Management**: DynamoDB tracks alert lifecycle with TTL
7. **GitHub Integration**: Automated issue creation/updates/closure via GitHub App

### Core Components

#### Collector Lambda (`lambdas/collector/src/`)
- **Main Handler** (`index.ts`): SQS batch processing with error handling
- **Processor** (`processor.ts`): Alert normalization pipeline orchestration
- **Transformers** (`transformers/`): Provider-specific alert parsing
  - `grafana.ts` - Grafana webhook payload transformation
  - `cloudwatch.ts` - CloudWatch SNS message transformation
  - `base.ts` - Common validation and utility functions
- **Fingerprinting** (`fingerprint.ts`): Deterministic alert identification
- **Database** (`database.ts`): DynamoDB alert state management
- **GitHub Client** (`github/githubClient.ts`): Issue lifecycle management
- **Utilities** (`utils/`): Rate limiter, circuit breaker, common functions

#### Webhook Lambda (`lambdas/external-alerts-webhook/src/`)
- **Handler** (`index.ts`): Secure Grafana webhook endpoint
- **Authentication**: Timing-safe token comparison
- **SNS Publishing**: Forwards validated payloads to alert processing

### Alert Schema & Types

#### Canonical AlertEvent Schema
```typescript
interface AlertEvent {
  schema_version: number;        // Version for future migrations
  provider_version: string;      // Provider-specific version
  source: "grafana" | "cloudwatch";
  state: "FIRING" | "RESOLVED";
  title: string;                // Normalized alert title
  description?: string;         // Optional alert description
  reason?: string;              // Provider-specific reason
  priority: "P0" | "P1" | "P2" | "P3"; // Standardized priority
  occurred_at: string;          // ISO8601 timestamp
  team: string;                 // Owning team identifier
  resource: AlertResource;      // Resource information
  identity: AlertIdentity;      // Provider identity for fingerprinting
  links: AlertLinks;           // Navigation and runbook links
  raw_provider: any;           // Original payload for debugging
}
```

#### Alert Actions
- **CREATE**: New alert, create GitHub issue
- **COMMENT**: Recurring alert, add comment to existing issue
- **CLOSE**: Resolved alert, close GitHub issue
- **SKIP_STALE**: Out-of-order or duplicate alert
- **SKIP_MANUAL_CLOSE**: Alert manually closed, skip automation

### Database Schema (DynamoDB)

#### alerts_state Table
- **Primary Key**: `fingerprint` (SHA-256 hash)
- **Attributes**:
  - `status`: "OPEN" | "CLOSED"
  - `team`, `priority`, `title`: Core alert metadata
  - `issue_number`: GitHub issue number
  - `last_provider_state_at`: Timestamp for out-of-order detection
  - `manually_closed`: Boolean flag for manual intervention
  - `ttl_expires_at`: 3-year TTL for automatic cleanup

### Error Handling & Resilience

#### Circuit Breaker Pattern
- **Purpose**: Prevent GitHub API cascading failures
- **Configuration**: Failure threshold, timeout, recovery period
- **Fallback**: Log for manual processing when circuit open

#### Rate Limiting
- **GitHub API**: 10 requests/second default with backoff
- **Implementation**: Token bucket algorithm with jitter
- **Scope**: Global rate limiting across all GitHub operations

#### Partial Batch Failure
- **SQS Integration**: Report individual message failures
- **Benefits**: Failed messages retry without affecting successful ones
- **DLQ**: Poison messages route to dead letter queue

### Infrastructure Architecture

#### AWS Resources (Terraform)
- **SNS Topic** (`aws_sns_topic.alerts`): Multi-source alert ingestion
- **SQS Queue** (`aws_sqs_queue.alerts`): Alert buffering with visibility timeout
- **DLQ** (`aws_sqs_queue.dlq`): Failed message handling
- **Lambda Functions**: Collector and webhook with proper IAM roles
- **DynamoDB Table**: Alert state with TTL and on-demand billing
- **CloudWatch**: Logs, metrics, and alarms

#### Security Implementation
- **IAM Roles**: Least-privilege access with explicit resource ARNs
- **Secrets Manager**: GitHub App credentials with rotation support
- **VPC**: Optional network isolation (not required for current setup)
- **Encryption**: At-rest and in-transit for all data

### GitHub Integration

#### GitHub App Authentication
- **Installation Tokens**: Short-lived, scoped access tokens
- **JWT Generation**: RS256 algorithm with private key
- **Token Caching**: 5-minute cache with expiration handling
- **Permissions**: Issues (read/write), metadata (read)

#### Issue Management
- **Creation**: Rich issue body with alert details and debug info
- **Labels**: Auto-created labels (Pri: P1, Team: dev-infra, etc.)
- **Comments**: Recurring alert updates with timestamps
- **Closure**: Automatic closure on resolution (unless manually closed)

### Testing Strategy

#### Unit Tests (Vitest)
- **Transformers**: Payload parsing and validation
- **Fingerprinting**: Consistency and collision resistance
- **State Management**: DynamoDB operations and edge cases
- **GitHub Client**: API interactions with mocked responses

#### Integration Tests
- **LocalStack**: Full AWS service simulation
- **End-to-End**: SNS → SQS → Lambda → DynamoDB flow
- **GitHub API**: Mocked with realistic rate limits and errors

#### Test Data
- **Realistic Payloads**: `test-data/` with actual Grafana/CloudWatch formats
- **Edge Cases**: Missing fields, malformed data, network failures
- **Fixtures**: Reusable test objects for consistent testing

### Monitoring & Observability

#### CloudWatch Metrics
- **Alert Processing**: Success/failure rates by source and team
- **GitHub API**: Success rates, rate limit hits, circuit breaker state
- **DLQ Depth**: Failed message accumulation
- **Processing Latency**: P50, P95, P99 latencies

#### Structured Logging
- **JSON Format**: Consistent log structure for parsing
- **Correlation IDs**: Message ID tracking through pipeline
- **Debug Context**: Comprehensive error context with alert details
- **Security**: No secrets or credentials in logs

#### Alerting
- **DLQ Alarms**: High message count indicates processing issues
- **Error Rate Alarms**: High failure rates in transformation/GitHub
- **Latency Alarms**: Processing time exceeding thresholds

### Configuration Management

#### Environment Variables
- `STATUS_TABLE_NAME`: DynamoDB table name
- `GITHUB_REPO`: Target repository (org/repo format)
- `GITHUB_APP_SECRET_ID`: Secrets Manager secret name
- `ENABLE_GITHUB_ISSUES`: Feature flag for GitHub integration

#### Terraform Variables
- `aws_region`: Deployment region
- `name_prefix`: Resource naming prefix
- `github_repo`: Target repository
- `enable_github_issues`: Boolean feature flag
- `webhook_grafana_token`: Shared secret for webhook auth

### Development Patterns

#### Adding New Alert Sources
1. Create transformer in `lambdas/collector/src/transformers/`
2. Extend source detection in `detectAlertSource()`
3. Add fingerprint logic in `fingerprint.ts`
4. Create test fixtures and unit tests
5. Update infrastructure for new SNS sources

#### Debugging Alert Processing
1. Check CloudWatch logs for structured JSON events
2. Look for `NORMALIZED_ALERT` log entries with full context
3. Verify DynamoDB state in `alerts_state` table
4. Check GitHub issue creation/updates
5. Monitor DLQ for failed messages

#### Performance Optimization
- **Batch Size**: SQS batch size vs processing time tradeoff
- **Memory**: Lambda memory allocation based on payload size
- **Concurrency**: Reserved concurrency to prevent resource exhaustion
- **Caching**: Secret and token caching with appropriate TTLs

## Security & Best Practices
All changes should maintain security best practices including:

### Input Validation & Sanitization
- **Size Limits**: Prevent DoS with reasonable payload limits (4KB descriptions)
- **Field Validation**: Strict type checking with allowlists
- **HTML Encoding**: Sanitize user-provided content for GitHub
- **Schema Validation**: Runtime validation against TypeScript interfaces

### Authentication & Authorization
- **Timing-Safe Comparisons**: Prevent timing attack vulnerabilities
- **GitHub App Tokens**: Use installation tokens, not personal access
- **Secret Rotation**: Support for GitHub App key rotation
- **Least Privilege**: Minimal IAM permissions with explicit resources

### Error Handling & Resilience
- **Circuit Breakers**: Prevent cascading failures
- **Rate Limiting**: Respect external API limits
- **Graceful Degradation**: Continue processing when GitHub unavailable
- **Comprehensive Logging**: Full context for debugging without secrets

### Infrastructure Security
- **Encryption**: At-rest (DynamoDB, S3) and in-transit (HTTPS, TLS)
- **Network Isolation**: VPC endpoints when required
- **Secret Management**: AWS Secrets Manager with rotation
- **IAM Policies**: Resource-specific permissions with conditions