# Adding New Alerts to the System

This guide explains how to configure new alerts in Grafana and CloudWatch to work with our alert processing pipeline.

## Overview

The alert processing system expects specific labels/metadata to properly categorize alerts, assign ownership, and create meaningful GitHub issues. Without these required fields, alerts will fail to process.

## Grafana Alerts

### Required Annotations
We map extra fields using what Grafana calls "Custom annotation name and content"

These must be present on every alert for it to fire:

They're basically key/value pairs:
- **`team`** - The owning team identifier (e.g., `pytorch-dev-infra`, `pytorch-benchmarking`)
- **`priority`** - Alert severity level: `P0`, `P1`, `P2`, or `P3`

### Optional Annotations

- **`runbook_url`** - Link to troubleshooting documentation

### Native Grafana Fields

These fileds will also be populated in the alerts
- **`description`** - Alert description
- **`summary`** - Alert summary

### Configuration

1. Create your alert rule in Grafana.  Give the outputs of the query meaningful names, otherwise Grafana will default to A, B, C
2. Add the required fields in labels:
   ```
   team = dev-infra
   priority = P1
   runbook_url = https://wiki.example.com/runbooks/disk-space
   ```
3. Under "Configure Notification" enable "advanced options". Alerts will now get routed to our Dev and Prod channels

### Example Configuration

```yaml
labels:
  team: "dev-infra"
  priority: "P1"
  runbook_url: "https://wiki.pytorch.org/runbooks/disk-space"
```

## CloudWatch Alerts

CloudWatch alerts use the AlarmDescription field to pass metadata in a specific format.

### Required Fields

These must be present in the AlarmDescription:

- **`TEAM`** - Owning team identifier
- **`PRIORITY`** - Priority level (`P0`, `P1`, `P2`, `P3`)

### Optional Fields

- **`RUNBOOK`** - Troubleshooting documentation URL

### AlarmDescription Format

The AlarmDescription should contain your alert description, followed by metadata in newline-separated key=value format:

```
High CPU usage detected on production instances
TEAM=dev-infra
PRIORITY=P1
RUNBOOK=https://wiki.pytorch.org/runbooks/high-cpu
```

### Configuration

1. Create your CloudWatch alarm
2. Set the AlarmDescription with the required metadata format
3. Configure the alarm to send to our SNS topic

## Alert Processing Flow

When properly configured alerts fire:

1. Alert sent to SNS topic
2. Queued through SQS to Lambda processor
3. Normalized to canonical alert format
4. GitHub issue created with appropriate labels
5. Alert state tracked in DynamoDB

The resulting GitHub issue includes:
- Normalized title and description
- Team and priority labels
- Links to runbooks if provided
- Debug information from original alert payload

## Validation

To verify your alert configuration:

1. Check CloudWatch logs for the collector Lambda function
2. Verify GitHub issue creation in the target repository
3. Confirm alert state recorded in DynamoDB table

Look for error messages about missing required fields if alerts fail to process. The logs include full alert payloads and processing details for debugging.