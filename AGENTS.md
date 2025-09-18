# Alerting Infrastructure Repository Guidelines

## Project Structure & Module Organization
- `infra/` - Terraform infrastructure definitions
  - Core AWS resources: SNS topics, SQS queues, Lambda functions, DynamoDB tables
  - IAM roles and policies with least-privilege access
  - Environment-specific configurations (`dev.tfvars`, `prod.tfvars`)
- `lambdas/` - TypeScript Lambda function implementations
  - `collector/` - Main alert processing engine with transformers
  - `external-alerts-webhook/` - Secure webhook endpoint for Grafana
- `ReferenceData/` - Schema documentation and reference materials
- `bootstrap/` - Infrastructure bootstrapping and setup utilities
- `scratch/` - Development workspace and experimental code

## Architecture Overview
### Alert Processing Pipeline
The system implements a serverless event-driven architecture:

1. **Ingestion**: Grafana and CloudWatch alerts → SNS topics
2. **Buffering**: SNS → SQS queue (with DLQ for error handling)
3. **Processing**: SQS → Collector Lambda (TypeScript/Node.js)
4. **Normalization**: Provider-specific transformers create canonical AlertEvent schema
5. **State Management**: DynamoDB stores alert state with fingerprint-based deduplication
6. **Issue Management**: GitHub App integration for automated issue lifecycle

### Key Components
- **Collector Lambda**: Alert normalization, fingerprinting, GitHub issue management
- **Webhook Lambda**: Secure Grafana webhook with timing-safe authentication
- **Circuit Breaker**: Resilience pattern for GitHub API failures
- **Rate Limiter**: API call throttling to respect service limits

## Build, Test, and Development Commands
### Building
- `make build` - Build all Lambda functions with esbuild
- `make clean` - Remove all build artifacts and zip files
- Individual Lambda build: `cd lambdas/collector && yarn build`

### Testing
- `cd lambdas/collector && yarn test` - Run unit tests with Vitest
- `yarn test:watch` - Run tests in watch mode
- `yarn test:coverage` - Generate coverage reports
- `yarn test:ui` - Run tests with Vitest UI
- `yarn lint` - TypeScript type checking with tsc

### Deployment
- `make aws-apply-dev` / `make aws-apply-prod` - Deploy to AWS environments
- `make ls-apply` - Deploy to LocalStack for local testing
- `make aws-logs-dev` / `make logs-prod` - Tail Lambda logs

## Coding Style & Naming Conventions
### TypeScript/JavaScript
- **Formatting**: Prettier with project configuration
- **Type Safety**: Strict TypeScript with comprehensive interfaces
- **File Structure**:
  - `src/` - Source code with logical module separation
  - `__tests__/` - Co-located test files with `.test.ts` suffix
  - `dist/` - Build output (git-ignored)
- **Naming**:
  - Files: kebab-case for utilities, PascalCase for classes
  - Variables: camelCase
  - Types/Interfaces: PascalCase with descriptive names
  - Constants: SCREAMING_SNAKE_CASE

### Infrastructure as Code
- **Terraform**: Standard HCL formatting with `terraform fmt`
- **Resource naming**: `{environment}-{service}-{resource}` pattern
- **Variables**: snake_case with descriptive names and validation

## Testing Guidelines
### Unit Testing
- **Framework**: Vitest for TypeScript Lambda functions
- **Mocking**: AWS SDK client mocking with `aws-sdk-client-mock`
- **Test Structure**: Arrange-Act-Assert pattern with descriptive test names
- **Coverage**: Aim for >80% coverage on core business logic

### Integration Testing
- **LocalStack**: Use for full AWS service simulation
- **Test Data**: Realistic payloads in `test-data/` directories
- **GitHub API**: Mock with appropriate response codes and rate limits

### Test Examples
```typescript
// Good: Descriptive test names
it('should generate consistent fingerprints for identical alerts')
it('should handle CloudWatch SNS message format correctly')
it('should respect rate limits when creating GitHub issues')
```

## Error Handling & Resilience Patterns
### Circuit Breaker Implementation
- **Purpose**: Prevent cascading failures from GitHub API issues
- **Configuration**: Configurable failure thresholds and recovery timeouts
- **Fallback**: Graceful degradation with manual processing logs

### Retry Logic
- **Transient Errors**: Exponential backoff for network/API failures
- **Permanent Errors**: Fast-fail to DLQ for manual inspection
- **Partial Batch Failures**: SQS batch item failure reporting

## Commit & Pull Request Guidelines
### Commit Messages
- **Format**: Conventional commits with scope prefixes
- **Examples**:
  - `feat(collector): add circuit breaker for GitHub API`
  - `fix(webhook): resolve timing attack vulnerability`
  - `docs: update architecture overview`
  - `test: add fingerprint generation edge cases`

### Pull Requests
- **Description**: Clear problem statement and solution approach
- **Testing**: Include test results and coverage changes
- **Infrastructure**: Terraform plan output for infrastructure changes
- **Security**: Highlight any security implications or improvements
- **Rollback**: Document rollback procedures for risky changes

## Security & Configuration Guidelines
### Secrets Management
- **AWS Secrets Manager**: Store GitHub App credentials with rotation
- **Environment Variables**: Non-sensitive configuration only
- **Caching**: Short TTL (5min) for secret caching with invalidation

### Input Validation
- **Sanitization**: All external inputs validated and sanitized
- **Size Limits**: Prevent DoS with reasonable payload limits
- **Schema Validation**: Strict type checking with runtime validation

### Authentication
- **Timing-Safe Comparisons**: Prevent timing attack vulnerabilities
- **GitHub App**: Use installation tokens, not personal access tokens
- **Webhook Security**: Shared secret validation for Grafana webhooks

## Infrastructure Best Practices
### Terraform
- **State Management**: Remote state with backend configuration
- **Environment Separation**: Isolated state files per environment
- **Least Privilege**: Minimal IAM permissions with explicit resource ARNs
- **Monitoring**: CloudWatch alarms for key metrics (DLQ depth, error rates)

### AWS Lambda
- **Memory/Timeout**: Right-sized based on actual usage patterns
- **Environment Variables**: Clear separation of config vs secrets
- **Dead Letter Queues**: Proper error handling with alerting
- **Reserved Concurrency**: Prevent resource exhaustion

## Monitoring & Observability
### Metrics
- **Custom Metrics**: Alert processing rates, GitHub API success/failure
- **Dimensions**: Source (grafana/cloudwatch), team, priority, action
- **Alarms**: DLQ depth, error rates, processing latency

### Logging
- **Structured JSON**: Consistent log format with correlation IDs
- **Log Levels**: Appropriate use of INFO, WARN, ERROR
- **Sensitive Data**: Never log secrets or credentials
- **Debugging**: Include sufficient context for troubleshooting

## Configuration Data
- **Grafana Labs Account**: arn:aws:iam::008923505280:root
- **Grafana Cloud External ID**: 2269547