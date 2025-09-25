import { describe, it, expect } from "vitest";
import { SQSRecord } from "aws-lambda";
import { detectAlertSource, getTransformer } from "../../src/transformers";
import { NormalizedTransformer } from "../../src/transformers/normalized";
import { GrafanaTransformer } from "../../src/transformers/grafana";
import { CloudWatchTransformer } from "../../src/transformers/cloudwatch";

describe("Source Detection", () => {
  function createSQSRecord(body: any, messageAttributes?: any): SQSRecord {
    return {
      messageId: "test-message-id",
      receiptHandle: "test-receipt-handle",
      body: JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "1234567890",
        SenderId: "test-sender",
        ApproximateFirstReceiveTimestamp: "1234567890"
      },
      messageAttributes: messageAttributes || {},
      md5OfBody: "test-md5",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-west-2:123456789012:test-queue",
      awsRegion: "us-west-2"
    };
  }

  describe("detectAlertSource", () => {
    it("should detect source from message attributes first", () => {
      const sqsRecord = createSQSRecord(
        { some: "data" },
        { source: { stringValue: "grafana" } }
      );

      const source = detectAlertSource(sqsRecord);
      expect(source).toBe("grafana");
    });

    it("should detect normalized messages by schema structure", () => {
      const normalizedMessage = {
        schema_version: 1,
        source: "datadog",
        state: "FIRING",
        title: "Test Alert",
        priority: "P1",
        occurred_at: "2024-01-15T10:30:00.000Z",
        team: "platform-team",
        resource: { type: "instance" },
        identity: {},
        links: {}
      };

      const sqsRecord = createSQSRecord(normalizedMessage);
      const source = detectAlertSource(sqsRecord);
      expect(source).toBe("normalized");
    });

    it("should detect Grafana messages by structure", () => {
      const grafanaMessage = {
        alerts: [],
        status: "firing",
        orgId: 1,
        receiver: "webhook"
      };

      const sqsRecord = createSQSRecord(grafanaMessage);
      const source = detectAlertSource(sqsRecord);
      expect(source).toBe("grafana");
    });

    it("should detect CloudWatch SNS messages", () => {
      const cloudwatchSnsMessage = {
        Type: "Notification",
        Message: JSON.stringify({
          AlarmName: "Test Alarm",
          NewStateValue: "ALARM"
        })
      };

      const sqsRecord = createSQSRecord(cloudwatchSnsMessage);
      const source = detectAlertSource(sqsRecord);
      expect(source).toBe("cloudwatch");
    });

    it("should detect direct CloudWatch alarm messages", () => {
      const cloudwatchMessage = {
        AlarmName: "Test Alarm",
        NewStateValue: "ALARM"
      };

      const sqsRecord = createSQSRecord(cloudwatchMessage);
      const source = detectAlertSource(sqsRecord);
      expect(source).toBe("cloudwatch");
    });

    it("should fallback to grafana for unknown structures", () => {
      const unknownMessage = {
        unknown: "structure",
        data: "value"
      };

      const sqsRecord = createSQSRecord(unknownMessage);
      const source = detectAlertSource(sqsRecord);
      expect(source).toBe("grafana");
    });

    it("should handle JSON parsing errors gracefully", () => {
      const sqsRecord = {
        messageId: "test-message-id",
        receiptHandle: "test-receipt-handle",
        body: "invalid-json-{",
        attributes: {
          ApproximateReceiveCount: "1",
          SentTimestamp: "1234567890",
          SenderId: "test-sender",
          ApproximateFirstReceiveTimestamp: "1234567890"
        },
        messageAttributes: {},
        md5OfBody: "test-md5",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:us-west-2:123456789012:test-queue",
        awsRegion: "us-west-2"
      } as SQSRecord;

      const source = detectAlertSource(sqsRecord);
      expect(source).toBe("grafana"); // fallback
    });

    it("should not detect incomplete normalized messages", () => {
      const incompleteMessage = {
        schema_version: 1,
        source: "datadog",
        state: "FIRING"
        // Missing required fields like title, priority, team, etc.
      };

      const sqsRecord = createSQSRecord(incompleteMessage);
      const source = detectAlertSource(sqsRecord);
      expect(source).toBe("grafana"); // should fallback, not detect as normalized
    });

    it("should prioritize message attributes over body structure", () => {
      const normalizedMessage = {
        schema_version: 1,
        source: "datadog",
        state: "FIRING",
        title: "Test Alert",
        priority: "P1",
        occurred_at: "2024-01-15T10:30:00.000Z",
        team: "platform-team",
        resource: { type: "instance" },
        identity: {},
        links: {}
      };

      const sqsRecord = createSQSRecord(
        normalizedMessage,
        { source: { stringValue: "cloudwatch" } }
      );

      const source = detectAlertSource(sqsRecord);
      expect(source).toBe("cloudwatch"); // message attribute takes precedence
    });
  });

  describe("getTransformer", () => {
    it("should return NormalizedTransformer for normalized source", () => {
      const transformer = getTransformer("normalized");
      expect(transformer).toBeInstanceOf(NormalizedTransformer);
    });

    it("should return GrafanaTransformer for grafana source", () => {
      const transformer = getTransformer("grafana");
      expect(transformer).toBeInstanceOf(GrafanaTransformer);
    });

    it("should return CloudWatchTransformer for cloudwatch source", () => {
      const transformer = getTransformer("cloudwatch");
      expect(transformer).toBeInstanceOf(CloudWatchTransformer);
    });

    it("should be case insensitive", () => {
      expect(getTransformer("NORMALIZED")).toBeInstanceOf(NormalizedTransformer);
      expect(getTransformer("Grafana")).toBeInstanceOf(GrafanaTransformer);
      expect(getTransformer("CloudWatch")).toBeInstanceOf(CloudWatchTransformer);
    });

    it("should throw error for unknown source", () => {
      expect(() => getTransformer("unknown"))
        .toThrow("Unknown alert source: unknown");
    });
  });
});