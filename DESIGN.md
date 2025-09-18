# Alerting System — Design & System Requirements

Scope: Grafana + AWS CloudWatch publish to SNS → SQS → Lambda → GitHub Issues in pytorch/test-infra

----------------------------------------------------------------

0) Executive Summary

We ingest alerts from Grafana and AWS CloudWatch. Providers publish to Amazon SNS; SNS fans into SQS. A single AWS Lambda consumes from SQS, normalizes to a canonical alert model, assigns a single owning team and a P0–P3 priority, deduplicates via fingerprints, and opens/comments/closes GitHub issues in pytorch/test-infra. We store alert state in DynamoDB with out-of-order guards, 3-year TTL, and explicit markers for manual issue closures. Provider-side labeling/templates supply deterministic context to simplify normalization.

Design choices emphasized by feedback:
• Single-team ownership for issues (no multi-team in v1).
• One priority scale (P0–P3) standard across all sources; drop “severity”.
• No priority overrides in v1; the alert itself specifies team and priority.
• SQS sits between SNS and Lambda; we tolerate out-of-order delivery.
• When an alert recurs after being closed, open a fresh issue (no reopen).
• Drop storm mode, heartbeat comments, and cooldowns (handled provider-side).
• Lambda creates labels in the repo on demand if missing.
• GitHub: throttle mutative calls; REST primary; GraphQL optional for efficient reads when rate-limited.

----------------------------------------------------------------

1) Goals and Non-Goals

Goals
• Ingest from Grafana and CloudWatch via SNS → SQS.
• Normalize payloads to a canonical schema with schema_version and provider_version.
• Route to exactly one team and a standardized P0–P3 priority drawn from provider-supplied values.
• Manage lifecycle: create, comment, close; accept manual closes.
• Ensure idempotency and out-of-order safety.
• Provide strong observability and minimal-privilege security.

Non-Goals (v1)
• No multi-team issues or subscriber fan-out.
• No ad-hoc Python checks (future).
• No cooldown/heartbeat/storm-mode in Lambda (use provider controls).
• No EventBridge bus (SNS+SQS sufficient in v1).

----------------------------------------------------------------

2) Architecture

Sources
• Grafana Alert Rules
• AWS CloudWatch Alarms

Transport
• Providers publish to SNS topics (per-source or shared), or if they cannot reach the SNS topic they'll publish to an AWS lambda webhook that forwards the messag to the SNS topic
• SNS subscriptions target an SQS queue (alerts-queue); SNS → SQS preserves fan-out and decouples retries.

Processing
• Lambda alert-normalizer uses SQS event source.
• Lambda implements partial batch failure reporting so one bad message doesn’t poison the whole batch.
• Config retrieval from S3; state in DynamoDB; GitHub via REST (GraphQL reads as needed).

Persistence and Observability
• DynamoDB alerts_state for lifecycle and metadata.
• CloudWatch Logs (structured JSON) and custom metrics with disciplined cardinality.
• DLQs: SQS dead-letter queue for Lambda; alarms on depth.

----------------------------------------------------------------

3) Functional Requirements

Ingest
• Accept Grafana and CloudWatch notifications via SNS → SQS. There's a webhook lambda before the SNS for external notifications like Grafana
• Support message attributes identifying the provider (source=grafana|cloudwatch).

Normalization
• Use provider-specific transformers selected by provider metadata (source, payload shape, or an explicit type field).
• Produce a canonical AlertEvent (see section 6) and an Envelope (ingest metadata).

Routing
• Exactly one owning team per alert.
• Priority P0–P3 is required and standardized; providers must supply it (Grafana labels or CW AlarmDescription convention).
• Lambda applies team and priority from the incoming alert fields without overrides in v1.

Lifecycle
• On first fire of a unique fingerprint with status not open, create an issue.
• While open, subsequent fires add a comment (subject to comment rate throttling to respect API limits; not a heartbeat).
• On resolution, close the issue unless it was already manually closed; if manually closed, mark as manually_closed and skip auto-close.
• Recurrent condition after closure opens a fresh issue.

Idempotency, Out-of-Order, and Dedupe
• Compute a stable fingerprint that encodes cross-account/region identifiers if the message emitter doesn't natively offer a fingerprint.
• Maintain last_provider_state_at; ignore stale updates where incoming occurred_at < last_provider_state_at.
• SQS partial-batch failure is used to isolate bad records.

----------------------------------------------------------------

4) Non-Functional Requirements

