import { describe, it, expect, beforeEach } from "vitest";
import { GrafanaTransformer } from "../src/transformers/grafana";
import { CloudWatchTransformer } from "../src/transformers/cloudwatch";
import { Envelope } from "../src/types";
import {
  testGrafanaPayloads,
  testCloudWatchPayloads,
} from "./utils/test-fixtures";

describe("Multi-Team Support", () => {
  let mockEnvelope: Envelope;

  beforeEach(() => {
    mockEnvelope = {
      received_at: "2025-09-16T12:00:00.000Z",
      ingest_topic: "test-topic",
      ingest_region: "us-east-1",
      delivery_attempt: 1,
      event_id: "test-event-123",
    };
  });

  describe("GrafanaTransformer Multi-Team Support", () => {
    let transformer: GrafanaTransformer;

    beforeEach(() => {
      transformer = new GrafanaTransformer();
    });

    it("should handle multi-team alert with TEAMS annotation", () => {
      const result = transformer.transform(
        testGrafanaPayloads.multiTeamFiring,
        mockEnvelope,
      );

      expect(result.teams).toEqual(["dev-infra", "platform", "security"]);
      expect(result.priority).toBe("P0");
      expect(result.title).toBe("Multi-Team Alert");
    });

    it("should handle team names with spaces", () => {
      const result = transformer.transform(
        testGrafanaPayloads.multiTeamWithSpaces,
        mockEnvelope,
      );

      expect(result.teams).toEqual([
        "pytorch-dev-infra",
        "intel-infra",
        "ml-platform",
      ]);
      expect(result.priority).toBe("P1");
    });

    it("should handle single team using TEAMS keyword", () => {
      const payload = {
        ...testGrafanaPayloads.firing,
        alerts: [
          {
            ...testGrafanaPayloads.firing.alerts[0],
            annotations: {
              Priority: "P2",
              Teams: "single-team",
              description: "Single team using Teams annotation",
            },
          },
        ],
      };

      const result = transformer.transform(payload, mockEnvelope);

      expect(result.teams).toEqual(["single-team"]);
      expect(result.priority).toBe("P2");
    });

    it("should prioritize TEAMS over TEAM annotation", () => {
      const payload = {
        ...testGrafanaPayloads.firing,
        alerts: [
          {
            ...testGrafanaPayloads.firing.alerts[0],
            annotations: {
              Priority: "P1",
              Team: "old-team",
              Teams: "new-team1, new-team2",
              description: "Testing priority of TEAMS over TEAM",
            },
          },
        ],
      };

      const result = transformer.transform(payload, mockEnvelope);

      expect(result.teams).toEqual(["new-team1", "new-team2"]);
      expect(result.priority).toBe("P1");
    });

    it("should handle case-insensitive team keywords", () => {
      const payload = {
        ...testGrafanaPayloads.firing,
        alerts: [
          {
            ...testGrafanaPayloads.firing.alerts[0],
            annotations: {
              Priority: "P1",
              teams: "case-insensitive1, case-insensitive2", // lowercase
              description: "Testing case insensitive teams",
            },
          },
        ],
      };

      const result = transformer.transform(payload, mockEnvelope);

      expect(result.teams).toEqual(["case-insensitive1", "case-insensitive2"]);
    });
  });

  describe("CloudWatchTransformer Multi-Team Support", () => {
    let transformer: CloudWatchTransformer;

    beforeEach(() => {
      transformer = new CloudWatchTransformer();
    });

    it("should handle multi-team alarm with TEAMS field", () => {
      const result = transformer.transform(
        testCloudWatchPayloads.multiTeamAlarm,
        mockEnvelope,
      );

      expect(result.teams).toEqual(["dev-infra", "platform", "security"]);
      expect(result.priority).toBe("P0");
      expect(result.title).toBe("Critical Multi-Team Issue");
    });

    it("should handle backward compatibility with TEAM field", () => {
      const result = transformer.transform(
        testCloudWatchPayloads.legacySingleTeamAlarm,
        mockEnvelope,
      );

      expect(result.teams).toEqual(["legacy-team"]);
      expect(result.priority).toBe("P2");
      expect(result.title).toBe("Legacy Single Team Alert");
    });

    it("should prioritize TEAMS over TEAM in AlarmDescription", () => {
      const alarmData = JSON.parse(testCloudWatchPayloads.alarm.Message);
      const customAlarm = {
        ...testCloudWatchPayloads.alarm,
        Message: JSON.stringify({
          ...alarmData,
          AlarmDescription: `
            Multi-team test alert
            TEAM=old-team
            TEAMS=new-team1, new-team2
            PRIORITY=P1
          `,
        }),
      };

      const result = transformer.transform(customAlarm, mockEnvelope);

      expect(result.teams).toEqual(["new-team1", "new-team2"]);
      expect(result.priority).toBe("P1");
    });

    it("should handle pipe-separated format with TEAMS", () => {
      const alarmData = JSON.parse(testCloudWatchPayloads.alarm.Message);
      const customAlarm = {
        ...testCloudWatchPayloads.alarm,
        Message: JSON.stringify({
          ...alarmData,
          AlarmDescription:
            "TEAMS=team1, team2, team3 | PRIORITY=P1 | RUNBOOK=https://example.com",
        }),
      };

      const result = transformer.transform(customAlarm, mockEnvelope);

      expect(result.teams).toEqual(["team1", "team2", "team3"]);
      expect(result.priority).toBe("P1");
    });
  });

  describe("Team Name Normalization", () => {
    let grafanaTransformer: GrafanaTransformer;
    let cloudwatchTransformer: CloudWatchTransformer;

    beforeEach(() => {
      grafanaTransformer = new GrafanaTransformer();
      cloudwatchTransformer = new CloudWatchTransformer();
    });

    it("should normalize team names with spaces to hyphens in Grafana", () => {
      const payload = {
        ...testGrafanaPayloads.firing,
        alerts: [
          {
            ...testGrafanaPayloads.firing.alerts[0],
            annotations: {
              Priority: "P1",
              Teams: "PyTorch Dev Infra, Intel Platform Team",
              description: "Testing space normalization",
            },
          },
        ],
      };

      const result = grafanaTransformer.transform(payload, mockEnvelope);

      expect(result.teams).toEqual([
        "pytorch-dev-infra",
        "intel-platform-team",
      ]);
    });

    it("should normalize team names with spaces to hyphens in CloudWatch", () => {
      const alarmData = JSON.parse(testCloudWatchPayloads.alarm.Message);
      const customAlarm = {
        ...testCloudWatchPayloads.alarm,
        Message: JSON.stringify({
          ...alarmData,
          AlarmDescription:
            "TEAMS=PyTorch Dev Infra, Intel Platform Team\nPRIORITY=P1",
        }),
      };

      const result = cloudwatchTransformer.transform(customAlarm, mockEnvelope);

      expect(result.teams).toEqual([
        "pytorch-dev-infra",
        "intel-platform-team",
      ]);
    });
  });

  describe("Error Handling for Multi-Team", () => {
    let grafanaTransformer: GrafanaTransformer;
    let cloudwatchTransformer: CloudWatchTransformer;

    beforeEach(() => {
      grafanaTransformer = new GrafanaTransformer();
      cloudwatchTransformer = new CloudWatchTransformer();
    });

    it("should reject empty teams list in Grafana", () => {
      const payload = {
        ...testGrafanaPayloads.firing,
        alerts: [
          {
            ...testGrafanaPayloads.firing.alerts[0],
            annotations: {
              Priority: "P1",
              Teams: ",  , , ", // Commas but no actual team names
            },
          },
        ],
      };

      expect(() => {
        grafanaTransformer.transform(payload, mockEnvelope);
      }).toThrow(
        "No valid team names found after parsing comma-delimited list",
      );
    });

    it("should reject empty teams list in CloudWatch", () => {
      const alarmData = JSON.parse(testCloudWatchPayloads.alarm.Message);
      const customAlarm = {
        ...testCloudWatchPayloads.alarm,
        Message: JSON.stringify({
          ...alarmData,
          AlarmDescription: "TEAMS=,,,\nPRIORITY=P1", // Commas but no actual team names
        }),
      };

      expect(() => {
        cloudwatchTransformer.transform(customAlarm, mockEnvelope);
      }).toThrow(
        "No valid team names found after parsing comma-delimited list",
      );
    });

    it("should reject too many teams (> 10)", () => {
      const manyTeams = Array.from(
        { length: 11 },
        (_, i) => `team${i + 1}`,
      ).join(", ");
      const payload = {
        ...testGrafanaPayloads.firing,
        alerts: [
          {
            ...testGrafanaPayloads.firing.alerts[0],
            annotations: {
              Priority: "P1",
              Teams: manyTeams,
            },
          },
        ],
      };

      expect(() => {
        grafanaTransformer.transform(payload, mockEnvelope);
      }).toThrow("Too many teams specified (max 10, got 11)");
    });

    it("should reject team names that are too long (> 50 chars)", () => {
      const longTeamName = "a".repeat(51);
      const payload = {
        ...testGrafanaPayloads.firing,
        alerts: [
          {
            ...testGrafanaPayloads.firing.alerts[0],
            annotations: {
              Priority: "P1",
              Teams: longTeamName,
            },
          },
        ],
      };

      expect(() => {
        grafanaTransformer.transform(payload, mockEnvelope);
      }).toThrow("Team name too long (max 50 characters)");
    });
  });
});
