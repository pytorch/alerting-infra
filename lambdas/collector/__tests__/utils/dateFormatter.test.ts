import { describe, it, expect } from "vitest";
import { formatTimestampToPST } from "../../src/utils/dateFormatter";

describe("dateFormatter", () => {
  describe("formatTimestampToPST", () => {
    it("should format UTC timestamp to PST during standard time (winter)", () => {
      // January date - should be PST
      const utcTimestamp = "2025-01-15T19:10:01.000Z";
      const result = formatTimestampToPST(utcTimestamp);

      // Should contain PST and be formatted as "Jan 15, H:MMam/pm PST"
      expect(result).toMatch(/Jan 15, \d{1,2}:\d{2}[ap]m PST/);
      expect(result).toContain("PST");
    });

    it("should format UTC timestamp to PDT during daylight time (summer)", () => {
      // July date - should be PDT
      const utcTimestamp = "2025-07-15T19:10:01.000Z";
      const result = formatTimestampToPST(utcTimestamp);

      // Should contain PDT and be formatted as "Jul 15, H:MMam/pm PDT"
      expect(result).toMatch(/Jul 15, \d{1,2}:\d{2}[ap]m PDT/);
      expect(result).toContain("PDT");
    });

    it("should handle the test data timestamp format correctly", () => {
      // Using the timestamp from our test data
      const utcTimestamp = "2025-09-03T19:10:01.000Z";
      const result = formatTimestampToPST(utcTimestamp);

      // September should be PDT and formatted as "Sep 3, H:MMam/pm PDT"
      expect(result).toMatch(/Sep 3, \d{1,2}:\d{2}[ap]m PDT/);
      expect(result).toContain("PDT");
    });

    it("should convert UTC time correctly to Pacific time", () => {
      // 7 PM UTC should be 11 AM PST in January (UTC-8)
      const utcTimestamp = "2025-01-15T19:10:01.000Z"; // Winter - PST
      const result = formatTimestampToPST(utcTimestamp);

      // 19:10 UTC = 11:10 AM PST in January
      expect(result).toContain("11:10am PST");
    });

    it("should keep the Pacific date for early-morning times", () => {
      // 15:44 UTC is 7:44am PST on the same day, not the day before
      expect(formatTimestampToPST("2026-11-02T15:44:00.000Z")).toBe(
        "Nov 2, 7:44am PST",
      );
      // 07:10 UTC is 12:10am PDT
      expect(formatTimestampToPST("2025-09-03T07:10:00.000Z")).toBe(
        "Sep 3, 12:10am PDT",
      );
    });

    it("should use the previous Pacific date for late-evening times", () => {
      // 03:00 UTC on Nov 3 is still 7:00pm on Nov 2 in PST
      expect(formatTimestampToPST("2026-11-03T03:00:00.000Z")).toBe(
        "Nov 2, 7:00pm PST",
      );
    });

    it("should switch PDT to PST at 2am Pacific, not at midnight UTC", () => {
      // DST ends on Nov 1, 2026 at 2am PDT (09:00 UTC)
      expect(formatTimestampToPST("2026-11-01T08:30:00.000Z")).toBe(
        "Nov 1, 1:30am PDT",
      );
      expect(formatTimestampToPST("2026-11-01T09:30:00.000Z")).toBe(
        "Nov 1, 1:30am PST",
      );
      // DST starts on Mar 8, 2026 at 2am PST (10:00 UTC)
      expect(formatTimestampToPST("2026-03-08T09:30:00.000Z")).toBe(
        "Mar 8, 1:30am PST",
      );
      expect(formatTimestampToPST("2026-03-08T10:30:00.000Z")).toBe(
        "Mar 8, 3:30am PDT",
      );
    });

    it("should handle invalid timestamp gracefully", () => {
      const invalidTimestamp = "not-a-valid-timestamp";
      const result = formatTimestampToPST(invalidTimestamp);

      // Should return the original string when parsing fails
      expect(result).toBe(invalidTimestamp);
    });

    it("should handle empty string gracefully", () => {
      const result = formatTimestampToPST("");

      // Should return the original empty string
      expect(result).toBe("");
    });

    it("should handle timestamps without milliseconds", () => {
      const utcTimestamp = "2025-09-03T19:10:01Z";
      const result = formatTimestampToPST(utcTimestamp);

      expect(result).toMatch(/Sep 3, \d{1,2}:\d{2}[ap]m PDT/);
    });

    it("should format time in 12-hour format with lowercase am/pm", () => {
      // Morning time - 16:30 UTC should be ~9:30 AM PDT in September
      const morningTimestamp = "2025-09-03T16:30:15.000Z";
      const morningResult = formatTimestampToPST(morningTimestamp);
      expect(morningResult).toContain("am");

      // Evening time - 02:30 UTC should be ~7:30 PM PDT (previous day) in September
      const eveningTimestamp = "2025-09-03T02:30:15.000Z";
      const eveningResult = formatTimestampToPST(eveningTimestamp);
      expect(eveningResult).toContain("pm");
    });

    it("should produce the exact desired format", () => {
      // Test the exact format requested: "Sep 3, 12:10pm PST"
      const utcTimestamp = "2025-09-03T19:10:01.000Z"; // Should be 12:10pm PDT in September
      const result = formatTimestampToPST(utcTimestamp);

      // Should match the exact format pattern
      expect(result).toMatch(
        /^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}[ap]m P[DS]T$/,
      );
    });

    it("should correctly handle DST transitions", () => {
      // Test dates around DST transitions in 2025
      // DST starts on March 9, 2025 (second Sunday in March)
      const beforeDST = "2025-03-08T20:00:00.000Z"; // March 8, should be PST
      const afterDST = "2025-03-10T19:00:00.000Z"; // March 10, should be PDT

      const beforeResult = formatTimestampToPST(beforeDST);
      const afterResult = formatTimestampToPST(afterDST);

      expect(beforeResult).toContain("PST");
      expect(afterResult).toContain("PDT");

      // DST ends on November 2, 2025 (first Sunday in November)
      const duringDST = "2025-11-01T19:00:00.000Z"; // November 1, should be PDT
      const afterDSTEnds = "2025-11-03T20:00:00.000Z"; // November 3, should be PST

      const duringResult = formatTimestampToPST(duringDST);
      const afterEndResult = formatTimestampToPST(afterDSTEnds);

      expect(duringResult).toContain("PDT");
      expect(afterEndResult).toContain("PST");
    });
  });
});
