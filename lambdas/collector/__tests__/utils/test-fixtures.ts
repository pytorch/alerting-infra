import { SQSRecord } from "aws-lambda";
import { AlertEvent, Envelope } from "../../src/types";

// Mock SQS record factory
export function createMockSQSRecord(
  body: any,
  messageAttributes: Record<string, any> = {},
): SQSRecord {
  return {
    messageId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    receiptHandle: "mock-receipt-handle",
    body: typeof body === "string" ? body : JSON.stringify(body),
    attributes: {
      ApproximateReceiveCount: "1",
      SentTimestamp: Date.now().toString(),
      SenderId: "AIDAMOCK",
      ApproximateFirstReceiveTimestamp: Date.now().toString(),
    },
    messageAttributes,
    md5OfBody: "mock-md5",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:test-alerts-queue",
    awsRegion: "us-east-1",
  } as SQSRecord;
}

// Test alert event fixtures
export const testAlertEvents = {
  grafanaFiring: {
    schema_version: 1,
    source: "grafana",
    state: "FIRING" as const,
    title: "Test Alert",
    description: "Test alert description",
    reason: "Test reason",
    priority: "P1" as const,
    occurred_at: "2025-09-16T12:00:00.000Z",
    teams: ["dev-infra"],
    identity: {
      account_id: "1",
      alarm_id: "test-rule-123",
    },
    links: {
      runbook_url: "https://runbooks.example.com/test",
      dashboard_url: "https://grafana.example.com/dashboard",
      source_url: "https://grafana.example.com/alert",
    },
    raw_provider: {},
  } satisfies AlertEvent,

  grafanaResolved: {
    schema_version: 1,
    source: "grafana",
    state: "RESOLVED" as const,
    title: "Test Alert",
    description: "Test alert description",
    reason: "Test reason",
    priority: "P1" as const,
    occurred_at: "2025-09-16T12:05:00.000Z",
    teams: ["dev-infra"],
    identity: {
      account_id: "1",
      alarm_id: "test-rule-123",
    },
    links: {
      runbook_url: "https://runbooks.example.com/test",
      dashboard_url: "https://grafana.example.com/dashboard",
      source_url: "https://grafana.example.com/alert",
    },
    raw_provider: {},
  } satisfies AlertEvent,

  cloudwatchAlarm: {
    schema_version: 1,
    source: "cloudwatch",
    state: "FIRING" as const,
    title: "High CPU Usage",
    description: "CPU usage is above threshold",
    reason: "Threshold crossed",
    priority: "P2" as const,
    occurred_at: "2025-09-16T12:00:00.000Z",
    teams: ["platform"],
    identity: {
      account_id: "123456789012",
      alarm_id: "arn:aws:cloudwatch:us-east-1:123456789012:alarm:HighCPU",
    },
    links: {
      source_url:
        "https://console.aws.amazon.com/cloudwatch/home#alarmsV2:alarm/HighCPU",
    },
    raw_provider: {},
  } satisfies AlertEvent,

  // New multi-team test fixtures
  multiTeamAlert: {
    schema_version: 1,
    source: "grafana",
    state: "FIRING" as const,
    title: "Multi-Team Alert",
    description: "Alert that affects multiple teams",
    reason: "Test multi-team reason",
    priority: "P1" as const,
    occurred_at: "2025-09-16T12:00:00.000Z",
    teams: ["dev-infra", "platform", "security"],
    identity: {
      account_id: "1",
      alarm_id: "multi-team-rule-456",
    },
    links: {
      runbook_url: "https://runbooks.example.com/multi-team",
      dashboard_url: "https://grafana.example.com/multi-dashboard",
      source_url: "https://grafana.example.com/multi-alert",
    },
    raw_provider: {},
  } satisfies AlertEvent,
};

