import { describe, it, expect } from "vitest";
import {
  validateNormalizedAlertEvent,
  getAlertEventSchema,
  getCurrentSchemaVersion,
} from "../../src/utils/schema-validator";
import { AlertEvent } from "../../src/types";

describe("Schema Validator", () => {
  const validAlertEvent: AlertEvent = {
    schema_version: 1,
    source: "custom",
    state: "FIRING",
    title: "Test Alert",
    priority: "P1",
    occurred_at: "2024-01-15T10:30:00.000Z",
    team: "test-team",
    identity: {
      rule_id: "test-rule",
    },
    links: {
      runbook_url: "https://example.com/runbook",
    },
  };

  describe("validateNormalizedAlertEvent", () => {
    it("should validate a correct AlertEvent", () => {
      expect(() => validateNormalizedAlertEvent(validAlertEvent)).not.toThrow();
    });

    it("should throw detailed error for missing required field", () => {
      const invalidAlert = { ...validAlertEvent };
      delete (invalidAlert as any).title;

      expect(() => validateNormalizedAlertEvent(invalidAlert)).toThrow(
        "AlertEvent validation failed",
      );
    });

    it("should allow valid optional fields", () => {
      const alertWithOptionals: AlertEvent = {
        ...validAlertEvent,
        description: "Test description",
        summary: "Test summary",
        reason: "Test reason",
        identity: {
          account_id: "123456789012",
          region: "us-west-2",
          alarm_arn: "arn:aws:cloudwatch:us-west-2:123456789012:alarm:test",
          rule_id: "rule-123",
        },
        links: {
          runbook_url: "https://example.com/runbook",
          dashboard_url: "https://example.com/dashboard",
          source_url: "https://example.com/source",
          silence_url: "https://example.com/silence",
        },
        raw_provider: {
          original: "data",
        },
      };

      expect(() =>
        validateNormalizedAlertEvent(alertWithOptionals),
      ).not.toThrow();
    });
  });

  describe("getAlertEventSchema", () => {
    it("should return the JSON Schema object", () => {
      const schema = getAlertEventSchema();

      expect(schema).toHaveProperty("$schema");
      expect(schema).toHaveProperty("$id");
      expect(schema).toHaveProperty("title", "AlertEvent");
      expect(schema).toHaveProperty("type", "object");
      expect(schema).toHaveProperty("properties");
      expect(schema).toHaveProperty("required");
    });
  });
});