Latency: target P50 < 10s, P95 < 60s from provider state change to GitHub action.
Throughput: handle bursts of 20 RPS with backpressure to GitHub (throttled).
Durability: at-least-once delivery; DLQ for irrecoverable failures.
Availability: 99.9 percent for ingestion and processing path.
Cost: keep baseline under 100 USD/month.
Compliance: encryption at rest and in transit; auditability via structured logs and Envelope.

----------------------------------------------------------------

5) Data Flow

Firing
1. Provider publishes alert to SNS (or to webhook which forwards to SNS) with provider-state time and identifiers.
2. SNS delivers to SQS; SQS batches to Lambda.
3. Lambda transforms payload to canonical, computes fingerprint, and loads state.
4. If no open issue for fingerprint, create issue and store state; else add a comment (rate-limited).
5. Emit metrics; ack batch items individually using report batch item failures.

Resolved
1. Provider publishes resolution with provider-state time.
2. Lambda loads state; if manually_closed, record resolution_seen and SKIP.
3. If open and not manually_closed and incoming is newer than last_provider_state_at, close the issue and update state.

Recurrence
• After closure, the next firing creates a brand-new issue (fresh discussion context).

----------------------------------------------------------------

6) Canonical Schema and Envelope

Envelope (ingest metadata; stored with the event for audit and replay triage).  Source of truth for this is in REFERENCE_DATA.md
• received_at: ISO8601 UTC when Lambda read from SQS
• ingest_topic: SNS topic name
• ingest_region: AWS region of the SNS/SQS path
• delivery_attempt: SQS receive count
• event_id: deterministic or provider-derived unique id if present

AlertEvent (persisted key fields also mirrored in DynamoDB state)
• schema_version: integer (start at 1)
• provider_version: free-form string (e.g., grafana:9.5, cloudwatch:2025-06)
• source: grafana | cloudwatch
• state: FIRING | RESOLVED
• title: normalized title (rule or alarm name)
• description: optional summary text
• priority: P0 | P1 | P2 | P3  (single canonical concept; no severity field)
• occurred_at: provider state change time (ISO8601)
• team: owning team slug (single team in v1)
• resource:
  - type: runner | instance | job | service | generic
  - id: optional string identifier
  - region: optional AWS region
  - extra: small map for context
• identity:
  - aws_account: for CloudWatch (string), optional for Grafana
  - region: for CW/Grafana as relevant
  - alarm_arn: for CW, if available
  - org_id: for Grafana
  - rule_id: for Grafana
• links:
  - runbook_url: chosen via best-link strategy
  - dashboard_url: if Grafana
  - source_url: console or panel link
• raw_provider: minimally transformed provider payload for debugging

Transformer selection
• If SNS message attribute source=grafana, use the Grafana transformer; if source=cloudwatch, use the CloudWatch transformer. As a fallback, sniff well-known fields (AlarmName vs ruleName) to choose a transformer.

Canonical schema versioning
• schema_version included in each record; persisted in DynamoDB, enabling explicit migrations later.

Runbook best-link strategy
• Prefer runbook_url from the alert payload; if missing, use team default; if both present, use runbook over dashboard over source.

----------------------------------------------------------------

7) Provider Guidance (push context upstream)

Grafana
• Use labels and templated annotations to emit explicit team and priority (P0–P3) and stable resource identifiers in the outgoing SNS payload.
• Recommended labels: team=dev-infra, priority=P1, resource_type=runner, resource_id=gh-ci-canary.
• Include panel/dashboard URLs for links.

CloudWatch
• Adopt the zero-lookup convention in AlarmDescription:
  RUNBOOK=https://runbooks.example.org/...  |  SUMMARY=Your short text
• Encode priority and team in AlarmDescription or in the AlarmName pattern if desired, but priority must be parseable; recommended key-value pairs:
  TEAM=dev-infra  |  PRIORITY=P1  |  RUNBOOK=https://...
• Ensure Dimensions carry stable resource ids (e.g., AutoScalingGroupName).
• We include aws_account, region, alarm_arn in fingerprint inputs to avoid cross-account collisions.

----------------------------------------------------------------

8) Routing Config (v1 minimal)

Philosophy in v1: Each alert specifies its team and priority. No team “opt-in” or priority overrides.

Storage and refresh
• Authoritative YAML in pytorch/test-infra at .alerting/alert-routing.yml.
• CI syncs YAML to S3; Lambda reads from S3 with a short cache and ETag control.
• YAML holds team defaults (e.g., default runbook) and label creation policy.

Minimal schema
defaults:
  labels: ["area:alerting"]
  create_labels_if_missing: true
teams:
  dev-infra:
    repo: "pytorch/test-infra"
    default_runbook_url: "https://runbooks.example.org/dev-infra"