// Test Grafana payloads
export const testGrafanaPayloads = {
  firing: {
    receiver: "sns",
    status: "firing",
    orgId: 1,
    alerts: [
      {
        status: "firing",
        labels: {
          alertname: "Test Alert",
        },
        annotations: {
          Priority: "P1",
          Team: "dev-infra",
          description: "Test alert description",
          runbook_url: "https://runbooks.example.com/test",
          summary: "Test alert summary",
        },
        startsAt: "2025-09-16T12:00:00.000Z",
        endsAt: "0001-01-01T00:00:00Z",
        generatorURL: "https://grafana.example.com/alert",
        fingerprint: "abc123",
      },
    ],
    groupLabels: { alertname: "Test Alert" },
    commonLabels: {},
    commonAnnotations: {},
    externalURL: "https://grafana.example.com",
    version: "1",
    groupKey: '{}:{alertname="Test Alert"}',
    truncatedAlerts: 0,
    title: "[FIRING:1] Test Alert",
    state: "alerting",
    message: "Test message",
  },

  resolved: {
    receiver: "sns",
    status: "resolved",
    orgId: 1,
    alerts: [
      {
        status: "resolved",
        labels: {
          alertname: "Test Alert",
        },
        annotations: {
          Priority: "P1",
          Team: "dev-infra",
          description: "Test alert description",
          runbook_url: "https://runbooks.example.com/test",
          summary: "Test alert summary",
        },
        startsAt: "2025-09-16T12:00:00.000Z",
        endsAt: "2025-09-16T12:05:00.000Z",
        generatorURL: "https://grafana.example.com/alert",
        fingerprint: "abc123",
      },
    ],
    groupLabels: { alertname: "Test Alert" },
    commonLabels: {},
    commonAnnotations: {},
    externalURL: "https://grafana.example.com",
    version: "1",
    groupKey: '{}:{alertname="Test Alert"}',
    truncatedAlerts: 0,
    title: "[RESOLVED:1] Test Alert",
    state: "ok",
    message: "Test message",
  },

  missingTeam: {
    receiver: "sns",
    status: "firing",
    orgId: 1,
    alerts: [
      {
        status: "firing",
        labels: {
          alertname: "Test Alert Without Team",
        },
        annotations: {
          Priority: "P0",
          description: "Test alert without team",
        },
        startsAt: "2025-09-16T12:00:00.000Z",
        endsAt: "0001-01-01T00:00:00Z",
        generatorURL: "https://grafana.example.com/alert",
        fingerprint: "def456",
      },
    ],
    groupLabels: { alertname: "Test Alert Without Team" },
    commonLabels: {},
    commonAnnotations: {},
    externalURL: "https://grafana.example.com",
    version: "1",
    groupKey: '{}:{alertname="Test Alert Without Team"}',
    truncatedAlerts: 0,
    title: "[FIRING:1] Test Alert Without Team",
    state: "alerting",
    message: "Test message",
  },

  // New multi-team payloads for testing
  multiTeamFiring: {
    receiver: "sns",
    status: "firing",
    orgId: 1,
    alerts: [
      {
        status: "firing",
        labels: {
          alertname: "Multi-Team Alert",
        },
        annotations: {
          Priority: "P0",
          Teams: "dev-infra, platform, security", // Multi-team using TEAMS keyword
          description: "Alert affecting multiple teams",
          runbook_url: "https://runbooks.example.com/multi-team",
          summary: "Critical multi-team alert",
        },
        startsAt: "2025-09-16T12:00:00.000Z",
        endsAt: "0001-01-01T00:00:00Z",
        generatorURL: "https://grafana.example.com/multi-alert",
        fingerprint: "multi123",
      },
    ],
    groupLabels: { alertname: "Multi-Team Alert" },
    commonLabels: {},
    commonAnnotations: {},
    externalURL: "https://grafana.example.com",
    version: "1",
    groupKey: '{}:{alertname="Multi-Team Alert"}',
    truncatedAlerts: 0,
    title: "[FIRING:1] Multi-Team Alert",
    state: "alerting",
    message: "Multi-team test message",
  },

  multiTeamWithSpaces: {
    receiver: "sns",
    status: "firing",
    orgId: 1,
    alerts: [
      {
        status: "firing",
        labels: {
          alertname: "Space Team Alert",
        },
        annotations: {
          Priority: "P1",
          teams: "pytorch dev-infra, intel-infra, ml platform", // Teams with spaces
          description: "Alert with team names containing spaces",
        },
        startsAt: "2025-09-16T12:00:00.000Z",
        endsAt: "0001-01-01T00:00:00Z",
        generatorURL: "https://grafana.example.com/space-alert",
        fingerprint: "space456",
      },
    ],
    groupLabels: { alertname: "Space Team Alert" },
    commonLabels: {},
    commonAnnotations: {},
    externalURL: "https://grafana.example.com",
    version: "1",
    groupKey: '{}:{alertname="Space Team Alert"}',
    truncatedAlerts: 0,
    title: "[FIRING:1] Space Team Alert",
    state: "alerting",
    message: "Space team test message",
  },
};

