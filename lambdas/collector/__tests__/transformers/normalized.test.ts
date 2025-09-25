import { describe, it, expect } from "vitest";
import { NormalizedTransformer } from "../../src/transformers/normalized";
import { AlertEvent, Envelope } from "../../src/types";

describe("NormalizedTransformer", () => {
  const transformer = new NormalizedTransformer();

  // Valid normalized alert event for testing
  const validNormalizedAlert: AlertEvent = {
    schema_version: 1,
    source: "datadog",
    state: "FIRING",
    title: "High CPU Usage",
    description: "CPU usage is above 90%",
    summary: "Critical CPU alert",
    priority: "P1",
    occurred_at: "2024-01-15T10:30:00.000Z",
    team: "platform-team",
    identity: {
      account_id: "123456789012",
      region: "us-west-2",
      rule_id: "cpu-high-alert",
    },
    links: {
      runbook_url: "https://wiki.company.com/runbooks/cpu",
      dashboard_url: "https://dashboard.company.com/cpu",
      source_url: "https://datadog.com/monitors/12345",
    },
    raw_provider: {
      monitor_id: 12345,
    },
  };

  const mockEnvelope: Envelope = {
    event_id: "test-event-123",
    source: "normalized",
    timestamp: "2024-01-15T10:30:00.000Z",
  };

  describe("transform", () => {
    it("should successfully transform a valid normalized alert", () => {
      const result = transformer.transform(validNormalizedAlert, mockEnvelope);

      expect(result).toEqual(validNormalizedAlert);
      expect(result.schema_version).toBe(1);
      expect(result.source).toBe("datadog");
      expect(result.state).toBe("FIRING");
      expect(result.priority).toBe("P1");
      expect(result.team).toBe("platform-team");
    });

    it("should handle RESOLVED state", () => {
      const resolvedAlert = {
        ...validNormalizedAlert,
        state: "RESOLVED" as const,
      };
      const result = transformer.transform(resolvedAlert, mockEnvelope);

      expect(result.state).toBe("RESOLVED");
    });

    it("should handle all priority levels", () => {
      const priorities = ["P0", "P1", "P2", "P3"] as const;

      priorities.forEach((priority) => {
        const alert = {
          ...validNormalizedAlert,
          priority,
        };
        const result = transformer.transform(alert, mockEnvelope);

        expect(result.priority).toBe(priority);
      });
    });

    it("should handle optional fields being undefined", () => {
      const minimalAlert = {
        ...validNormalizedAlert,
        description: undefined,
        summary: undefined,
        reason: undefined,
      };
      delete minimalAlert.description;
      delete minimalAlert.summary;
      delete minimalAlert.reason;

      const result = transformer.transform(minimalAlert, mockEnvelope);

      expect(result.description).toBeUndefined();
      expect(result.summary).toBeUndefined();
      expect(result.reason).toBeUndefined();
    });
  });

  describe("JSON Schema validation errors", () => {
    it("should throw error for missing required fields", () => {
      const requiredFields = [
        "schema_version",
        "source",
        "state",
        "title",
        "priority",
        "occurred_at",
        "team",
        "identity",
        "links",
      ];

      requiredFields.forEach((field) => {
        const invalidAlert = { ...validNormalizedAlert };
        delete (invalidAlert as any)[field];

        expect(() => transformer.transform(invalidAlert, mockEnvelope)).toThrow(
          /AlertEvent validation failed/,
        );
      });
    });

    it("should throw error for invalid schema_version", () => {
      const invalidAlerts = [
        { ...validNormalizedAlert, schema_version: 0 },
        { ...validNormalizedAlert, schema_version: -1 },
        { ...validNormalizedAlert, schema_version: "1" },
      ];

      invalidAlerts.forEach((alert) => {
        expect(() => transformer.transform(alert, mockEnvelope)).toThrow(
          /AlertEvent validation failed/,
        );
      });
    });

    it("should throw error for invalid state", () => {
      const invalidAlert = {
        ...validNormalizedAlert,
        state: "INVALID_STATE",
      };

      expect(() => transformer.transform(invalidAlert, mockEnvelope)).toThrow(
        /AlertEvent validation failed/,
      );
    });

    it("should throw error for invalid priority", () => {
      const invalidAlert = {
        ...validNormalizedAlert,
        priority: "P5",
      };

      expect(() => transformer.transform(invalidAlert, mockEnvelope)).toThrow(
        /AlertEvent validation failed/,
      );
    });

    it("should throw error for invalid identity structure", () => {
      const invalidAlerts = [
        { ...validNormalizedAlert, identity: null },
        { ...validNormalizedAlert, identity: "string" },
      ];

      invalidAlerts.forEach((alert) => {
        expect(() => transformer.transform(alert, mockEnvelope)).toThrow(
          /AlertEvent validation failed/,
        );
      });
    });

    it("should throw error for invalid links structure", () => {
      const invalidAlerts = [
        { ...validNormalizedAlert, links: null },
        { ...validNormalizedAlert, links: "string" },
      ];

      invalidAlerts.forEach((alert) => {
        expect(() => transformer.transform(alert, mockEnvelope)).toThrow(
          /AlertEvent validation failed/,
        );
      });
    });

    it("should throw error for invalid occurred_at timestamp", () => {
      const invalidAlerts = [
        { ...validNormalizedAlert, occurred_at: "invalid-date" },
        { ...validNormalizedAlert, occurred_at: "2024-01-15" }, // not ISO8601
        { ...validNormalizedAlert, occurred_at: "2024-01-15T10:30:00" }, // missing timezone
      ];

      invalidAlerts.forEach((alert) => {
        expect(() => transformer.transform(alert, mockEnvelope)).toThrow(
          /AlertEvent validation failed/,
        );
      });
    });

    it("should throw error for title too long", () => {
      const longTitle = "x".repeat(501); // exceeds 500 char limit
      const invalidAlert = {
        ...validNormalizedAlert,
        title: longTitle,
      };

      expect(() => transformer.transform(invalidAlert, mockEnvelope)).toThrow(
        /AlertEvent validation failed/,
      );
    });

    it("should throw error for invalid source format", () => {
      const invalidAlert = {
        ...validNormalizedAlert,
        source: "invalid-source-with-spaces and-special-chars!",
      };

      expect(() => transformer.transform(invalidAlert, mockEnvelope)).toThrow(
        /AlertEvent validation failed/,
      );
    });

    it("should include helpful error context", () => {
      const invalidAlert = {
        ...validNormalizedAlert,
        priority: "P5",
      };

      try {
        transformer.transform(invalidAlert, mockEnvelope);
        fail("Expected validation error");
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).toMatch(/AlertEvent validation failed/);
        expect(errorMessage).toMatch(
          /github\.com\/pytorch\/test-infra-alerting/,
        );
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty raw_provider", () => {
      const alert = {
        ...validNormalizedAlert,
        raw_provider: {},
      };
      const result = transformer.transform(alert, mockEnvelope);

      expect(result.raw_provider).toEqual({});
    });

    it("should handle empty identity and links objects", () => {
      const alert = {
        ...validNormalizedAlert,
        identity: {},
        links: {},
      };
      const result = transformer.transform(alert, mockEnvelope);

      expect(result.identity).toEqual({});
      expect(result.links).toEqual({});
    });
  });
});