Evaluation
• Lambda trusts team and priority from the alert payload; if team unknown, route to a fallback team or mark routing:unknown and proceed.
• Labels applied: team:<team>, priority:<Pn>, plus defaults.

----------------------------------------------------------------

9) Fingerprint and Out-of-Order Guard

Fingerprint inputs (sorted and hashed)
• source
• normalized title (rule or alarm)
• resource.type and resource.id if present
• identity fields to prevent collisions: aws_account, region, alarm_arn (CW) or org_id, rule_id (Grafana)
• optional stable keys such as MetricName or panel id

Out-of-order policy
• Maintain last_provider_state_at in DynamoDB.
• If incoming occurred_at < last_provider_state_at, mark result=SKIP_STALE and do nothing (optionally write a small audit log entry).

----------------------------------------------------------------

10) DynamoDB Schema

Table: alerts_state

Primary key
• PK: fingerprint (string). Single-table pattern; no sort key needed in v1.

Attributes
• fingerprint: string
• status: OPEN | CLOSED
• team: string
• priority: P0 | P1 | P2 | P3
• title: string
• issue_repo: "pytorch/test-infra"
• issue_number: number
• last_provider_state_at: ISO8601
• first_seen_at: ISO8601
• last_seen_at: ISO8601
• manually_closed: boolean
• manually_closed_at: ISO8601 (nullable)
• schema_version: number (mirrors event)
• provider_version: string
• identity: compact map (aws_account, region, alarm_arn, org_id, rule_id)
• envelope_digest: short hash of envelope for audit
• ttl_expires_at: epoch seconds (3-year TTL)

Indexes (v1 optional)
• GSI by team to support dashboards: GSI1PK=team, GSI1SK=last_seen_at
• GSI by priority: GSI2PK=priority, GSI2SK=last_seen_at

Conditionals
• Use conditional writes to avoid races (e.g., only close if status is OPEN and incoming time is newer).

----------------------------------------------------------------

11) GitHub Integration

Ownership and labels
• Single owning team; labels: team:<team>, priority:<Pn>, source:<source>, and any defaults from config.
• Lambda ensures labels exist; if missing and allowed, creates them.

Manual closure
• If an engineer manually closes an issue, Lambda records manually_closed=true and manually_closed_at in DynamoDB at next observation and will not auto-close on a later RESOLVED message.

Rate limiting and API choice
• REST for mutations (create/close/comment) with throttling and exponential backoff on 403 secondary limits and 5xx.
• Optionally use GraphQL to batch read current issue state (labels, state, last updated) when scanning or reconciling.
• All mutative actions go through a global token bucket; per-repo concurrency cap.

Issue skeleton
• Title: [ALERT][Pn][team] <title>
• Body sections: Summary (state, occurred_at), Team and Priority, Resource, Links (best link first), and a compact debug section with event and envelope ids.

Lifecycle rules
• Fire: create if no open record; else comment (throttled).
• Resolve: close unless manually_closed.
• Recurrence: after close, create a fresh issue.

----------------------------------------------------------------

12) Error Handling, Batching, and DLQs

SQS partial batch failure
• Use report batch item failures; only the failed messages are retried.

Retry classes
• Transient: GitHub 5xx/secondary limits, S3 transient errors → retry with jitter.
• Permanent: schema errors, missing required fields → send to DLQ with a diagnostic payload (including envelope metadata) for triage.

DLQs and alarms
• Lambda’s SQS DLQ with CloudWatch alarms on ApproximateNumberOfMessagesVisible.
• Alarms also on transform failures and GitHub error rates.

----------------------------------------------------------------

13) Observability and Operations

Metrics (low cardinality)
• Counters: AlertsReceived, Actions (CREATE/CLOSE/COMMENT/SKIP_STALE), Results (OK/ERROR)
• Dimensions: source, team, priority, action, result
• Gauges: OpenIssues (derived via periodic reconcile job if needed)
• Avoid fingerprint as a dimension.

Dashboards
• Open issues by team/priority
• DLQ depth and age
• Parse/transform failures
• Routing misses (unknown team)
• GitHub failures and rate-limit backoffs
• Incoming alert counts (by source)

Logs
• Structured JSON per event with envelope metadata and action/result.

----------------------------------------------------------------

14) Security and Multi-Account

SNS/SQS policies
• Protect against confused deputy: require aws:SourceAccount and aws:SourceArn conditions for CloudWatch → SNS.
• For Grafana → SNS: use a dedicated role or user with least-privilege publish to the topic; scope to exact ARN.