// Test CloudWatch payloads
export const testCloudWatchPayloads = {
  alarm: {
    Type: "Notification",
    MessageId: "12345678-1234-1234-1234-123456789012",
    TopicArn: "arn:aws:sns:us-east-1:123456789012:alerts",
    Subject: "ALARM: High CPU Usage in US East - N. Virginia",
    Message: JSON.stringify({
      AlarmName: "High CPU Usage",
      AlarmDescription:
        "TEAM=platform | PRIORITY=P2 | RUNBOOK=https://runbooks.example.com/cpu",
      AWSAccountId: "123456789012",
      NewStateValue: "ALARM",
      NewStateReason: "Threshold Crossed: CPU usage is above 80%",
      StateChangeTime: "2025-09-16T12:00:00.000Z",
      Region: "US East - N. Virginia",
      AlarmArn: "arn:aws:cloudwatch:us-east-1:123456789012:alarm:HighCPU",
      OldStateValue: "OK",
      Trigger: {
        MetricName: "CPUUtilization",
        Namespace: "AWS/EC2",
        StatisticType: "Statistic",
        Statistic: "AVERAGE",
        Unit: "Percent",
        Dimensions: [{ name: "InstanceId", value: "i-1234567890abcdef0" }],
        Period: 300,
        EvaluationPeriods: 2,
        ComparisonOperator: "GreaterThanThreshold",
        Threshold: 80.0,
      },
    }),
    Timestamp: "2025-09-16T12:00:00.123Z",
    SignatureVersion: "1",
  },

  ok: {
    Type: "Notification",
    MessageId: "12345678-1234-1234-1234-123456789012",
    TopicArn: "arn:aws:sns:us-east-1:123456789012:alerts",
    Subject: "OK: High CPU Usage in US East - N. Virginia",
    Message: JSON.stringify({
      AlarmName: "High CPU Usage",
      AlarmDescription:
        "TEAM=platform | PRIORITY=P2 | RUNBOOK=https://runbooks.example.com/cpu",
      AWSAccountId: "123456789012",
      NewStateValue: "OK",
      NewStateReason: "Threshold no longer crossed",
      StateChangeTime: "2025-09-16T12:05:00.000Z",
      Region: "US East - N. Virginia",
      AlarmArn: "arn:aws:cloudwatch:us-east-1:123456789012:alarm:HighCPU",
      OldStateValue: "ALARM",
      Trigger: {
        MetricName: "CPUUtilization",
        Namespace: "AWS/EC2",
        StatisticType: "Statistic",
        Statistic: "AVERAGE",
        Unit: "Percent",
        Dimensions: [{ name: "InstanceId", value: "i-1234567890abcdef0" }],
        Period: 300,
        EvaluationPeriods: 2,
        ComparisonOperator: "GreaterThanThreshold",
        Threshold: 80.0,
      },
    }),
    Timestamp: "2025-09-16T12:05:00.123Z",
    SignatureVersion: "1",
  },

  // Multi-team CloudWatch payloads for testing
  multiTeamAlarm: {
    Type: "Notification",
    MessageId: "87654321-4321-4321-4321-210987654321",
    TopicArn: "arn:aws:sns:us-east-1:123456789012:alerts",
    Subject: "ALARM: Critical Multi-Team Issue in US East - N. Virginia",
    Message: JSON.stringify({
      AlarmName: "Critical Multi-Team Issue",
      AlarmDescription:
        "Critical infrastructure failure affecting multiple teams\nTEAMS=dev-infra, platform, security\nPRIORITY=P0\nRUNBOOK=https://runbooks.example.com/multi-team-critical",
      AWSAccountId: "123456789012",
      NewStateValue: "ALARM",
      NewStateReason: "Critical infrastructure failure detected",
      StateChangeTime: "2025-09-16T12:00:00.000Z",
      Region: "US East - N. Virginia",
      AlarmArn:
        "arn:aws:cloudwatch:us-east-1:123456789012:alarm:CriticalMultiTeam",
      OldStateValue: "OK",
    }),
    Timestamp: "2025-09-16T12:00:00.123Z",
    SignatureVersion: "1",
  },

  legacySingleTeamAlarm: {
    Type: "Notification",
    MessageId: "11111111-2222-3333-4444-555555555555",
    TopicArn: "arn:aws:sns:us-east-1:123456789012:alerts",
    Subject: "ALARM: Legacy Single Team Alert in US East - N. Virginia",
    Message: JSON.stringify({
      AlarmName: "Legacy Single Team Alert",
      AlarmDescription:
        "Legacy alert using old TEAM format for backward compatibility\nTEAM=legacy-team\nPRIORITY=P2\nRUNBOOK=https://runbooks.example.com/legacy",
      AWSAccountId: "123456789012",
      NewStateValue: "ALARM",
      NewStateReason: "Legacy system alert",
      StateChangeTime: "2025-09-16T12:00:00.000Z",
      Region: "US East - N. Virginia",
      AlarmArn:
        "arn:aws:cloudwatch:us-east-1:123456789012:alarm:LegacySingleTeam",
      OldStateValue: "OK",
    }),
    Timestamp: "2025-09-16T12:00:00.123Z",
    SignatureVersion: "1",
  },
};