IAM for Lambda
• s3:GetObject for config prefix
• dynamodb:GetItem/PutItem/UpdateItem on alerts_state
• sqs:DeleteMessage/ReceiveMessage on alerts queue
• cloudwatch: not required in v1 (since we avoid DescribeAlarms); can be added later behind a flag
• kms:Decrypt for SSM/Secrets if used
• Minimum GitHub secrets in SSM/Secrets Manager

Encryption
• SNS, SQS, DDB, and Logs encrypted (AWS-managed or customer KMS keys).
• TLS in transit end-to-end.

----------------------------------------------------------------

15) Deployment and IaC

Terraform resources
• aws_sns_topic.* (per-source or shared)
• aws_sqs_queue.alerts_queue and aws_sqs_queue.alerts_dlq
• aws_sns_topic_subscription to SQS with redrive policies
• aws_lambda_function.alert_normalizer (Python 3.12)
• aws_lambda_event_source_mapping (SQS → Lambda; with report batch item failures)
• aws_dynamodb_table.alerts_state (PK fingerprint; TTL)
• aws_s3_bucket.alerting_config
• log groups, alarms, IAM roles/policies, KMS where needed

CI/CD with GitHub Actions
• Build Lambda artifact; deploy via AWS OIDC.
• Apply Terraform (manual approval for prod).
• Sync .alerting/alert-routing.yml to S3 on merges to main.

Runtime configuration
• CONFIG_S3_URI, DEFAULT_REPO=pytorch/test-infra, LABEL_AUTOCREATE=true.
• RATE_LIMITS and COMMENT_THROTTLE_SECONDS to protect against API limits.

----------------------------------------------------------------

16) Lambda Implementation Sketch (no code fences)

Handler outline:
• For each SQS message:
  - Parse envelope metadata; choose transformer by source; build AlertEvent.
  - Validate presence of team and priority (P0–P3).
  - Compute fingerprint and load state.
  - If incoming occurred_at older than last_provider_state_at → SKIP_STALE.
  - Decide action: CREATE, COMMENT, CLOSE, or SKIP (manual close case).
  - Perform GitHub mutation (throttled); ensure labels exist if configured.
  - Update DynamoDB state with conditional checks and timestamps.
  - Emit metrics and structured logs.
• On failures, return item-level failures for retry.

----------------------------------------------------------------

17) Testing Strategy

Unit
• Transformer correctness (Grafana and CloudWatch) and schema validation.
• Fingerprint stability across dimension ordering and naming variants.
• Out-of-order guard logic; manual-close logic.
• Priority/team parsing from provider payloads.

Integration
• LocalStack for SNS → SQS → Lambda → DDB path.
• GitHub API mocks including rate limits and 5xx.
• DLQ and partial-batch failure scenarios.

E2E (staging)
• Staging SNS/SQS/Lambda/DDB and a staging repo.
• Golden alarms and Grafana rules emitting P0–P3 with team labels.
• Verify fresh-issue-on-recurrence, manual-close handling, and label creation.

----------------------------------------------------------------

18) Example Payload Fragments (as plain text)

Grafana core fields:
receiver=sns; state=alerting; ruleName=Runners Scale Up Failure; tags: team=dev-infra, priority=P1; dashboardURL=..., panelURL=...; orgId=1; ruleId=123

CloudWatch core fields:
AlarmName=Runners-ASG-InsufficientInstances; NewStateValue=ALARM or OK; StateChangeTime=2025-09-03T19:10:01Z; Region=us-east-1; AlarmArn=arn:aws:cloudwatch:...; Dimensions: AutoScalingGroupName=gh-ci-canary; AlarmDescription: TEAM=dev-infra | PRIORITY=P1 | RUNBOOK=https://...

----------------------------------------------------------------

19) Rollout Plan

1. Provision infra (SNS, SQS, Lambda, DDB, S3, IAM, DLQs, alarms).
2. Dry run: process to logs only; verify parsing and routing in staging.
3. Enable writes to a staging repo; validate lifecycle and dashboards.
4. Cut over provider contact points folder-by-folder/alarm-group-by-group to prod.
5. Ongoing: provider-side tuning of labels and patterns; update runbook links as needed.

----------------------------------------------------------------

20) Acceptance Criteria

• Grafana and CloudWatch alerts create exactly one issue per unique condition and close on resolution.
• Manual close is respected and recorded; automation does not re-close.
• Recurrent conditions after closure create fresh issues.
• Priority P0–P3 and single owning team are consistently applied.
• Out-of-order events are safely ignored; no duplicate issues.
• Metrics, logs, and DLQs provide clear triage signals.

